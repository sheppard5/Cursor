# Safe adware/spyware pass for a paired Android tablet (Windows PowerShell).
# Usage (from platform-tools folder, tablet already in `adb devices`):
#   powershell -ExecutionPolicy Bypass -File C:\path\to\Cursor\scripts\detox-tablet.ps1 -Serial 192.168.1.83:44853
# Dry run:
#   ... -DryRun

param(
  [string]$Serial = "192.168.1.83:44853",
  [string]$Adb = ".\adb.exe",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command $Adb -ErrorAction SilentlyContinue) -and -not (Test-Path $Adb)) {
  Write-Host "Не знайдено adb. Запустіть із папки platform-tools або вкажіть -Adb шлях\до\adb.exe"
  exit 1
}

function Invoke-Adb([string[]]$Args) {
  & $Adb -s $Serial @Args
}

Write-Host "Пристрій: $Serial"
$devices = Invoke-Adb @("devices")
if ($devices -notmatch [regex]::Escape($Serial)) {
  Write-Host "Планшет не в adb devices. Спочатку pair/connect."
  exit 1
}

$never = @(
  "com.android.systemui", "com.android.settings", "com.android.launcher3",
  "com.google.android.gms", "com.google.android.gsf", "com.android.vending",
  "com.google.android.packageinstaller", "com.android.phone", "com.android.bluetooth"
)

$kill = @(
  "com.facebook.appmanager", "com.facebook.system", "com.facebook.services",
  "com.facebook.katana", "com.instagram.android",
  "com.cleanmaster.mguard", "com.cleanmaster.security", "com.cmcm.security",
  "com.qihoo.security", "com.qihoo360.mobilesafe",
  "com.miui.analytics", "com.miui.systemAdSolution", "com.miui.daemon",
  "com.xiaomi.discover", "com.xiaomi.mipicks", "com.xiaomi.glgm",
  "com.heytap.market", "com.heytap.pictorial", "com.oppo.market",
  "com.vivo.appstore", "com.bbk.appstore",
  "com.tencent.android.qqdownloader", "com.UCMobile", "com.uc.browser",
  "com.baidu.searchbox", "com.ss.android.article.news",
  "com.mspy.android", "com.flexispy.android", "com.hoverwatch",
  "com.thetruthspy", "com.spyzie", "com.cocospy"
)

$all = Invoke-Adb @("shell", "pm", "list", "packages") | ForEach-Object {
  if ($_ -match "^package:(.+)$") { $Matches[1].Trim() }
}
$user = Invoke-Adb @("shell", "pm", "list", "packages", "-3") | ForEach-Object {
  if ($_ -match "^package:(.+)$") { $Matches[1].Trim() }
}
$userSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$user)

$present = $kill | Where-Object { $all -contains $_ -and $never -notcontains $_ }
Write-Host ("Знайдено кандидатів: {0}" -f $present.Count)
$present | ForEach-Object { Write-Host ("  - {0}" -f $_) }

if ($DryRun) {
  Write-Host "Dry-run: нічого не змінено."
  exit 0
}

$log = Join-Path $env:TEMP ("tablet-detox-{0}.txt" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
"serial=$Serial" | Out-File -FilePath $log -Encoding utf8

foreach ($pkg in $present) {
  if ($userSet.Contains($pkg)) {
    Write-Host "uninstall --user 0 $pkg"
    $out = Invoke-Adb @("shell", "pm", "uninstall", "--user", "0", $pkg)
    "$pkg uninstall => $out" | Out-File -FilePath $log -Append -Encoding utf8
  } else {
    Write-Host "disable-user $pkg"
    $out = Invoke-Adb @("shell", "pm", "disable-user", "--user", "0", $pkg)
    "$pkg disable => $out" | Out-File -FilePath $log -Append -Encoding utf8
  }
}

Write-Host "Готово. Журнал: $log"
Write-Host "Перезавантажте планшет: $Adb -s $Serial reboot"
