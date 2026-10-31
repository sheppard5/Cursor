import assert from "node:assert/strict";
import { test } from "node:test";
import { HYPEROS_AD_PACKAGES, XIAOMI_KEEP, hyperPackageScript, isXiaomi14tPro, refreshApplyScript } from "./xiaomi";

test("recognizes Xiaomi 14T Pro by codename, model code and marketing name", () => {
  assert.equal(isXiaomi14tPro({ device: "rothko", model: "2407FPN8EG", manufacturer: "Xiaomi" }), true);
  assert.equal(isXiaomi14tPro({ model: "2407FPN8ER", manufacturer: "Xiaomi" }), true);
  assert.equal(
    isXiaomi14tPro({ manufacturer: "Xiaomi", model: "2407FPN8EG", marketName: "Xiaomi 14T Pro" }),
    true,
  );
  assert.equal(isXiaomi14tPro({ manufacturer: "Xiaomi", marketName: "Xiaomi 14T Pro" }), true);
  assert.equal(isXiaomi14tPro({ manufacturer: "samsung", model: "SM-X200", device: "gta9wifi" }), false);
  assert.equal(isXiaomi14tPro({ manufacturer: "Xiaomi", model: "2311DRK48G", marketName: "Xiaomi 14T" }), false);
  assert.equal(isXiaomi14tPro({ manufacturer: "Xiaomi", model: "23127PN0CG", marketName: "Xiaomi 14" }), false);
});

test("ad list never includes the services 14T Pro needs", () => {
  const keep = new Set<string>(XIAOMI_KEEP);
  for (const name of HYPEROS_AD_PACKAGES) {
    assert.equal(keep.has(name), false, name);
  }
  const script = hyperPackageScript("disable");
  assert.match(script, /pm disable-user --user 0 "\$pkg"/);
  assert.match(script, /com\.miui\.analytics/);
  assert.match(script, /com\.miui\.msa\.global/);
  assert.doesNotMatch(script, /com\.xiaomi\.joyose/);
  assert.doesNotMatch(script, /com\.miui\.powerkeeper/);
  assert.doesNotMatch(script, /com\.miui\.home/);
  assert.doesNotMatch(script, /com\.android\.camera/);
  assert.doesNotMatch(script, /com\.facebook\.katana/);
  assert.doesNotMatch(script, /com\.instagram\.android/);
});

test("refresh script asks the 14T Pro panel for 144 with a 60 floor", () => {
  const script = refreshApplyScript();
  assert.match(script, /peak_refresh_rate 144/);
  assert.match(script, /min_refresh_rate 60/);
  assert.match(script, /miui_refresh_rate 144/);
});
