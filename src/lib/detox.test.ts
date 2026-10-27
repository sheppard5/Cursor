import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePackageList, planDetox, renderDetoxShell } from "./detox";

test("parses pm list packages", () => {
  const names = parsePackageList("package:com.android.settings\npackage:com.facebook.appmanager\n");
  assert.deepEqual(names, ["com.android.settings", "com.facebook.appmanager"]);
});

test("never touches Settings or GMS", () => {
  const plan = planDetox(
    ["com.android.settings", "com.google.android.gms", "com.facebook.appmanager"],
    ["com.facebook.appmanager"],
  );
  assert.equal(plan.some((item) => item.packageName.includes("settings") || item.packageName.includes("gms")), false);
  assert.equal(plan[0]?.packageName, "com.facebook.appmanager");
  assert.equal(plan[0]?.action, "uninstall-user");
});

test("disables system adware instead of uninstalling", () => {
  const plan = planDetox(["com.miui.analytics", "com.cleanmaster.mguard"], ["com.cleanmaster.mguard"]);
  assert.deepEqual(
    plan.map((item) => [item.packageName, item.action]),
    [
      ["com.cleanmaster.mguard", "uninstall-user"],
      ["com.miui.analytics", "disable-user"],
    ],
  );
  const script = renderDetoxShell(plan);
  assert.match(script, /pm uninstall --user 0 com\.cleanmaster\.mguard/);
  assert.match(script, /pm disable-user --user 0 com\.miui\.analytics/);
  assert.doesNotMatch(script, /com\.android\.settings/);
});
