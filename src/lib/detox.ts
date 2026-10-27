/** Packages we never disable or uninstall — tablet must keep booting and stay usable. */
export const NEVER_TOUCH = [
  "android",
  "com.android.systemui",
  "com.android.settings",
  "com.android.phone",
  "com.android.providers.settings",
  "com.android.providers.media",
  "com.android.providers.downloads",
  "com.android.providers.contacts",
  "com.android.providers.calendar",
  "com.android.providers.telephony",
  "com.android.launcher",
  "com.android.launcher3",
  "com.android.inputmethod",
  "com.android.keychain",
  "com.android.bluetooth",
  "com.android.nfc",
  "com.android.shell",
  "com.android.vending",
  "com.google.android.gms",
  "com.google.android.gsf",
  "com.google.android.gsf.login",
  "com.google.android.packageinstaller",
  "com.google.android.ext.services",
  "com.google.android.ext.shared",
  "com.google.android.permissioncontroller",
  "com.google.android.webview",
  "com.android.webview",
  "com.google.android.tts",
  "com.android.documentsui",
  "com.android.externalstorage",
  "com.android.mtp",
  "com.android.vpndialogs",
  "com.android.wallpaper",
] as const;

/**
 * High-confidence adware / spyware / bloat often shipped on cheap tablets.
 * Prefer disable for system apps; uninstall --user 0 for user installs.
 */
export const ADWARE_SPYWARE = [
  // Facebook silent installers / trackers
  "com.facebook.appmanager",
  "com.facebook.system",
  "com.facebook.services",
  "com.facebook.katana",
  "com.instagram.android",
  // Generic adware / cleaners / boosters
  "com.cleanmaster.mguard",
  "com.cleanmaster.security",
  "com.cmcm.security",
  "com.qihoo.security",
  "com.qihoo360.mobilesafe",
  "com.antivirus",
  "com.avast.android.mobilesecurity",
  "com.droidhang.ad",
  "com.s.cleaner",
  "com.glb.phoneguardian",
  // Chinese analytics / push / stores that push junk
  "com.miui.analytics",
  "com.miui.systemAdSolution",
  "com.miui.daemon",
  "com.xiaomi.discover",
  "com.xiaomi.mipicks",
  "com.xiaomi.glgm",
  "com.xiaomi.joyose",
  "com.msa.oneplus",
  "com.ss.android.article.news",
  "com.ss.android.ugc.aweme",
  "com.tencent.android.qqdownloader",
  "com.tencent.news",
  "com.UCMobile",
  "com.uc.browser",
  "com.baidu.searchbox",
  "com.baidu.input",
  "com.nearme.gamecenter",
  "com.heytap.market",
  "com.heytap.pictorial",
  "com.coloros.pictorial",
  "com.oppo.market",
  "com.vivo.appstore",
  "com.vivo.abe",
  "com.bbk.appstore",
  // OEM promo / partner auto-install
  "android.autoinstalls.config.external",
  "com.android.companion",
  "com.google.android.setupwizard",
  // Common spyware-ish remote / stalkerware package names (only if present)
  "com.mspy.android",
  "com.flexispy.android",
  "com.hoverwatch",
  "com.thetruthspy",
  "com.mobiletrackerfree",
  "com.spyzie",
  "com.cocospy",
] as const;

/** Substrings that mark a user-installed package as review/remove candidate. */
export const SUSPECT_SUBSTRINGS = [
  "adcolony",
  "admob",
  "adservice",
  "advert",
  "analytics",
  "appmarket",
  "applovin",
  "boost",
  "cleaner",
  "cleanmaster",
  "duproviders",
  "facebook.system",
  "facebook.services",
  "facebook.appmanager",
  "heytap",
  "junk",
  "market.autoinstall",
  "miui.analytics",
  "mobilesafe",
  "oneplus.msa",
  "optimizer",
  "phoneguardian",
  "pictorial",
  "pushservice",
  "qihoo",
  "securitycenter",
  "spyware",
  "stalker",
  "systemad",
  "tracker",
  "uc.browser",
  "weather.provider.ad",
  "xspace",
] as const;

export type DetoxAction = "skip" | "keep" | "uninstall-user" | "disable-user";

export type DetoxTarget = {
  packageName: string;
  action: DetoxAction;
  reason: string;
  userInstalled: boolean;
};

function isNeverTouch(packageName: string): boolean {
  return NEVER_TOUCH.some((keep) => packageName === keep || packageName.startsWith(`${keep}.`));
}

export function parsePackageList(raw: string): string[] {
  const names = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(/^package:(.+)$/);
    if (match?.[1]) names.add(match[1].trim());
  }
  return [...names].sort();
}

export function planDetox(allPackages: string[], userPackages: string[]): DetoxTarget[] {
  const userSet = new Set(userPackages);
  const targets: DetoxTarget[] = [];
  const seen = new Set<string>();

  for (const packageName of allPackages) {
    if (seen.has(packageName)) continue;
    if (isNeverTouch(packageName)) {
      continue;
    }

    const userInstalled = userSet.has(packageName);
    const known = (ADWARE_SPYWARE as readonly string[]).includes(packageName);
    const suspect = SUSPECT_SUBSTRINGS.some((part) => packageName.toLowerCase().includes(part));

    if (!known && !suspect) continue;
    seen.add(packageName);

    if (userInstalled) {
      targets.push({
        packageName,
        action: "uninstall-user",
        reason: known ? "відомий рекламний/шпигунський пакет" : "підозріла назва (реклама/аналітика/cleaner)",
        userInstalled: true,
      });
    } else {
      targets.push({
        packageName,
        action: "disable-user",
        reason: known
          ? "системний рекламний/шпигунський пакет — вимикаємо для користувача 0"
          : "підозріла системна назва — вимикаємо, не зносимо розділ",
        userInstalled: false,
      });
    }
  }

  return targets.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export function renderDetoxShell(targets: DetoxTarget[]): string {
  const lines = ["set +e", "echo @@DETOX_BEGIN@@"];
  for (const target of targets) {
    if (target.action === "uninstall-user") {
      lines.push(`echo @@PKG:${target.packageName}@@`);
      lines.push(`pm uninstall --user 0 ${target.packageName} 2>&1`);
      lines.push(`echo uninstall_exit=$?`);
      lines.push(`echo @@END:${target.packageName}@@`);
    } else if (target.action === "disable-user") {
      lines.push(`echo @@PKG:${target.packageName}@@`);
      lines.push(`pm disable-user --user 0 ${target.packageName} 2>&1`);
      lines.push(`echo disable_exit=$?`);
      lines.push(`echo @@END:${target.packageName}@@`);
    }
  }
  lines.push("echo @@DETOX_END@@");
  return `${lines.join("\n")}\n`;
}
