import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPairCode, isPrivateIpv4, parseEndpoint, sanitizeTimeout } from "./endpoint";
import { TunerError } from "./errors";

test("accepts the tablet address", () => {
  const endpoint = parseEndpoint(" 192.168.1.83 ", 5555);
  assert.deepEqual(endpoint, { host: "192.168.1.83", port: 5555, serial: "192.168.1.83:5555" });
});

test("rejects public and injected hosts", () => {
  for (const host of ["8.8.8.8", "192.168.1.83; reboot", "192.168.001.83", "1.2.3.4", "2001:db8::1"]) {
    assert.throws(() => parseEndpoint(host, 5555), TunerError);
  }
  assert.equal(isPrivateIpv4("10.1.2.3"), true);
  assert.equal(isPrivateIpv4("172.16.0.1"), true);
  assert.equal(isPrivateIpv4("172.32.0.1"), false);
});

test("rejects a bad port", () => {
  assert.throws(() => parseEndpoint("192.168.1.83", 0), TunerError);
  assert.throws(() => parseEndpoint("192.168.1.83", 65536), TunerError);
  assert.throws(() => parseEndpoint("192.168.1.83", 5555.5), TunerError);
});

test("pair code is six digits", () => {
  assert.equal(assertPairCode(" 123456 "), "123456");
  assert.throws(() => assertPairCode("12345"), TunerError);
  assert.throws(() => assertPairCode("1234567"), TunerError);
  assert.throws(() => assertPairCode("12ab56"), TunerError);
});

test("screen timeout is a safe millisecond value", () => {
  assert.equal(sanitizeTimeout("60000"), "60000");
  assert.equal(sanitizeTimeout(120000), "120000");
  assert.equal(sanitizeTimeout("60000; reboot"), undefined);
  assert.equal(sanitizeTimeout("1000"), undefined);
  assert.equal(sanitizeTimeout("abc"), undefined);
});
