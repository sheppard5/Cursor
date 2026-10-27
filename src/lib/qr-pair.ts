import { randomInt } from "node:crypto";
import { isPrivateIpv4 } from "./endpoint";
import { TunerError } from "./errors";

export const QR_SESSION_TTL_MS = 120_000;
export const PAIRING_SERVICE = "_adb-tls-pairing._tcp";
export const CONNECT_SERVICE = "_adb-tls-connect._tcp";

export type QrCredentials = {
  serviceName: string;
  password: string;
  payload: string;
};

export type MdnsService = {
  name: string;
  type: string;
  host: string;
  port: number;
};

const NAME_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomToken(length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += NAME_ALPHABET[randomInt(NAME_ALPHABET.length)];
  }
  return value;
}

export function createQrCredentials(): QrCredentials {
  const serviceName = `studio-${randomToken(10)}`;
  const password = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return {
    serviceName,
    password,
    payload: `WIFI:T:ADB;S:${serviceName};P:${password};;`,
  };
}

export function parseAdbWifiPayload(raw: string): QrCredentials {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!/^WIFI:/i.test(trimmed)) {
    throw new TunerError("Це не QR сполучення ADB. Очікується рядок WIFI:T:ADB;…", 400);
  }
  const fields: Record<string, string> = {};
  for (const part of trimmed.slice(5).split(";")) {
    if (!part) continue;
    const separator = part.indexOf(":");
    if (separator <= 0) continue;
    fields[part.slice(0, separator).toUpperCase()] = part.slice(separator + 1);
  }
  if ((fields.T ?? "").toUpperCase() !== "ADB") {
    throw new TunerError("QR має містити T:ADB — це сполучення бездротового налагодження.", 400);
  }
  const serviceName = fields.S?.trim() ?? "";
  const password = fields.P?.trim() ?? "";
  if (!serviceName || !/^studio-[A-Za-z0-9]+$/.test(serviceName)) {
    throw new TunerError("У QR немає коректної назви служби studio-…", 400);
  }
  if (!/^\d{6}$/.test(password)) {
    throw new TunerError("У QR немає 6-значного коду сполучення.", 400);
  }
  return {
    serviceName,
    password,
    payload: `WIFI:T:ADB;S:${serviceName};P:${password};;`,
  };
}

function normalizeServiceType(type: string): string {
  return type.trim().replace(/\.$/, "").toLowerCase();
}

export function parseMdnsServices(raw: string): MdnsService[] {
  const services: MdnsService[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /list of discovered/i.test(trimmed)) continue;
    const match = trimmed.match(/^(\S+)\s+(\S+)\s+(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\s*$/);
    if (!match) continue;
    const host = match[3];
    const port = Number(match[4]);
    if (!isPrivateIpv4(host)) continue;
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    services.push({
      name: match[1],
      type: normalizeServiceType(match[2]),
      host,
      port,
    });
  }
  return services;
}

export function findPairingService(services: MdnsService[], serviceName: string): MdnsService | null {
  return (
    services.find(
      (service) =>
        service.name === serviceName &&
        (service.type === PAIRING_SERVICE || service.type.startsWith("_adb-tls-pairing")),
    ) ?? null
  );
}

export function findConnectService(services: MdnsService[], host: string): MdnsService | null {
  return (
    services.find(
      (service) =>
        service.host === host &&
        (service.type === CONNECT_SERVICE || service.type.startsWith("_adb-tls-connect")),
    ) ?? null
  );
}
