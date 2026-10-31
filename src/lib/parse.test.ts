import assert from "node:assert/strict";
import { test } from "node:test";
import { adviceFor, batteryPhrase, deviceTitle, formatKb } from "./format";
import { parseAudit } from "./parse";
import type { DeviceSnapshot } from "./types";

const SAMPLE = `
@@PROP@@
manufacturer=samsung
model=SM-X200
device=gta9wifi
android=14
sdk=34
build=UP1A.231005.007
abi=arm64-v8a
@@MEM@@
MemTotal:        2855112 kB
MemAvailable:     734212 kB
SwapTotal:        524284 kB
SwapFree:         100000 kB
@@DF@@
Filesystem     1K-blocks     Used Available Use% Mounted on
/dev/block/dm-5  23456789 18000000   5000000  79% /data
@@BAT@@
Current Battery Service state:
  AC powered: true
  USB powered: false
  Wireless powered: false
  Dock powered: false
  status: 2
  health: 2
  level: 76
  scale: 100
  temperature: 285
@@SET@@
window=1.0
transition=1
animator=1
wifi_scan=1
ble_scan=1
adaptive=1
standby=1
bg_limit=null
screen_timeout=60000
@@PKG@@
user=42
system=210
@@PSS@@
Total PSS by process:
    180,000K: system (pid 100)
    120,500K: com.android.systemui (pid 200)
     90,000K: com.google.android.gms (pid 300)
@@UP@@
345678.12 123.45
@@END@@
`;

test("parses a tablet audit", () => {
  const device = parseAudit(SAMPLE, "192.168.1.83:41555");
  assert.equal(device.serial, "192.168.1.83:41555");
  assert.equal(device.manufacturer, "samsung");
  assert.equal(device.model, "SM-X200");
  assert.equal(device.android, "14");
  assert.equal(device.sdk, "34");
  assert.equal(device.memTotalKb, 2855112);
  assert.equal(device.memAvailableKb, 734212);
  assert.equal(device.storageTotalKb, 23456789);
  assert.equal(device.storageUsedKb, 18000000);
  assert.equal(device.storageAvailKb, 5000000);
  assert.equal(device.batteryLevel, 76);
  assert.equal(device.batteryTempC, 28.5);
  assert.equal(device.batteryStatus, "charging");
  assert.equal(device.plugged, true);
  assert.equal(device.uptimeSec, 345678);
  assert.equal(device.userPackages, 42);
  assert.equal(device.systemPackages, 210);
  assert.equal(device.animations.window, "1.0");
  assert.equal(device.screenOffTimeoutMs, "60000");
  assert.deepEqual(
    device.processes.map((item) => item.label),
    ["Система", "Системний інтерфейс", "Сервіси Google"],
  );
  assert.equal(device.processes[1].pssKb, 120500);
});

test("names the tablet without repeating the brand", () => {
  assert.equal(deviceTitle("samsung", "SM-X200"), "Samsung SM-X200");
  assert.equal(deviceTitle("Samsung", "Samsung Galaxy Tab A8"), "Samsung Galaxy Tab A8");
  assert.equal(deviceTitle("", ""), "Android-пристрій");
  assert.equal(deviceTitle("Xiaomi", "2407FPN8EG", "Xiaomi 14T Pro"), "Xiaomi 14T Pro");
});

test("describes battery and storage in Ukrainian units", () => {
  assert.equal(batteryPhrase("charging", true, 76), "76% · заряджається");
  assert.equal(batteryPhrase("discharging", false, 40), "40% · від акумулятора");
  assert.match(formatKb(2855112), /ГБ/);
});

test("reads HyperOS and the 14T Pro refresh rate", () => {
  const raw = SAMPLE.replace(
    "abi=arm64-v8a",
    `abi=arm64-v8a
market=Xiaomi 14T Pro
os_name=HyperOS
os_build=OS2.0.3.0.VNNEUXM
miui=V816`,
  ).replace(
    "screen_timeout=60000",
    `screen_timeout=60000
peak=144.0
min_refresh=60`,
  );
  const device = parseAudit(raw.replace("manufacturer=samsung", "manufacturer=Xiaomi").replace("model=SM-X200", "model=2407FPN8EG").replace("device=gta9wifi", "device=rothko"), "192.168.1.20:5555");
  assert.equal(device.marketName, "Xiaomi 14T Pro");
  assert.equal(device.osName, "HyperOS");
  assert.equal(device.osBuild, "OS2.0.3.0.VNNEUXM");
  assert.equal(device.peakRefresh, "144.0");
  assert.equal(device.minRefresh, "60");
  assert.equal(deviceTitle(device.manufacturer, device.model, device.marketName), "Xiaomi 14T Pro");
  const notes = adviceFor(device);
  assert.match(notes.join(" "), /14T Pro/);
});

test("warns when the tablet is low on storage or power", () => {
  const device = parseAudit(SAMPLE, "192.168.1.83:5555");
  const tight: DeviceSnapshot = {
    ...device,
    storageUsedKb: 950,
    storageTotalKb: 1000,
    batteryLevel: 9,
    plugged: false,
    batteryStatus: "discharging",
    sdk: "26",
    animations: { window: "0.5", transition: "0.5", animator: "0.5" },
  };
  const notes = adviceFor(tight);
  assert.equal(notes.length, 4);
  assert.match(notes[0], /90%/);
  assert.match(notes[1], /20%/);
  assert.match(notes[2], /старіший/);
  assert.match(notes[3], /скорочені/);
});
