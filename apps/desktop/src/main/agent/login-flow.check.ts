// Durable login-flow check. Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/login-flow.check.ts
import assert from "node:assert/strict";
import {
  expandCredentialTemplate,
  fillLoginFlow,
  type LoginFlow,
  loginFlowSlots,
  MissingCredentialError,
  redactCommand,
  REDACTION,
} from "./login-flow";

const flow: LoginFlow = {
  steps: [
    { command: "tap", args: ["tap", "--ref", "emailField"], note: "focus email", expect: "emailField" },
    { command: "type", args: ["type", "--text", "{email}"], note: "type email" },
    { command: "tap", args: ["tap", "--ref", "continueButton"] },
    { command: "type", args: ["type", "--text", "{otp}"], note: "type OTP" },
  ],
};

// Slots are discovered from `{slot}` args, deduped, in first-seen order.
assert.deepEqual(loginFlowSlots(flow), ["email", "otp"]);

// Filling substitutes the current run's account and marks the values secret.
const filled = fillLoginFlow(flow, { email: "alice@example.com", otp: "424242" });
assert.deepEqual(filled[1].args, ["type", "--text", "alice@example.com"]);
assert.deepEqual(filled[1].secrets, ["alice@example.com"]);
assert.deepEqual(filled[3].args, ["type", "--text", "424242"]);
// Non-slot steps carry no secrets.
assert.deepEqual(filled[0].secrets, []);
assert.equal(filled[2].note, undefined);
// expect rides along into the filled steps for replay's screen-state gate.
assert.equal(filled[0].expect, "emailField");
assert.equal(filled[1].expect, undefined);

// A different run, a different account — same flow.
const filledBob = fillLoginFlow(flow, { email: "bob@example.com", otp: "111111" });
assert.deepEqual(filledBob[1].args, ["type", "--text", "bob@example.com"]);

// Missing (or empty) credential fails fast, naming the slot.
assert.throws(
  () => fillLoginFlow(flow, { email: "x@y.z" }),
  (error: unknown) =>
    error instanceof MissingCredentialError && error.slot === "otp",
);
assert.throws(() => fillLoginFlow(flow, { email: "", otp: "1" }), MissingCredentialError);

// Template expansion: {testId} = run id's first 8 chars, {simIndex} = 1-based
// device index — a fresh account per run without per-run typing.
assert.deepEqual(
  expandCredentialTemplate(
    { email: "{testId}-sim-{simIndex}@corp.com", otp: "111111" },
    { runId: "8f3a2c9b-aaaa-bbbb-cccc-dddddddddddd", simIndex: 2 },
  ),
  { email: "8f3a2c9b-sim-2@corp.com", otp: "111111" },
);
assert.deepEqual(expandCredentialTemplate(null, { runId: "x", simIndex: 1 }), {});
assert.deepEqual(expandCredentialTemplate(undefined, { runId: "x", simIndex: 1 }), {});
// Expanded template output feeds fillLoginFlow directly.
const templated = fillLoginFlow(
  flow,
  expandCredentialTemplate(
    { email: "{testId}-sim-{simIndex}@corp.com", otp: "111111" },
    { runId: "12345678-rest-of-run-id", simIndex: 1 },
  ),
);
assert.deepEqual(templated[1].args, ["type", "--text", "12345678-sim-1@corp.com"]);

// Redaction masks every occurrence so creds never hit the event stream / DB.
const command = "testcat-sim type --udid U --text alice@example.com";
assert.equal(
  redactCommand(command, ["alice@example.com"]),
  `testcat-sim type --udid U --text ${REDACTION}`,
);
assert.equal(redactCommand("nothing secret here", []), "nothing secret here");

console.log("login flow check: OK");
