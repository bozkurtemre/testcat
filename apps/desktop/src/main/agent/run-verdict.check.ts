// Durable run verdict check (no spawn). Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/run-verdict.check.ts
import assert from "node:assert/strict";
import type { AgentEvent } from "@testcat/shared";
import { determineRunVerdict } from "./run-verdict";

const noToolEvents: AgentEvent[] = [
  { type: "text_delta", text: "I will plan the test and split it into phases." },
  { type: "status", phase: "done" },
];
const expectedRunId = "run-123";
const expectedCompleteToken = "token-456";

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "codex",
    events: noToolEvents,
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: "Plan complete.",
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  {
    status: "error",
    result:
      "Agent exited without making any shell tool calls. It only produced narrative text, so the simulator and app were never controlled. Retry with a tool-capable agent/model or a profile that follows shell tool instructions.",
  },
);

const shellWithoutCompleteEvents: AgentEvent[] = [
  {
    type: "tool_use",
    name: "shell",
    family: "exec",
    input: "${TESTCAT_SIM_BIN:-testcat-sim} list --json",
  },
  { type: "tool_result", ok: true, output: "{\"running\":[],\"available\":[]}" },
];

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "codex",
    events: shellWithoutCompleteEvents,
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: "Listed devices.",
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  {
    status: "error",
    result:
      "Agent exited without the required Testcat completion marker. The test is only finished after `${TESTCAT_SIM_BIN:-testcat-sim} complete ...` or `${TESTCAT_DEVICE_BIN:-testcat-device} complete ...` runs successfully.",
  },
);

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "opencode",
    events: shellWithoutCompleteEvents,
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult:
      "opencode stopped without producing final text after an empty step. This usually means the selected opencode agent hit its configured `steps` limit before emitting the Testcat completion marker.",
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  {
    status: "error",
    result:
      "opencode stopped without producing final text after an empty step. This usually means the selected opencode agent hit its configured `steps` limit before emitting the Testcat completion marker.",
  },
);

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "opencode",
    events: [{ type: "text_delta", text: "UnknownError: Model not found." }],
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: "UnknownError: Model not found: ollama/gemma4:e4b-mlx",
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  {
    status: "error",
    result: "UnknownError: Model not found: ollama/gemma4:e4b-mlx",
  },
);

const earlyCompleteEvents: AgentEvent[] = [
  {
    type: "tool_use",
    name: "shell",
    family: "exec",
    input: "${TESTCAT_SIM_BIN:-testcat-sim} complete --status passed",
  },
  {
    type: "tool_result",
    ok: true,
    output: JSON.stringify({
      event: "testcat.run_complete",
      ok: true,
      runId: expectedRunId,
      status: "passed",
      summary: "Done.",
      token: expectedCompleteToken,
    }),
  },
];

assert.equal(
  determineRunVerdict({
    cmd: "codex",
    events: earlyCompleteEvents,
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: "Done.",
    requiresTestcatIosExecution: true,
    stderr: "",
  }).status,
  "error",
);

const executedEvents: AgentEvent[] = [
  {
    type: "tool_use",
    name: "shell",
    family: "exec",
    input:
      'SIM="${TESTCAT_SIM_BIN:-testcat-sim}"\n$SIM install --udid U --app /tmp/App.app\n$SIM launch --udid U --app /tmp/App.app\n$SIM screenshot --udid U --output /tmp/proof.jpg',
  },
  { type: "tool_result", ok: true, output: "ok" },
  {
    type: "tool_use",
    name: "shell",
    family: "exec",
    input:
      '${TESTCAT_SIM_BIN:-testcat-sim} complete --status passed --summary "Verified."',
  },
  {
    type: "tool_result",
    ok: true,
    output: JSON.stringify({
      event: "testcat.run_complete",
      ok: true,
      runId: expectedRunId,
      status: "passed",
      summary: "Verified.",
      token: expectedCompleteToken,
    }),
  },
];

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "codex",
    events: executedEvents,
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: "Verified.",
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  { status: "passed", result: "Verified." },
);

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "codex",
    events: noToolEvents,
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: "Generic task complete.",
    requiresTestcatIosExecution: false,
    stderr: "",
  }),
  { status: "passed", result: "Generic task complete." },
);

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "codex",
    events: [
      {
        type: "tool_result",
        ok: true,
        output: JSON.stringify({
          event: "testcat.run_complete",
          ok: true,
          runId: expectedRunId,
          status: "failed",
          summary: "Payment failed with visible error.",
          token: expectedCompleteToken,
        }),
      },
    ],
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: null,
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  { status: "failed", result: "Payment failed with visible error." },
);

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "codex",
    events: [
      {
        type: "tool_use",
        name: "shell",
        family: "exec",
        input:
          "${TESTCAT_SIM_BIN:-testcat-sim} install --udid U --app /tmp/App.app",
      },
      {
        type: "tool_result",
        ok: true,
        output: "Unable to lookup in current state: Shutdown",
      },
      {
        type: "tool_use",
        name: "shell",
        family: "exec",
        input:
          '${TESTCAT_SIM_BIN:-testcat-sim} complete --status failed --summary "Simulator was Shutdown"',
      },
      {
        type: "tool_result",
        ok: true,
        output: JSON.stringify({
          event: "testcat.run_complete",
          ok: true,
          runId: expectedRunId,
          status: "failed",
          summary: "Simulator was Shutdown",
          token: expectedCompleteToken,
        }),
      },
    ],
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: null,
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  {
    status: "error",
    result:
      "Agent attempted to install on a Shutdown simulator but never ran `${TESTCAT_SIM_BIN:-testcat-sim} boot --udid <UDID>`. The run did not exhaust the required headless setup sequence.",
  },
);

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "codex",
    events: [
      {
        type: "tool_use",
        name: "shell",
        family: "exec",
        input: "${TESTCAT_SIM_BIN:-testcat-sim} boot --udid U",
      },
      {
        type: "tool_result",
        ok: true,
        output: "{\"ok\":true}",
      },
      {
        type: "tool_use",
        name: "shell",
        family: "exec",
        input:
          "${TESTCAT_SIM_BIN:-testcat-sim} install --udid U --app /tmp/App.app",
      },
      {
        type: "tool_result",
        ok: true,
        output: "App installation failed: missing executable",
      },
      {
        type: "tool_use",
        name: "shell",
        family: "exec",
        input:
          '${TESTCAT_SIM_BIN:-testcat-sim} complete --status failed --summary "App installation failed"',
      },
      {
        type: "tool_result",
        ok: true,
        output: JSON.stringify({
          event: "testcat.run_complete",
          ok: true,
          runId: expectedRunId,
          status: "failed",
          summary: "App installation failed",
          token: expectedCompleteToken,
        }),
      },
    ],
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: null,
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  { status: "failed", result: "App installation failed" },
);

assert.deepStrictEqual(
  determineRunVerdict({
    cmd: "claude",
    events: [
      {
        type: "tool_use",
        name: "Bash",
        family: "exec",
        input:
          "${TESTCAT_SIM_BIN:-testcat-sim} screenshot --udid U --output /tmp/proof.jpg",
      },
      {
        type: "tool_result",
        ok: true,
        output: JSON.stringify([
          {
            type: "text",
            text: JSON.stringify({
              event: "testcat.run_complete",
              ok: true,
              runId: expectedRunId,
              status: "passed",
              summary: "Nested marker verified.",
              token: expectedCompleteToken,
            }),
          },
        ]),
      },
    ],
    expectedCompleteToken,
    expectedRunId,
    exitCode: 0,
    parserResult: null,
    requiresTestcatIosExecution: true,
    stderr: "",
  }),
  { status: "passed", result: "Nested marker verified." },
);

console.log("run verdict check: OK");
