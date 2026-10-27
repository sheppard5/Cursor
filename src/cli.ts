import QRCode from "qrcode";
import { formatReport } from "./lib/format";
import { buildOptimizePlan, buildRestorePlan, renderScript } from "./lib/plan";
import {
  applyOptimize,
  connectDevice,
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
  console.log("На планшеті: Бездротове налагодження → Сполучити пристрій через QR-код.");
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

  if (has("--help")) {
    console.log(`Оптимізація Android-планшета через adb.

  npm run optimize -- --host 192.168.1.83 --port 41555
  npm run optimize -- --qr
  npm run optimize -- --dry-run
  npm run optimize -- --pair-port 37123 --code 123456 --port 41555
  npm run optimize -- --restore

За замовчуванням: коротші анімації, менше сканування, адаптивна батарея,
очищення кешу, черга ART і fstrim. Програми й файли не видаляються.

--qr показує QR як у Android Studio: на планшеті відкрийте
«Сполучити пристрій через QR-код» і наведіть камеру на термінал.
`);
    return;
  }

  if (has("--dry-run")) {
    const plan = has("--restore") ? buildRestorePlan(flag("--screen-timeout")) : buildOptimizePlan(options);
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
    const result = await restoreDevice(host, port, flag("--screen-timeout"));
    printSteps(result.results);
    if (result.device) console.log(`\n${formatReport(result.device)}`);
    if (!result.results.every((step) => step.ok)) process.exitCode = 1;
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
