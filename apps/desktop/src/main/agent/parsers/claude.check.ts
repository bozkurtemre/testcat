// Durable parser check (no spawn). Run: pnpm dlx tsx <thisfile>
import assert from "node:assert";
import type { AgentEvent } from "@testcat/shared";
import { createClaudeParser } from "./claude";

const lines =
  [
    JSON.stringify({ type: "system", subtype: "init" }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "plan" },
          { type: "text", text: "Tapping the button." },
          { type: "tool_use", name: "Bash", input: { command: "baguette tap" } },
        ],
      },
    }),
    JSON.stringify({
      type: "user",
      message: {
        content: [{ type: "tool_result", is_error: false, content: "ok" }],
      },
    }),
    JSON.stringify({
      type: "result",
      result: "Test passed.",
      usage: { input_tokens: 5, output_tokens: 9 },
    }),
  ].join("\n") + "\n";

const events: AgentEvent[] = [];
const p = createClaudeParser((e) => events.push(e));
// Feed in two chunks to exercise buffering across a split line.
const mid = Math.floor(lines.length / 2);
p.push(lines.slice(0, mid));
p.push(lines.slice(mid));
p.flush();

assert.deepStrictEqual(
  events.map((e) => e.type),
  ["thinking_delta", "text_delta", "tool_use", "tool_result", "usage", "status"],
);
const tool = events.find((e) => e.type === "tool_use");
assert(tool?.type === "tool_use" && tool.family === "exec", "Bash → exec");
const res = events.find((e) => e.type === "tool_result");
assert(res?.type === "tool_result" && res.ok === true, "tool_result ok");
assert.strictEqual(p.getResult(), "Test passed.");
console.log(`claude parser check: OK (${events.length} events)`);
