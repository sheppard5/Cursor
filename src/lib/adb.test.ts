import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretConnect } from "./adb";

const serial = "192.168.1.83:41555";

test("sees a connected tablet", () => {
  const devices = `List of devices attached\n${serial} device product:gta9wifi model:SM_X200 device:gta9wifi\n`;
  const result = interpretConnect("connected to 192.168.1.83:41555\n", devices, serial);
  assert.equal(result.status, "connected");
});

test("explains an unauthorized tablet", () => {
  const devices = `List of devices attached\n${serial} unauthorized\n`;
  const result = interpretConnect("", devices, serial);
  assert.equal(result.status, "unauthorized");
  assert.match(result.message, /не довіряє/);
});

test("explains a closed wireless debugging port", () => {
  const result = interpretConnect("failed to connect to 192.168.1.83:5555: Connection refused\n", "", serial);
  assert.equal(result.status, "refused");
});

test("explains a tablet that is not on this network", () => {
  const result = interpretConnect("@@TIMEOUT@@", "", serial);
  assert.equal(result.status, "offline");
  assert.match(result.message, /Wi-Fi/);
});
