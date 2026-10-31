import type { DeviceSnapshot } from "./types";

/** Codename, marketing name and model codes of Xiaomi 14T Pro (rothko). */
const MODEL_CODES = ["2407fpn8"];

/**
 * System packages the 14T Pro needs to boot, unlock, call, take photos and keep HyperOS intact.
 * Detox and the ad step must never disable these.
 */
export const XIAOMI_KEEP = [
  "com.miui.home",
  "com.miui.powerkeeper",
  "com.miui.securitycenter",
  "com.miui.securityadd",
  "com.xiaomi.joyose",
  "com.miui.daemon",
  "com.android.camera",
  "com.miui.gallery",
  "com.xiaomi.account",
  "com.miui.cloudservice",
  "com.miui.micloudsync",
  "com.android.updater",
  "com.miui.face",
  "com.android.incallui",
  "com.google.android.dialer",
  "com.android.server.telecom",
  "com.miui.aod",
  "com.miui.misound",
  "com.xiaomi.bluetooth",
  "com.miui.global.packageinstaller",
  "com.miui.packageinstaller",
  "com.google.android.setupwizard",
] as const;

/**
 * HyperOS ad, telemetry and promo packages. Disabled for user 0 only; `pm enable` brings them back.
 * Camera, phone, launcher, Joyose (thermal/performance) and PowerKeeper stay installed and enabled.
 */
export const HYPEROS_AD_PACKAGES = [
  "com.facebook.appmanager",
  "com.facebook.services",
  "com.facebook.system",
  "com.mi.android.globalminusscreen",
  "com.mi.globalminusscreen",
  "com.miui.analytics",
  "com.miui.android.fashiongallery",
  "com.miui.bugreport",
  "com.miui.hybrid",
  "com.miui.hybrid.accessory",
  "com.miui.msa.global",
  "com.miui.systemAdSolution",
  "com.xiaomi.barrage",
  "com.xiaomi.discover",
  "com.xiaomi.glgm",
  "com.xiaomi.mipicks",
] as const;

export const XIAOMI_PEAK_HZ = "144";
export const XIAOMI_MIN_HZ = "60";

export function isXiaomi14tPro(device: {
  manufacturer?: string;
  model?: string;
  device?: string;
  marketName?: string;
}): boolean {
  const code = (device.device ?? "").trim().toLowerCase();
  const model = (device.model ?? "").trim().toLowerCase();
  const market = (device.marketName ?? "").trim().toLowerCase();
  const brand = (device.manufacturer ?? "").trim().toLowerCase();
  if (code === "rothko") return true;
  if (MODEL_CODES.some((prefix) => model.replace(/\s+/g, "").includes(prefix))) return true;
  const compact = `${brand} ${model} ${market}`.replace(/\s+/g, "");
  return compact.includes("14tpro");
}

export function hyperPackageScript(mode: "disable" | "enable"): string {
  const packages = HYPEROS_AD_PACKAGES.join(" ");
  if (mode === "disable") {
    return `
disabled=0
skipped=0
failed=0
failed_names=""
for pkg in ${packages}; do
  if ! pm list packages -u "$pkg" 2>/dev/null | grep -qx "package:$pkg"; then
    skipped=$((skipped + 1))
    continue
  fi
  pm disable-user --user 0 "$pkg" >/dev/null 2>&1
  if pm list packages -d "$pkg" 2>/dev/null | grep -qx "package:$pkg"; then
    disabled=$((disabled + 1))
    continue
  fi
  # HyperOS 2 rejects setEnabledSetting for system packages. Hide the app for user 0;
  # the system image stays, and pm install-existing brings it back.
  pm uninstall --user 0 "$pkg" >/dev/null 2>&1
  if pm list packages --user 0 "$pkg" 2>/dev/null | grep -qx "package:$pkg"; then
    failed=$((failed + 1))
    failed_names="$failed_names $pkg"
  else
    disabled=$((disabled + 1))
  fi
done
echo hyper_disabled=$disabled
echo hyper_skipped=$skipped
echo hyper_failed=$failed
echo hyper_failed_names=$failed_names
`.trim();
  }

  return `
enabled=0
skipped=0
failed=0
failed_names=""
for pkg in ${packages}; do
  if ! pm list packages -u "$pkg" 2>/dev/null | grep -qx "package:$pkg"; then
    skipped=$((skipped + 1))
    continue
  fi
  pm install-existing --user 0 "$pkg" >/dev/null 2>&1
  pm enable --user 0 "$pkg" >/dev/null 2>&1
  if pm list packages --user 0 "$pkg" 2>/dev/null | grep -qx "package:$pkg" \
    && ! pm list packages -d "$pkg" 2>/dev/null | grep -qx "package:$pkg"; then
    enabled=$((enabled + 1))
  else
    failed=$((failed + 1))
    failed_names="$failed_names $pkg"
  fi
done
echo hyper_enabled=$enabled
echo hyper_skipped=$skipped
echo hyper_failed=$failed
echo hyper_failed_names=$failed_names
`.trim();
}

export function refreshApplyScript(): string {
  return `
settings put system peak_refresh_rate ${XIAOMI_PEAK_HZ}
settings put system min_refresh_rate ${XIAOMI_MIN_HZ}
settings put system miui_refresh_rate ${XIAOMI_PEAK_HZ}
echo peak=$(settings get system peak_refresh_rate)
echo min=$(settings get system min_refresh_rate)
`.trim();
}

export function refreshRestoreScript(peak?: string, min?: string): string {
  const peakCmd = peak
    ? `settings put system peak_refresh_rate ${peak}`
    : "settings delete system peak_refresh_rate";
  const minCmd = min
    ? `settings put system min_refresh_rate ${min}`
    : "settings delete system min_refresh_rate";
  const miuiCmd = peak
    ? `settings put system miui_refresh_rate ${peak}`
    : "settings delete system miui_refresh_rate";
  return `
${peakCmd}
${minCmd}
${miuiCmd}
echo peak=$(settings get system peak_refresh_rate)
echo min=$(settings get system min_refresh_rate)
`.trim();
}

export function systemLabel(device: Pick<DeviceSnapshot, "osName" | "osBuild" | "android">): string {
  if (device.osName) {
    const build = device.osBuild ? ` ${device.osBuild}` : "";
    const android = device.android ? ` · Android ${device.android}` : "";
    return `${device.osName}${build}${android}`;
  }
  return device.android ? `Android ${device.android}` : "Android";
}

export function refreshPhrase(peak: string, min: string): string | null {
  const peakHz = Number(peak);
  const minHz = Number(min);
  const peakOk = peak.trim() !== "" && peak !== "null" && Number.isFinite(peakHz);
  const minOk = min.trim() !== "" && min !== "null" && Number.isFinite(minHz);
  if (!peakOk) return null;
  if (!minOk) return `${peakHz.toLocaleString("uk-UA")} Гц`;
  return `${peakHz.toLocaleString("uk-UA")} / ${minHz.toLocaleString("uk-UA")} Гц`;
}
