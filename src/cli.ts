import QRCode from "qrcode";
import { formatReport } from "./lib/format";
import { sanitizeRefresh } from "./lib/endpoint";
import { buildOptimizePlan, buildRestorePlan, renderScript, type RefreshRestore } from "./lib/plan";
import {
  applyOptimize,
  connectDevice,
  detoxDevice,
  pairDevice,
  pollQrPairing,
  readDevice,
  restoreDevice,
  startQrPairing,
  stopQrPairing,
} from "./lib/tuner";
import { defaultOptions, DEFAULT_HOST, DEFAULT_PORT, type OptimizeOptions } from "./lib/types";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

function refreshFromArgs(): RefreshRestore | undefined {
  if (!has("--peak") && !has("--min")) return undefined;
  const peak = sanitizeRefresh(flag("--peak"));
  const min = sanitizeRefresh(flag("--min"));
  if (!has("--peak") || !has("--min") || !peak.ok || !min.ok || peak.value == null || min.value == null) {
    throw new Error("Для відновлення частоти передайте обидва прапорці, наприклад --peak 120 --min 60.");
  }
  return { peak: peak.value, min: min.value };
}

function printSteps(results: { ok: boolean; title: string; detail: string }[]) {
  for (const step of results) {
    console.log(`${step.ok ? "ок" : "ні"}  ${step.title} — ${step.detail}`);
  }
}

async function pairWithQr() {
  const started = await startQrPairing();
  console.log(started.message);
  console.log("");
  console.log(await QRCode.toString(started.payload, { type: "terminal", small: true }));
  console.log(`payload: ${started.payload}`);
  console.log("На телефоні: Бездротове налагодження → Сполучити пристрій через QR-код.");
  console.log("");

  try {
    while (Date.now() < started.expiresAt) {
      const polled = await pollQrPairing(started.sessionId);
      process.stdout.write(`\r${polled.message}`.padEnd(100));
      if (polled.status === "waiting") {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      console.log("");
      console.log(polled.message);
      if ("host" in polled && polled.host) {
        return { host: polled.host, port: polled.port };
      }
      return null;
    }
    throw new Error("QR уже недійсний. Запустіть ще раз.");
  } catch (error) {
    await stopQrPairing(started.sessionId);
    throw error;
  }
}

async function main() {
  let host = flag("--host") ?? DEFAULT_HOST;
  let port = Number(flag("--port") ?? DEFAULT_PORT);
  const options: OptimizeOptions = {
    ...defaultOptions,
    memoryLimit: has("--with-memory-limit"),
    screenTimeout: has("--with-screen-timeout"),
  };
  if (has("--no-xiaomi")) {
    options.refresh = false;
    options.appFreezer = false;
    options.doze = false;
    options.hyperAds = false;
  }

  if (has("--help")) {
    console.log(`Оптимізація Xiaomi 14T Pro через adb.

  npm run optimize -- --host 192.168.1.20 --port 41555
  npm run optimize -- --qr
  npm run optimize -- --dry-run
  npm run optimize -- --no-xiaomi
  npm run optimize -- --pair-port 37123 --code 123456 --port 41555
  npm run optimize -- --restore --peak 120 --min 60
  npm run optimize -- --detox --host 192.168.1.20 --port 44853
  npm run optimize -- --detox-dry-run --host 192.168.1.20 --port 44853

За замовчуванням для 14T Pro: анімації 0,5×, менше сканування, адаптивна батарея,
екран 144/60 Гц, заморозка кешу, Doze, вимкнення реклами HyperOS, очищення кешу,
черга ART і fstrim. Камера, дзвінки, лаунчер і Joyose не чіпаються.
Програми й файли не видаляються.

--no-xiaomi прибирає кроки частоти, сну й реклами HyperOS.
--qr показує QR як у Android Studio: на телефоні відкрийте
«Сполучити пристрій через QR-код» і наведіть камеру на термінал.

--detox вимикає/знімає відомі рекламні й шпигунські пакети (Settings, GMS, камеру не чіпає).
`);
    return;
  }

  if (has("--dry-run") && !has("--detox") && !has("--detox-dry-run")) {
    const plan = has("--restore")
      ? buildRestorePlan(flag("--screen-timeout"), refreshFromArgs())
      : buildOptimizePlan(options);
    console.log(renderScript(plan));
    return;
  }

  if (has("--qr")) {
    const paired = await pairWithQr();
    if (!paired?.port) {
      process.exitCode = 1;
      return;
    }
    host = paired.host;
    port = paired.port;
    if (has("--pair-only")) return;
  } else if (flag("--pair-port")) {
    const paired = await pairDevice(host, Number(flag("--pair-port")), flag("--code") ?? "");
    console.log(paired.message);
  }

  if (has("--restore")) {
    const result = await restoreDevice(host, port, flag("--screen-timeout"), refreshFromArgs());
    printSteps(result.results);
    if (result.device) console.log(`\n${formatReport(result.device)}`);
    if (!result.results.every((step) => step.ok)) process.exitCode = 1;
    return;
  }

  if (has("--detox") || has("--detox-dry-run")) {
    const result = await detoxDevice(host, port, has("--detox-dry-run") || has("--dry-run"));
    if (result.targets.length === 0) {
      console.log("Кандидатів реклами/шпигунства з відомого списку не знайдено.");
      return;
    }
    for (const target of result.targets) {
      console.log(`${target.action}\t${target.packageName}\t${target.reason}`);
    }
    if (result.dryRun) {
      console.log("\nDry-run: нічого не змінено. Запустіть без --detox-dry-run, щоб застосувати.");
      return;
    }
    console.log("\nГотово. Перезавантажте телефон: adb reboot");
    return;
  }

  const connection = await connectDevice(host, port);
  if (connection.status !== "connected") {
    console.error(connection.message);
    process.exitCode = 1;
    return;
  }

  console.log(connection.message);
  console.log(formatReport(await readDevice(host, port)));
  console.log("");
  const result = await applyOptimize(host, port, options);
  printSteps(result.results);
  if (result.device) console.log(`\n${formatReport(result.device)}`);
  if (!result.results.every((step) => step.ok)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Невідома помилка");
  process.exitCode = 1;
});
