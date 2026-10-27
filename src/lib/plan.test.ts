import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultOptions } from "./types";
import { buildOptimizePlan, buildRestorePlan, parseStepOutput, renderScript } from "./plan";

test("default profile skips the risky toggles", () => {
  const plan = buildOptimizePlan(defaultOptions);
  const ids = plan.map((step) => step.id);
  assert.deepEqual(ids, ["animations", "scans", "battery", "trim", "dexopt", "fstrim"]);
  const script = renderScript(plan);
  assert.match(script, /^set \+e/);
  assert.match(script, /window_animation_scale 0\.5/);
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
  assert.equal(results.filter((step) => step.ok).length, 5);
  assert.equal(results.find((step) => step.id === "fstrim")?.ok, false);
  assert.match(results.find((step) => step.id === "fstrim")?.detail ?? "", /fstrim/);
});

test("restore ignores a poisoned timeout", () => {
  const script = renderScript(buildRestorePlan("60000; reboot"));
  assert.match(script, /window_animation_scale 1/);
  assert.match(script, /settings delete global background_process_limit/);
  assert.doesNotMatch(script, /reboot/);
  assert.doesNotMatch(script, /screen_off_timeout/);
});

test("restore puts back a known timeout", () => {
  const plan = buildRestorePlan("120000");
  const raw = plan
    .map((step) => {
      if (step.id === "animations") return `@@STEP:animations@@\nwindow=1\ntransition=1.0\nanimator=1\n@@END:animations@@`;
      if (step.id === "scans") return `@@STEP:scans@@\nwifi=1\nble=1\n@@END:scans@@`;
      if (step.id === "memory") return `@@STEP:memory@@\nbg_limit=null\n@@END:memory@@`;
      return `@@STEP:timeout@@\nscreen_timeout=120000\n@@END:timeout@@`;
    })
    .join("\n");
  const results = parseStepOutput(raw, plan);
  assert.equal(results.every((step) => step.ok), true);
});
