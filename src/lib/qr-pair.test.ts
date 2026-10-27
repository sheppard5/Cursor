import assert from "node:assert/strict";
import { test } from "node:test";
import { TunerError } from "./errors";
import {
  createQrCredentials,
  findConnectService,
  findPairingService,
  parseAdbWifiPayload,
  parseMdnsServices,
} from "./qr-pair";

test("builds a studio QR payload Android can scan", () => {
  const credentials = createQrCredentials();
  assert.match(credentials.serviceName, /^studio-[A-Za-z0-9]{10}$/);
  assert.match(credentials.password, /^\d{6}$/);
  assert.equal(credentials.payload, `WIFI:T:ADB;S:${credentials.serviceName};P:${credentials.password};;`);
  assert.deepEqual(parseAdbWifiPayload(credentials.payload), credentials);
});

test("rejects foreign or broken QR payloads", () => {
  assert.throws(() => parseAdbWifiPayload("WIFI:T:WPA;S:Home;P:secret;;"), TunerError);
  assert.throws(() => parseAdbWifiPayload("not-a-qr"), TunerError);
  assert.throws(() => parseAdbWifiPayload("WIFI:T:ADB;S:adb-device;P:123456;;"), TunerError);
  assert.throws(() => parseAdbWifiPayload("WIFI:T:ADB;S:studio-abc;P:12;;"), TunerError);
});

test("finds pairing and connect services from adb mdns output", () => {
  const services = parseMdnsServices(`
List of discovered mdns services
studio-58m7E2fq4\t_adb-tls-pairing._tcp.\t192.168.1.83:37123
adb-R58M123\t_adb-tls-connect._tcp\t192.168.1.83:41555
8.8.8.8-skip\t_adb-tls-pairing._tcp\t8.8.8.8:1111
`);
  assert.equal(services.length, 2);
  const pairing = findPairingService(services, "studio-58m7E2fq4");
  assert.deepEqual(pairing, {
    name: "studio-58m7E2fq4",
    type: "_adb-tls-pairing._tcp",
    host: "192.168.1.83",
    port: 37123,
  });
  assert.deepEqual(findConnectService(services, "192.168.1.83"), {
    name: "adb-R58M123",
    type: "_adb-tls-connect._tcp",
    host: "192.168.1.83",
    port: 41555,
  });
  assert.equal(findPairingService(services, "studio-missing"), null);
});
