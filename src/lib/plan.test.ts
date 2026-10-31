import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultOptions } from "./types";
import { buildOptimizePlan, buildRestorePlan, parseStepOutput, renderScript } from "./plan";

test("default profile skips the risky toggles", () => {
  const plan = buildOptimizePlan(defaultOptions);
  const ids = plan.map((step) => step.id);
  assert.deepEqual(ids, [
    "animations",
    "scans",
    "battery",
    "refresh",
    "freezer",
    "doze",
    "hyper",
    "trim",
    "dexopt",
    "fstrim",
  ]);
  const script = renderScript(plan);
  assert.match(script, /^set \+e/);
  assert.match(script, /window_animation_scale 0\.5/);
  assert.match(script, /peak_refresh_rate 144/);
  assert.match(script, /min_refresh_rate 60/);
  assert.match(script, /cached_apps_freezer enabled/);
  assert.match(script, /dumpsys deviceidle enable/);
  assert.match(script, /pm disable-user --user 0 "\$pkg"/);
  assert.doesNotMatch(script, /com\.xiaomi\.joyose/);
  assert.doesNotMatch(script, /background_process_limit/);
  assert.doesNotMatch(script, /screen_off_timeout/);
});

test("memory limit and screen timeout are explicit", () => {
  const script = renderScript(
    buildOptimizePlan({
      ...defaultOptions,
      animations: false,
      scans: false,
      adaptiveBattery: false,
      trimCaches: false,
      dexopt: false,
      fstrim: false,
      memoryLimit: true,
      screenTimeout: true,
    }),
  );
  assert.match(script, /background_process_limit 4/);
  assert.match(script, /screen_off_timeout 60000/);
});

test("reads step results back from the tablet", () => {
  const plan = buildOptimizePlan({ ...defaultOptions, memoryLimit: false, screenTimeout: false });
  const raw = `
set +e
@@STEP:animations@@
window=0.5
transition=0.5
animator=0.5
@@END:animations@@
@@STEP:scans@@
wifi=0
ble=0
@@END:scans@@
@@STEP:battery@@
adaptive=1
standby=1
@@END:battery@@
@@STEP:refresh@@
peak=144.0
min=60
@@END:refresh@@
@@STEP:freezer@@
freezer=enabled
@@END:freezer@@
@@STEP:doze@@
doze=1
@@END:doze@@
@@STEP:hyper@@
hyper_disabled=4
hyper_skipped=12
hyper_failed=0
hyper_failed_names=
@@END:hyper@@
@@STEP:trim@@
trim_exit=0
@@END:trim@@
@@STEP:dexopt@@
Success
dex_exit=0
@@END:dexopt@@
@@STEP:fstrim@@
fs_exit=1
Permission denied
@@END:fstrim@@
`;
  const results = parseStepOutput(raw, plan);
  assert.equal(results.filter((step) => step.ok).length, 9);
  assert.equal(results.find((step) => step.id === "refresh")?.ok, true);
  assert.equal(results.find((step) => step.id === "fstrim")?.ok, false);
  assert.match(results.find((step) => step.id === "fstrim")?.detail ?? "", /fstrim/);
});

test("restore ignores a poisoned timeout", () => {
  const script = renderScript(buildRestorePlan("60000; reboot"));
  assert.match(script, /window_animation_scale 1/);
  assert.match(script, /settings delete global background_process_limit/);
  assert.match(script, /pm enable --user 0 "\$pkg"/);
  assert.doesNotMatch(script, /reboot/);
  assert.doesNotMatch(script, /screen_off_timeout/);
  assert.doesNotMatch(script, /peak_refresh_rate/);
});

test("restore puts back a known timeout", () => {
  const plan = buildRestorePlan("120000");
  const raw = plan
    .map((step) => {
      if (step.id === "animations") return `@@STEP:animations@@\nwindow=1\ntransition=1.0\nanimator=1\n@@END:animations@@`;
      if (step.id === "scans") return `@@STEP:scans@@\nwifi=1\nble=1\n@@END:scans@@`;
      if (step.id === "memory") return `@@STEP:memory@@\nbg_limit=null\n@@END:memory@@`;
      if (step.id === "hyper") return `@@STEP:hyper@@\nhyper_enabled=4\nhyper_skipped=12\nhyper_failed=0\n@@END:hyper@@`;
      return `@@STEP:timeout@@\nscreen_timeout=120000\n@@END:timeout@@`;
    })
    .join("\n");
  const results = parseStepOutput(raw, plan);
  assert.equal(results.every((step) => step.ok), true);
});

test("restore writes back the refresh rate read from the phone", () => {
  const plan = buildRestorePlan(undefined, { peak: "120", min: "60" });
  const script = renderScript(plan);
  assert.match(script, /peak_refresh_rate 120/);
  assert.match(script, /min_refresh_rate 60/);
  assert.doesNotMatch(script, /screen_off_timeout/);
  const raw = plan
    .map((step) => {
      if (step.id === "animations") return `@@STEP:animations@@\nwindow=1\ntransition=1\nanimator=1\n@@END:animations@@`;
      if (step.id === "scans") return `@@STEP:scans@@\nwifi=1\nble=1\n@@END:scans@@`;
      if (step.id === "memory") return `@@STEP:memory@@\nbg_limit=null\n@@END:memory@@`;
      if (step.id === "hyper") return `@@STEP:hyper@@\nhyper_enabled=1\nhyper_skipped=0\nhyper_failed=0\n@@END:hyper@@`;
      return `@@STEP:refresh@@\npeak=120.0\nmin=60.0\n@@END:refresh@@`;
    })
    .join("\n");
  assert.equal(parseStepOutput(raw, plan).every((step) => step.ok), true);
});

test("restore lets HyperOS decide when the phone had no refresh keys", () => {
  const plan = buildRestorePlan(undefined, {});
  const script = renderScript(plan);
  assert.match(script, /settings delete system peak_refresh_rate/);
  assert.match(script, /settings delete system min_refresh_rate/);
  const raw = `
@@STEP:animations@@
window=1
transition=1
animator=1
@@END:animations@@
@@STEP:scans@@
wifi=1
ble=1
@@END:scans@@
@@STEP:memory@@
bg_limit=null
@@END:memory@@
@@STEP:hyper@@
hyper_enabled=0
hyper_skipped=16
hyper_failed=0
@@END:hyper@@
@@STEP:refresh@@
peak=null
min=null
@@END:refresh@@
`;
  const results = parseStepOutput(raw, plan);
  assert.equal(results.every((step) => step.ok), true);
  assert.match(results.find((step) => step.id === "refresh")?.detail ?? "", /HyperOS/);
});
