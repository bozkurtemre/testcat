// Durable opencode parser check. Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/parsers/opencode.check.ts
import assert from "node:assert/strict";
import type { AgentEvent } from "@testcat/shared";
import { createOpencodeParser } from "./opencode";

const events: AgentEvent[] = [];
const parser = createOpencodeParser((event) => events.push(event));

parser.push(
  [
    JSON.stringify({
      type: "text",
      part: { type: "text", text: "OK" },
    }),
    JSON.stringify({
      type: "tool_use",
      part: {
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "printf testcat-opencode-ok" },
          output: "testcat-opencode-ok",
        },
      },
    }),
    JSON.stringify({
      type: "step_finish",
      part: { tokens: { input: 12, output: 3, reasoning: 1 } },
    }),
    JSON.stringify({
      type: "error",
      error: {
        name: "UnknownError",
        data: { message: "Model not found: ollama/gemma4:e4b-mlx" },
      },
    }),
  ].join("\n"),
);
parser.flush();

assert.deepEqual(events[0], { type: "text_delta", text: "OK" });
assert.deepEqual(events[1], {
  type: "tool_use",
  name: "bash",
  family: "exec",
  input: { command: "printf testcat-opencode-ok" },
});
assert.deepEqual(events[2], {
  type: "tool_result",
  ok: true,
  output: "testcat-opencode-ok",
});
assert.deepEqual(events[3], {
  type: "usage",
  inputTokens: 12,
  outputTokens: 3,
});
assert.deepEqual(events[4], {
  type: "text_delta",
  text: "UnknownError: Model not found: ollama/gemma4:e4b-mlx",
});
assert.equal(parser.getResult(), "OK");
assert.equal(events.at(-1)?.type, "status");

const errorOnlyEvents: AgentEvent[] = [];
const errorOnly = createOpencodeParser((event) => errorOnlyEvents.push(event));
errorOnly.push(
  JSON.stringify({
    type: "error",
    error: {
      name: "APIError",
      data: { message: "model 'gemma4:e4b' not found" },
    },
  }),
);
errorOnly.flush();
assert.equal(
  errorOnly.getResult(),
  "APIError: model 'gemma4:e4b' not found",
);

const failedToolEvents: AgentEvent[] = [];
const failedTool = createOpencodeParser((event) => failedToolEvents.push(event));
failedTool.push(
  JSON.stringify({
    type: "tool_use",
    part: {
      type: "tool",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "testcat-sim tap --ui-element foo" },
        output: "Error: Missing expected argument '--x <x>'",
        metadata: { exit: 64 },
      },
    },
  }),
);
failedTool.flush();
assert.deepEqual(failedToolEvents[1], {
  type: "tool_result",
  ok: false,
  output: "Error: Missing expected argument '--x <x>'",
});
assert.equal(failedTool.getSessionId?.(), null);

const emptyStop = createOpencodeParser(() => undefined);
emptyStop.push(
  JSON.stringify({
    type: "step_finish",
    sessionID: "ses_testcat",
    part: { reason: "stop", tokens: { input: 21414, output: 0 } },
  }),
);
emptyStop.flush();
assert.match(emptyStop.getResult() ?? "", /steps` limit/);
assert.equal(emptyStop.getSessionId?.(), "ses_testcat");

const narrativeThenEmptyStop = createOpencodeParser(() => undefined);
narrativeThenEmptyStop.push(
  [
    JSON.stringify({
      type: "text",
      part: { type: "text", text: "I will tap the button next." },
    }),
    JSON.stringify({
      type: "step_finish",
      part: { reason: "stop", tokens: { input: 19000, output: 0 } },
    }),
  ].join("\n"),
);
narrativeThenEmptyStop.flush();
assert.match(narrativeThenEmptyStop.getResult() ?? "", /steps` limit/);

console.log("opencode parser check: OK");
