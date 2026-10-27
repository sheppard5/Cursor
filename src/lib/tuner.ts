import QRCode from "qrcode";
import { adbVersion, interpretConnect, runAdb } from "./adb";
import { parsePackageList, planDetox, renderDetoxShell, type DetoxTarget } from "./detox";
import { assertPairCode, parseEndpoint, sanitizeTimeout } from "./endpoint";
import { TunerError } from "./errors";
import { AUDIT_SCRIPT, parseAudit } from "./parse";
import { buildOptimizePlan, buildRestorePlan, parseStepOutput, renderScript } from "./plan";
import { findConnectService, findPairingService, parseMdnsServices } from "./qr-pair";
import { cancelQrSession, completeQrSession, createQrSession, getQrSession } from "./qr-session";
import type { DeviceSnapshot, OptimizeOptions, StepResult } from "./types";

async function shell(serial: string, script: string, timeoutMs: number): Promise<string> {
  const result = await runAdb(["-s", serial, "shell", script], timeoutMs);
  const blob = `${result.stdout}\n${result.stderr}`;
  if (result.timedOut) {
    throw new TunerError("Планшет не відповів вчасно. Перевірте, що екран розблоковано і Wi-Fi не заснув.", 504);
  }
  if (/unauthorized/i.test(blob)) {
    throw new TunerError("Планшет відхилив сесію ADB. Підтвердьте комп’ютер на екрані.", 409);
  }
  if (/device offline/i.test(blob)) {
    throw new TunerError("Планшет перейшов у стан offline. Увімкніть бездротове налагодження ще раз.", 409);
  }
  if (/device '.+' not found/i.test(blob) || /no devices/i.test(blob)) {
    throw new TunerError("ADB втратив планшет посеред команди. Підключіться знову.", 409);
  }
  return blob;
}

export async function connectDevice(host: string, port: number) {
  const endpoint = parseEndpoint(host, port);
  await runAdb(["start-server"], 8000);
  const connected = await runAdb(["connect", endpoint.serial], 8000);
  const devices = await runAdb(["devices", "-l"], 8000);
  const connectOut = connected.timedOut
    ? "@@TIMEOUT@@"
    : `${connected.stdout}\n${connected.stderr}`;
  const interpreted = interpretConnect(connectOut, `${devices.stdout}\n${devices.stderr}`, endpoint.serial);
  if (interpreted.status !== "connected" && interpreted.status !== "unauthorized") {
    await runAdb(["disconnect", endpoint.serial], 4000);
  }
  return { ...endpoint, ...interpreted };
}

export async function pairDevice(host: string, pairPort: number, code: string) {
  const endpoint = parseEndpoint(host, pairPort);
  const pairCode = assertPairCode(code);
  await runAdb(["start-server"], 8000);
  const result = await runAdb(["pair", endpoint.serial, pairCode], 15000);
  const blob = result.timedOut ? "@@TIMEOUT@@" : `${result.stdout}\n${result.stderr}`;
  if (/successfully paired/i.test(blob)) {
    return {
      ok: true as const,
      message: `Сполучено з ${endpoint.host}. Тепер впишіть порт з рядка «IP-адреса й порт» і зчитайте стан.`,
    };
  }
  if (blob.includes("@@TIMEOUT@@") || /timed out|timeout|no route|unreachable/i.test(blob)) {
    throw new TunerError(
      "Порт сполучення не відповідає. Він дійсний, лише поки на планшеті відкрите вікно з кодом.",
      409,
    );
  }
  if (/failed|incorrect|wrong|error/i.test(blob)) {
    throw new TunerError("Сполучення не вдалося. Відкрийте новий код на планшеті й спробуйте ще раз.", 400);
  }
  throw new TunerError(blob.trim().slice(0, 240) || "Сполучення не вдалося.", 400);
}

async function listMdnsServices() {
  await runAdb(["start-server"], 8000);
  const result = await runAdb(["mdns", "services"], 8000);
  if (result.timedOut) {
    throw new TunerError("ADB не встиг опитати mDNS. Перевірте, що Wi-Fi не блокує multicast.", 504);
  }
  return parseMdnsServices(`${result.stdout}\n${result.stderr}`);
}

async function connectAfterPair(host: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const services = await listMdnsServices();
    const connect = findConnectService(services, host);
    if (connect) {
      const connection = await connectDevice(connect.host, connect.port);
      if (connection.status === "connected" || connection.status === "unauthorized") {
        return connection;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return null;
}

export async function startQrPairing() {
  const session = createQrSession();
  const qrDataUrl = await QRCode.toDataURL(session.payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 560,
    color: { dark: "#1A1E14", light: "#F3F7E4" },
  });
  return {
    ok: true as const,
    sessionId: session.id,
    payload: session.payload,
    serviceName: session.serviceName,
    expiresAt: session.expiresAt,
    qrDataUrl,
    message: "На планшеті відкрийте «Сполучити пристрій через QR-код» і наведіть камеру на цей код.",
  };
}

export async function pollQrPairing(sessionId: string) {
  const session = getQrSession(sessionId);
  const services = await listMdnsServices();
  const pairing = findPairingService(services, session.serviceName);
  if (!pairing) {
    return {
      ok: true as const,
      status: "waiting" as const,
      expiresAt: session.expiresAt,
      message: "Чекаю, поки планшет зчитає QR і з’явиться в мережі…",
    };
  }

  const paired = await pairDevice(pairing.host, pairing.port, session.password);
  const connected = await connectAfterPair(pairing.host);
  completeQrSession(session.id);

  if (connected && (connected.status === "connected" || connected.status === "unauthorized")) {
    return {
      ok: true as const,
      status: connected.status === "connected" ? ("connected" as const) : ("unauthorized" as const),
      host: connected.host,
      port: connected.port,
      expiresAt: session.expiresAt,
      message:
        connected.status === "connected"
          ? `Сполучено через QR і підключено до ${connected.serial}. Можна зчитати стан.`
          : `Сполучено через QR. Підтвердьте налагодження на екрані планшета, потім зчитайте стан (${connected.serial}).`,
    };
  }

  return {
    ok: true as const,
    status: "paired" as const,
    host: pairing.host,
    port: null,
    expiresAt: session.expiresAt,
    message: `${paired.message} Порт сполучення вже закрився — візьміть порт з рядка «IP-адреса й порт».`,
  };
}

export function stopQrPairing(sessionId: string) {
  cancelQrSession(sessionId);
  return { ok: true as const };
}

async function requireConnected(host: string, port: number) {
  const connection = await connectDevice(host, port);
  if (connection.status !== "connected") {
    throw new TunerError(connection.message, 409);
  }
  return connection;
}

export async function readDevice(host: string, port: number): Promise<DeviceSnapshot> {
  const connection = await requireConnected(host, port);
  const raw = await shell(connection.serial, AUDIT_SCRIPT, 30_000);
  return parseAudit(raw, connection.serial);
}

export async function applyPlan(
  host: string,
  port: number,
  steps: ReturnType<typeof buildOptimizePlan>,
): Promise<{ results: StepResult[]; device: DeviceSnapshot | null }> {
  if (steps.length === 0) {
    throw new TunerError("Оберіть хоча б один крок.", 400);
  }
  const connection = await requireConnected(host, port);
  const raw = await shell(connection.serial, renderScript(steps), 90_000);
  const results = parseStepOutput(raw, steps);
  let device: DeviceSnapshot | null = null;
  try {
    device = parseAudit(await shell(connection.serial, AUDIT_SCRIPT, 30_000), connection.serial);
  } catch {
    device = null;
  }
  return { results, device };
}

export async function applyOptimize(host: string, port: number, options: OptimizeOptions) {
  return applyPlan(host, port, buildOptimizePlan(options));
}

export async function restoreDevice(host: string, port: number, screenOffTimeoutMs: unknown) {
  const timeout = sanitizeTimeout(screenOffTimeoutMs);
  return applyPlan(host, port, buildRestorePlan(timeout));
}

export async function health() {
  const version = await adbVersion();
  return { ok: true as const, adb: true, version };
}

export async function detoxDevice(host: string, port: number, dryRun = false) {
  const connection = await connectDevice(host, port);
  if (connection.status !== "connected") {
    throw new TunerError(connection.message, 409);
  }
  const allRaw = await shell(connection.serial, "pm list packages", 30_000);
  const userRaw = await shell(connection.serial, "pm list packages -3", 30_000);
  const targets = planDetox(parsePackageList(allRaw), parsePackageList(userRaw));
  if (dryRun || targets.length === 0) {
    return { ok: true as const, dryRun: true as const, targets, raw: "" };
  }
  const raw = await shell(connection.serial, renderDetoxShell(targets), 120_000);
  return { ok: true as const, dryRun: false as const, targets, raw };
}

export type { DetoxTarget };
