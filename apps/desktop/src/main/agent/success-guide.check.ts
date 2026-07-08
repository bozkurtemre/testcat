// Durable success-guide check. Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/success-guide.check.ts
import assert from "node:assert/strict";
import type { AgentEvent, TestRun } from "@testcat/shared";
import {
  buildLastSuccessRunGuide,
  lastSuccessGuidePromptBlock,
  SUCCESS_GUIDE_MAX_CHARS,
} from "./success-guide";

const run: TestRun = {
  id: "11111111-1111-4111-8111-111111111111",
  scenarioId: null,
  profileId: "22222222-2222-4222-8222-222222222222",
  name: "Checkout smoke",
  buildPath: "/tmp/MyApp.app",
  physicalBuildPath: null,
  devicePreference: "simulator",
  scenario: "Open the app and verify checkout is available.",
  cli: "opencode",
  model: "ollama/qwen3",
  reasoning: "medium",
  profileName: "opencode smoke",
  profileSkills: ["testcat-ios"],
  profileSystemPrompt: "Drive the app.",
  devices: [],
  status: "passed",
  result: "Checkout verified.",
  successGuide: null,
  durationMs: 12_345,
  startedAt: "2026-06-23T09:00:00.000Z",
  finishedAt: "2026-06-23T09:01:00.000Z",
  createdAt: "2026-06-23T09:00:00.000Z",
};

const events: AgentEvent[] = [
  {
    type: "tool_use",
    name: "bash",
    family: "exec",
    input: { command: "testcat-sim list --json", description: "list sims" },
  },
  {
    type: "tool_result",
    ok: true,
    output: '[{"name":"iPhone 16","udid":"ABC-123","state":"Booted"}]',
  },
  {
    type: "tool_use",
    name: "bash",
    family: "exec",
    input:
      "testcat-sim describe-ui --udid ABC-123",
  },
  {
    type: "tool_result",
    ok: true,
    output:
      '{"root":{"label":"Checkout","children":[{"label":"Pay now"},{"label":"Cart total"}]}}',
  },
  {
    type: "text_delta",
    text: "Checkout was visible after launch and the final screen matched the scenario.",
  },
];

const guide = buildLastSuccessRunGuide({ run, events });
assert(guide.includes("Source run: Checkout smoke"));
assert(guide.includes("testcat-sim list --json"));
assert(guide.includes("visible labels: Checkout, Pay now, Cart total"));
assert(guide.includes("Recompute coordinates"));
assert(guide.length <= SUCCESS_GUIDE_MAX_CHARS);

const block = lastSuccessGuidePromptBlock(guide);
assert(block.startsWith("LAST SUCCESSFUL RUN GUIDE"));
assert(block.includes("Use it to move faster"));
assert.equal(lastSuccessGuidePromptBlock("").length, 0);

console.log("success guide check: OK");
