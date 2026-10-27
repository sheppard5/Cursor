export const DEFAULT_HOST = "192.168.1.83";
export const DEFAULT_PORT = 5555;

export type OptimizeOptions = {
  animations: boolean;
  scans: boolean;
  adaptiveBattery: boolean;
  trimCaches: boolean;
  dexopt: boolean;
  fstrim: boolean;
  memoryLimit: boolean;
  screenTimeout: boolean;
};

export const defaultOptions: OptimizeOptions = {
  animations: true,
  scans: true,
  adaptiveBattery: true,
  trimCaches: true,
  dexopt: true,
  fstrim: true,
  memoryLimit: false,
  screenTimeout: false,
};

export type BatteryStatus = "charging" | "discharging" | "full" | "unknown";

export type ProcessInfo = {
  name: string;
  label: string;
  pssKb: number;
};

export type DeviceSnapshot = {
  serial: string;
  manufacturer: string;
  model: string;
  device: string;
  android: string;
  sdk: string;
  build: string;
  abi: string;
  memTotalKb: number;
  memAvailableKb: number;
  swapTotalKb: number;
  storageTotalKb: number;
  storageUsedKb: number;
  storageAvailKb: number;
  batteryLevel: number | null;
  batteryScale: number;
  batteryTempC: number | null;
  batteryStatus: BatteryStatus;
  plugged: boolean;
  uptimeSec: number;
  userPackages: number;
  systemPackages: number;
  animations: {
    window: string;
    transition: string;
    animator: string;
  };
  wifiScanAlways: string;
  bleScanAlways: string;
  adaptiveBattery: string;
  backgroundProcessLimit: string;
  screenOffTimeoutMs: string;
  processes: ProcessInfo[];
};

export type StepResult = {
  id: string;
  title: string;
  ok: boolean;
  detail: string;
};

export type ConnectStatus = "connected" | "unauthorized" | "offline" | "refused";

export type Endpoint = {
  host: string;
  port: number;
  serial: string;
};
