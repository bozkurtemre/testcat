// Durable scenario enhancer check.
// Run: pnpm --filter @testcat/desktop exec tsx src/main/scenario-enhancer.check.ts
import assert from "node:assert/strict";
import {
  parseEnhancedScenarioResponse,
  parseEnhancedSystemPromptResponse,
} from "./scenario-enhancer";

assert.equal(
  parseEnhancedScenarioResponse(
    JSON.stringify({
      scenario: "Open the app, sign in, and verify that the dashboard appears.",
    }),
  ),
  "Open the app, sign in, and verify that the dashboard appears.",
);

assert.equal(
  parseEnhancedScenarioResponse(
    '```json\n{"scenario":"Create a new @teknasyon.com account and verify code 111111."}\n```',
  ),
  "Create a new @teknasyon.com account and verify code 111111.",
);

assert.throws(
  () => parseEnhancedScenarioResponse("Rewrite the scenario as prose."),
  /not valid JSON/,
);

assert.throws(
  () => parseEnhancedScenarioResponse('{"summary":"missing scenario"}'),
  /missing scenario/,
);

assert.equal(
  parseEnhancedSystemPromptResponse(
    JSON.stringify({
      systemPrompt:
        "You are an autonomous iOS simulator testing agent. Use @teknasyon.com test accounts.",
    }),
  ),
  "You are an autonomous iOS simulator testing agent. Use @teknasyon.com test accounts.",
);

assert.equal(
  parseEnhancedSystemPromptResponse(
    '```json\n{"systemPrompt":"Always use credit card payment with card number 4111111111111111."}\n```',
  ),
  "Always use credit card payment with card number 4111111111111111.",
);

assert.throws(
  () => parseEnhancedSystemPromptResponse('{"scenario":"wrong field"}'),
  /missing systemPrompt/,
);

console.log("scenario enhancer check: OK");
