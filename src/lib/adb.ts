import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TunerError } from "./errors";
import type { ConnectStatus } from "./types";

const execFileAsync = promisify(execFile);

export type AdbResult = {
  stdout: string;
  stderr: string;
  code: number;
  timedOut: boolean;
};

function adbPath(): string {
  return process.env.ADB_PATH || "adb";
}

export async function runAdb(args: string[], timeoutMs: number): Promise<AdbResult> {
  try {
    const { stdout, stderr } = await execFileAsync(adbPath(), args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, ADB_MDNS_AUTO_CONNECT: "0" },
      windowsHide: true,
    });
    return { stdout: String(stdout), stderr: String(stderr), code: 0, timedOut: false };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };
    if (failure.code === "ENOENT") {
      throw new TunerError(
        "На цьому комп’ютері немає команди adb. Встановіть android-platform-tools і запустіть оптимізатор знову.",
        500,
      );
    }
    const timedOut = Boolean(failure.killed) || failure.signal === "SIGTERM";
    return {
      stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? ""),
      code: typeof failure.code === "number" ? failure.code : timedOut ? 124 : 1,
      timedOut,
    };
  }
}

export async function adbVersion(): Promise<string> {
  const result = await runAdb(["version"], 5000);
  if (result.code !== 0 && !result.stdout) {
    throw new TunerError("Не вдалося запустити adb.", 500);
  }
  const version = result.stdout.match(/^Version\s+(\S+)/m);
  return version?.[1] ?? result.stdout.split("\n")[0]?.trim() ?? "adb";
}

export function interpretConnect(
  connectOut: string,
  devicesOut: string,
  serial: string,
): { status: ConnectStatus; message: string } {
  const combined = `${connectOut}\n${devicesOut}`;
  if (combined.includes("@@TIMEOUT@@")) {
    return {
      status: "offline",
      message: `Немає відповіді від ${serial}. Оптимізатор має працювати на комп’ютері в тій самій Wi-Fi мережі, що й планшет.`,
    };
  }

  const line = devicesOut
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.startsWith(serial));
  const state = line?.split(/\s+/)[1];

  if (state === "device") {
    return { status: "connected", message: `Підключено до ${serial}.` };
  }
  if (state === "unauthorized") {
    return {
      status: "unauthorized",
      message: "Планшет бачить комп’ютер, але ще не довіряє йому. Підтвердьте налагодження на екрані або сполучіть пристрій кодом.",
    };
  }
  if (state === "offline") {
    return {
      status: "offline",
      message: "Планшет з’явився в ADB як offline. Вимкніть бездротове налагодження і ввімкніть його знову.",
    };
  }

  const blob = connectOut.toLowerCase();
  if (blob.includes("refused")) {
    return {
      status: "refused",
      message: `Порт ${serial} закритий. На планшеті відкрийте «Бездротове налагодження» і візьміть актуальний порт з рядка «IP-адреса й порт».`,
    };
  }
  if (
    blob.includes("no route") ||
    blob.includes("unreachable") ||
    blob.includes("timed out") ||
    blob.includes("timeout")
  ) {
    return {
      status: "offline",
      message: `Немає маршруту до ${serial}. Запустіть оптимізатор на комп’ютері в мережі планшета.`,
    };
  }

  const leftover = connectOut.trim();
  return {
    status: "offline",
    message: leftover || `Не вдалося підключитися до ${serial}.`,
  };
}
