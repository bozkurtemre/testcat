// Durable live-grid check. Run: pnpm dlx tsx <thisfile>
import assert from "node:assert/strict";
import type { Device } from "@testcat/shared";
import {
  decayDeviceFps,
  extractUsedDeviceUdids,
  getDeviceGridColumnCount,
  mergeDeviceFrame,
  mergeDeviceList,
  reservedDeviceUdids,
} from "./device-grid-state";

const usage = (runId: string) => ({
  inUse: true,
  runId,
  runName: "run",
  profileName: "profile",
  startedAt: "2026-01-01T00:00:00Z",
});

const devices: Device[] = [
  {
    udid: "sim-1",
    name: "iPhone 15 Pro",
    state: "Booted",
    runtime: "iOS 17.4",
    isBooted: true,
    usage: usage("run-a"),
  },
  {
    udid: "sim-2",
    name: "iPhone 14",
    state: "Booted",
    runtime: "iOS 17.2",
    isBooted: true,
  },
  {
    // A concurrent test's simulator: booted, but belongs to another run.
    udid: "sim-3",
    name: "iPhone 17 Pro Max",
    state: "Booted",
    runtime: "iOS 26.2",
    isBooted: true,
    usage: usage("run-b"),
  },
];

// Reserved lookup is scoped to the requested run.
assert.deepEqual(reservedDeviceUdids(devices, "run-a"), ["sim-1"]);
assert.deepEqual(reservedDeviceUdids(devices, "run-b"), ["sim-3"]);

// Positive filter: reserved (sim-1) + transcript-used (sim-2) show; the
// concurrent run's sim-3 never appears even though it is booted.
const allowed = new Set(["SIM-1", "SIM-2"]);
let state = mergeDeviceList({}, devices, { allowedUdids: allowed });
assert.deepEqual(Object.keys(state).sort(), ["sim-1", "sim-2"]);

// Frames for a foreign device are dropped; allowed devices update normally.
state = mergeDeviceFrame(
  state,
  { udid: "sim-3", name: "iPhone 17 Pro Max", dataUrl: "data:image/jpeg;base64,foreign" },
  { allowedUdids: allowed },
);
assert.deepEqual(Object.keys(state).sort(), ["sim-1", "sim-2"]);

state = mergeDeviceFrame(
  state,
  { udid: "sim-1", name: "iPhone 15 Pro", dataUrl: "data:image/jpeg;base64,first" },
  { allowedUdids: allowed },
);
assert.equal(state["sim-1"]?.dataUrl, "data:image/jpeg;base64,first");
assert.equal(state["sim-2"]?.dataUrl, undefined);
assert.equal(state["sim-2"]?.name, "iPhone 14");

// A later list refresh drops devices that shut down but keeps frames.
state = mergeDeviceList(state, [devices[0] as Device], {
  allowedUdids: allowed,
});
assert.deepEqual(Object.keys(state), ["sim-1"]);
assert.equal(state["sim-1"]?.dataUrl, "data:image/jpeg;base64,first");

// Without an allowlist everything booted is shown (no-filter semantics).
state = mergeDeviceList({}, devices);
assert.deepEqual(Object.keys(state).sort(), ["sim-1", "sim-2", "sim-3"]);

state = mergeDeviceFrame(
  state,
  { udid: "sim-2", name: "iPhone 14", dataUrl: "data:image/jpeg;base64,second" },
  { fps: 12, receivedAtMs: 1000 },
);
assert.equal(state["sim-2"]?.fps, 12);
state = decayDeviceFps(state, 2600, 1400);
assert.equal(state["sim-2"]?.fps, 0);

assert.deepEqual(
  extractUsedDeviceUdids([
    {
      type: "tool_use",
      name: "shell",
      family: "exec",
      input:
        "testcat-sim tap --udid 12345678-1234-1234-1234-123456789ABC --x 1 --y 1",
    },
    {
      type: "tool_result",
      ok: true,
      output: JSON.stringify(devices),
    },
  ]),
  ["12345678-1234-1234-1234-123456789ABC"],
);
assert.equal(getDeviceGridColumnCount(0), 4);
assert.equal(getDeviceGridColumnCount(520), 2);
assert.equal(getDeviceGridColumnCount(1020), 4);
assert.equal(getDeviceGridColumnCount(1600), 4);

console.log("device grid state check: OK");
