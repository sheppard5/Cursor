import type { BatteryStatus, DeviceSnapshot, ProcessInfo } from "./types";

export const AUDIT_SCRIPT = `
echo @@PROP@@
echo manufacturer=$(getprop ro.product.manufacturer)
echo model=$(getprop ro.product.model)
echo device=$(getprop ro.product.device)
echo android=$(getprop ro.build.version.release)
echo sdk=$(getprop ro.build.version.sdk)
echo build=$(getprop ro.build.display.id)
echo abi=$(getprop ro.product.cpu.abi)
echo @@MEM@@
cat /proc/meminfo
echo @@DF@@
df -k /data
echo @@BAT@@
dumpsys battery
echo @@SET@@
echo window=$(settings get global window_animation_scale)
echo transition=$(settings get global transition_animation_scale)
echo animator=$(settings get global animator_duration_scale)
echo wifi_scan=$(settings get global wifi_scan_always_enabled)
echo ble_scan=$(settings get global ble_scan_always_enabled)
echo adaptive=$(settings get global adaptive_battery_management_enabled)
echo standby=$(settings get global app_standby_enabled)
echo bg_limit=$(settings get global background_process_limit)
echo screen_timeout=$(settings get system screen_off_timeout)
echo @@PKG@@
echo user=$(pm list packages -3 | wc -l)
echo system=$(pm list packages -s | wc -l)
echo @@PSS@@
dumpsys meminfo | grep -A 16 "Total PSS by process:" | head -n 16
echo @@UP@@
cat /proc/uptime
echo @@END@@
`.trim();

const PROCESS_LABELS: Record<string, string> = {
  system: "Система",
  surfaceflinger: "Композитор екрана",
  "com.android.systemui": "Системний інтерфейс",
  "com.android.bluetooth": "Bluetooth",
  "com.android.launcher3": "Домашній екран",
  "com.google.android.apps.nexuslauncher": "Домашній екран",
  "com.sec.android.app.launcher": "Домашній екран",
  "com.google.android.gms": "Сервіси Google",
  "com.google.android.gms.persistent": "Сервіси Google",
  "com.android.vending": "Play Маркет",
  "com.android.chrome": "Chrome",
  "com.google.android.youtube": "YouTube",
  "com.android.settings": "Налаштування",
  "com.google.android.googlequicksearchbox": "Google",
};

function section(raw: string, name: string): string {
  const match = raw.match(new RegExp(`@@${name}@@\\n([\\s\\S]*?)(?=\\n@@|$)`));
  return (match?.[1] ?? "").replace(/\r/g, "").trim();
}

function field(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}=(.*)$`, "m"));
  return (match?.[1] ?? "").trim();
}

function memKb(block: string, key: string): number {
  const match = block.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
  return match ? Number(match[1]) : 0;
}

function batteryField(block: string, key: string): string {
  const match = block.match(new RegExp(`^\\s*${key}:\\s*(.*)$`, "m"));
  return (match?.[1] ?? "").trim();
}

function integerOrNull(value: string): number | null {
  if (!value || value === "null") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function countField(block: string, key: string): number {
  const numeric = integerOrNull(field(block, key).trim());
  if (numeric == null) return 0;
  return Math.max(0, Math.round(numeric));
}

function batteryStatus(code: string): BatteryStatus {
  if (code === "2") return "charging";
  if (code === "3" || code === "4") return "discharging";
  if (code === "5") return "full";
  return "unknown";
}

function parseStorage(block: string): { total: number; used: number; avail: number } {
  const line = block
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.includes("/data") && !row.toLowerCase().startsWith("filesystem"));
  if (!line) return { total: 0, used: 0, avail: 0 };
  const parts = line.split(/\s+/);
  const numbers = parts.map((part) => Number(part)).filter((part) => Number.isFinite(part));
  return {
    total: numbers[0] ?? 0,
    used: numbers[1] ?? 0,
    avail: numbers[2] ?? 0,
  };
}

function processLabel(name: string): string {
  return PROCESS_LABELS[name] ?? name;
}

export function parseProcesses(block: string): ProcessInfo[] {
  const items: ProcessInfo[] = [];
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*([\d,]+)K:\s+(\S+)/);
    if (!match) continue;
    const pssKb = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(pssKb)) continue;
    const name = match[2];
    items.push({ name, label: processLabel(name), pssKb });
  }
  return items.sort((a, b) => b.pssKb - a.pssKb).slice(0, 8);
}

export function parseAudit(raw: string, serial: string): DeviceSnapshot {
  const prop = section(raw, "PROP");
  const mem = section(raw, "MEM");
  const storage = parseStorage(section(raw, "DF"));
  const battery = section(raw, "BAT");
  const settings = section(raw, "SET");
  const packages = section(raw, "PKG");
  const uptime = Number(section(raw, "UP").split(/\s+/)[0]);
  const level = integerOrNull(batteryField(battery, "level"));
  const temperature = integerOrNull(batteryField(battery, "temperature"));
  const powered = ["AC powered", "USB powered", "Wireless powered", "Dock powered"].some(
    (key) => batteryField(battery, key) === "true",
  );

  return {
    serial,
    manufacturer: field(prop, "manufacturer"),
    model: field(prop, "model"),
    device: field(prop, "device"),
    android: field(prop, "android"),
    sdk: field(prop, "sdk"),
    build: field(prop, "build"),
    abi: field(prop, "abi"),
    memTotalKb: memKb(mem, "MemTotal"),
    memAvailableKb: memKb(mem, "MemAvailable"),
    swapTotalKb: memKb(mem, "SwapTotal"),
    storageTotalKb: storage.total,
    storageUsedKb: storage.used,
    storageAvailKb: storage.avail,
    batteryLevel: level,
    batteryScale: integerOrNull(batteryField(battery, "scale")) ?? 100,
    batteryTempC: temperature == null ? null : temperature / 10,
    batteryStatus: batteryStatus(batteryField(battery, "status")),
    plugged: powered,
    uptimeSec: Number.isFinite(uptime) ? Math.round(uptime) : 0,
    userPackages: countField(packages, "user"),
    systemPackages: countField(packages, "system"),
    animations: {
      window: field(settings, "window"),
      transition: field(settings, "transition"),
      animator: field(settings, "animator"),
    },
    wifiScanAlways: field(settings, "wifi_scan"),
    bleScanAlways: field(settings, "ble_scan"),
    adaptiveBattery: field(settings, "adaptive"),
    backgroundProcessLimit: field(settings, "bg_limit"),
    screenOffTimeoutMs: field(settings, "screen_timeout"),
    processes: parseProcesses(section(raw, "PSS")),
  };
}
