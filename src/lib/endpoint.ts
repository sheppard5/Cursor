import { TunerError } from "./errors";
import type { Endpoint } from "./types";

function octet(part: string): number | null {
  if (!/^\d{1,3}$/.test(part)) return null;
  if (part.length > 1 && part.startsWith("0")) return null;
  const value = Number(part);
  if (value > 255) return null;
  return value;
}

export function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const numbers = parts.map(octet);
  if (numbers.some((part) => part == null)) return false;
  const [a, b] = numbers as number[];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function parseEndpoint(host: string, port: number): Endpoint {
  const normalized = host.trim();
  if (!isPrivateIpv4(normalized)) {
    throw new TunerError(
      "Можна вказати лише адресу локальної мережі: 192.168.x.x, 10.x.x.x, 172.16–31.x.x або 127.0.0.1.",
      400,
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TunerError("Порт має бути цілим числом від 1 до 65535.", 400);
  }
  return { host: normalized, port, serial: `${normalized}:${port}` };
}

export function assertPairCode(code: string): string {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) {
    throw new TunerError("Код сполучення — це 6 цифр з екрана планшета.", 400);
  }
  return normalized;
}

export function sanitizeTimeout(value: unknown): string | undefined {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(numeric)) return undefined;
  if (numeric < 15_000 || numeric > 30 * 60 * 1000) return undefined;
  return String(numeric);
}
