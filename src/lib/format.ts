import type { BatteryStatus, DeviceSnapshot } from "./types";

export function formatKb(kb: number): string {
  if (!Number.isFinite(kb) || kb <= 0) return "—";
  const gb = kb / 1024 / 1024;
  if (gb >= 1) {
    return `${gb.toLocaleString("uk-UA", {
      maximumFractionDigits: 1,
      minimumFractionDigits: gb < 10 ? 1 : 0,
    })} ГБ`;
  }
  return `${Math.round(kb / 1024).toLocaleString("uk-UA")} МБ`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} д ${hours} год`;
  if (hours > 0) return `${hours} год ${minutes} хв`;
  return `${minutes} хв`;
}

export function formatTemp(celsius: number | null): string {
  if (celsius == null || !Number.isFinite(celsius)) return "—";
  return `${celsius.toLocaleString("uk-UA", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}°C`;
}

export function usedPercent(used: number, total: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

function niceToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return trimmed;
}

export function deviceTitle(manufacturer: string, model: string): string {
  const brand = niceToken(manufacturer);
  const name = model.trim();
  if (!brand && !name) return "Android-планшет";
  if (!brand) return name;
  if (!name) return brand;
  if (name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}

export function batteryPhrase(
  status: BatteryStatus,
  plugged: boolean,
  level: number | null,
): string {
  const percent = level == null ? "—" : `${level}%`;
  if (status === "full") return `${percent} · повна`;
  if (status === "charging" || plugged) return `${percent} · заряджається`;
  if (status === "discharging") return `${percent} · від акумулятора`;
  return `${percent}`;
}

export function adviceFor(device: DeviceSnapshot): string[] {
  const notes: string[] = [];
  if (device.storageTotalKb > 0 && device.storageUsedKb / device.storageTotalKb >= 0.9) {
    notes.push(
      "Сховище заповнене більш ніж на 90%. Очищення кешу звільнить трохи місця, великі файли треба прибрати вручну.",
    );
  }
  if (device.memTotalKb > 0 && device.memAvailableKb / device.memTotalKb < 0.12) {
    notes.push(
      "Вільної оперативної пам’яті майже немає. Закрийте важкі програми. Ліміт фонових процесів умикайте, лише якщо планшет постійно смикається.",
    );
  }
  if (device.batteryLevel != null && device.batteryLevel < 20 && !device.plugged) {
    notes.push("Заряд нижче 20%, живлення не підключене. Компіляцію програм краще вимкнути до зарядки.");
  }
  const sdk = Number(device.sdk);
  if (Number.isFinite(sdk) && sdk > 0 && sdk < 28) {
    notes.push("Це Android старіший за 9. Адаптивна батарея може не підтримуватись, решта кроків усе одно застосується.");
  }
  const animation = Number(device.animations.window);
  if (Number.isFinite(animation) && animation > 0 && animation <= 0.5) {
    notes.push("Анімації вже скорочені. Повторне застосування просто підтвердить це.");
  }
  return notes;
}

export function formatReport(device: DeviceSnapshot): string {
  return [
    deviceTitle(device.manufacturer, device.model),
    `Android ${device.android || "—"} · SDK ${device.sdk || "—"} · ${device.abi || "—"}`,
    `Батарея: ${batteryPhrase(device.batteryStatus, device.plugged, device.batteryLevel)} · ${formatTemp(device.batteryTempC)}`,
    `Пам’ять: ${formatKb(device.memAvailableKb)} вільно з ${formatKb(device.memTotalKb)}`,
    `Сховище: ${formatKb(device.storageAvailKb)} вільно з ${formatKb(device.storageTotalKb)}`,
    `Анімації: ${device.animations.window || "—"}×`,
    `Працює: ${formatUptime(device.uptimeSec)}`,
  ].join("\n");
}
