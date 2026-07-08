// Durable device usage check. Run: pnpm --filter @testcat/desktop exec tsx src/main/devices/device-usage.check.ts
import assert from "node:assert/strict";
import type { Device } from "@testcat/shared";
import {
  annotateDevicesUsage,
  clearDeviceUsage,
  deviceUsageForUdid,
  extractUdidsFromUnknown,
  freeSimulatorCandidates,
  releaseDeviceUsageForRun,
  reserveDeviceUsage,
  selectSimulatorForRun,
  selectSimulatorsForRun,
} from "./device-usage";

const usedUdid = "11111111-1111-4111-8111-111111111111";
const freeUdid = "22222222-2222-4222-8222-222222222222";

const devices: Device[] = [
  {
    udid: usedUdid,
    name: "iPhone 16",
    state: "Booted",
    runtime: "iOS 26.5",
    isBooted: true,
    kind: "simulator",
    provider: "testcat-sim",
  },
  {
    udid: freeUdid,
    name: "iPhone 17",
    state: "Booted",
    runtime: "iOS 26.5",
    isBooted: true,
    kind: "simulator",
    provider: "testcat-sim",
  },
];

clearDeviceUsage();
reserveDeviceUsage(usedUdid.toLowerCase(), {
  runId: "run-1",
  runName: "Checkout",
  profileName: "opencode",
  startedAt: "2026-06-23T09:00:00.000Z",
});

assert.equal(deviceUsageForUdid(usedUdid)?.runName, "Checkout");
assert.equal(annotateDevicesUsage(devices)[0]?.usage?.runId, "run-1");
assert.deepEqual(
  freeSimulatorCandidates(devices).map((device) => device.udid),
  [freeUdid],
);
assert.equal(selectSimulatorForRun(devices)?.udid, freeUdid);
// Multi-sim selection: skips reserved sims, returns at most what exists,
// booted iPhones first.
assert.deepEqual(
  selectSimulatorsForRun(devices, 3).map((device) => device.udid),
  [freeUdid],
);
releaseDeviceUsageForRun("run-1");
const both = selectSimulatorsForRun(devices, 2).map((device) => device.udid);
assert.deepEqual(both, [usedUdid, freeUdid]);
assert.equal(selectSimulatorsForRun(devices, 1).length, 1);
reserveDeviceUsage(usedUdid, {
  runId: "run-1",
  runName: "Checkout",
  profileName: "opencode",
  startedAt: "2026-06-23T09:00:00.000Z",
});
assert.deepEqual(extractUdidsFromUnknown({ command: `testcat-sim boot --udid ${freeUdid}` }), [
  freeUdid,
]);

releaseDeviceUsageForRun("run-1");
assert.equal(deviceUsageForUdid(usedUdid), null);
clearDeviceUsage();

console.log("device usage check: OK");
