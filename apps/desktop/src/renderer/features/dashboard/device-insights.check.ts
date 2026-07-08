// Durable run device insight check.
// Run: pnpm --filter @testcat/desktop exec tsx src/renderer/features/dashboard/device-insights.check.ts
import assert from "node:assert/strict";
import type { AgentEvent, TestRun } from "@testcat/shared";
import { summarizeRunDevices } from "./device-insights";

const udid = "12345678-1234-4234-9234-123456789ABC";
const run = {
  devices: [],
  startedAt: "2026-06-22T10:00:00.000Z",
  finishedAt: "2026-06-22T10:01:00.000Z",
  durationMs: 60_000,
} satisfies Pick<TestRun, "devices" | "startedAt" | "finishedAt" | "durationMs">;

const estimatedEvents: AgentEvent[] = [
  { type: "status", phase: "starting" },
  {
    type: "tool_use",
    name: "testcat-sim",
    family: "exec",
    input: `testcat-sim boot --udid ${udid}`,
  },
  {
    type: "tool_result",
    ok: true,
    output: JSON.stringify({
      running: [{ id: udid, name: "iPhone 17 Pro", runtime: "iOS 26.5" }],
    }),
  },
  {
    type: "tool_use",
    name: "testcat-sim",
    family: "exec",
    input: `testcat-sim launch --udid ${udid} --app /tmp/App.app`,
  },
  { type: "status", phase: "done" },
];

const estimated = summarizeRunDevices(run, estimatedEvents);
assert.equal(estimated.length, 1);
assert.equal(estimated[0]?.name, "iPhone 17 Pro");
assert.equal(estimated[0]?.runtime, "iOS 26.5");
assert.equal(estimated[0]?.bootedDuringRun, true);
assert.equal(estimated[0]?.launchedDuringRun, true);
assert.equal(estimated[0]?.commandCount, 2);
assert.equal(estimated[0]?.timing, "estimated");
assert.equal(estimated[0]?.activeMs, 45_000);

const exactEvents: AgentEvent[] = [
  {
    type: "tool_use",
    name: "testcat-sim",
    family: "exec",
    input: `/repo/native/testcat-sim/.build/release/testcat-sim install --udid ${udid} --app /tmp/App.app`,
    timestamp: "2026-06-22T10:00:10.000Z",
  },
  {
    type: "tool_use",
    name: "testcat-sim",
    family: "exec",
    input: { command: `testcat-sim type --udid ${udid} --text hello` },
    timestamp: "2026-06-22T10:00:25.000Z",
  },
];

const exact = summarizeRunDevices(
  { ...run, devices: [{ udid, name: "iPhone 17 Pro", runtime: "iOS 26.5" }] },
  exactEvents,
);
assert.equal(exact.length, 1);
assert.equal(exact[0]?.timing, "exact");
assert.equal(exact[0]?.installedDuringRun, true);
assert.equal(exact[0]?.activeMs, 15_000);
assert.deepEqual(exact[0]?.commands, ["install", "type"]);

const unusedInventoryOnly = summarizeRunDevices(
  {
    ...run,
    devices: [
      {
        udid: "87654321-4321-4234-9234-CBA987654321",
        name: "iPad (10th generation)",
        runtime: "iOS 18.3",
      },
    ],
  },
  [
    {
      type: "tool_result",
      ok: true,
      output: JSON.stringify({
        available: [
          {
            id: "FFFFFFFF-4321-4234-9234-CBA987654321",
            name: "iPad (A16)",
            runtime: "iOS 26.5",
          },
        ],
      }),
    },
  ],
);
assert.equal(unusedInventoryOnly.length, 0);

console.log("device insights check: OK");
