// Durable exploration-artifact check. Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/explore.check.ts
import assert from "node:assert/strict";
import { parseExplorationArtifact, resolveExplorerProfile } from "./explore";

// Explorer selection: prefer codex, then claude, then opencode; never the weak CLI.
assert.equal(resolveExplorerProfile([{ cli: "ollama" }, { cli: "codex" }, { cli: "claude" }])?.cli, "codex");
assert.equal(resolveExplorerProfile([{ cli: "ollama" }, { cli: "claude" }])?.cli, "claude");
assert.equal(resolveExplorerProfile([{ cli: "ollama" }, { cli: "opencode" }])?.cli, "opencode");
assert.equal(resolveExplorerProfile([{ cli: "ollama" }]), null); // no strong profile → skip
assert.equal(resolveExplorerProfile([]), null);

// A well-formed artifact, even wrapped in prose + a ```json fence, parses and
// derives the credential slots from the login flow's {slot} args.
const good = parseExplorationArtifact(
  [
    "Exploration done. Here is the map:",
    "```json",
    JSON.stringify({
      appMap: "Home has tabs Shared/Pending. Settings via gear top-right.",
      loginFlow: {
        steps: [
          { command: "tap", args: ["tap", "--x", "220", "--y", "254", "--width", "440", "--height", "956"], note: "focus email", expect: "signInWithEmailTextField" },
          { command: "type", args: ["type", "--text", "{email}"], note: "email" },
          { command: "tap", args: ["tap", "--x", "220", "--y", "410", "--width", "440", "--height", "956"], expect: "  " },
          { command: "type", args: ["type", "--text", "{otp}"] },
        ],
      },
    }),
    "```",
  ].join("\n"),
);
assert(good !== null);
assert.match(good.appMap, /Home has tabs/);
assert.equal(good.loginFlow?.steps.length, 4);
assert.deepEqual(good.expectedSlots, ["email", "otp"]); // derived, not trusted from the model
// expect survives parsing; blank/absent expect is dropped, not kept as "".
assert.equal(good.loginFlow?.steps[0].expect, "signInWithEmailTextField");
assert.equal(good.loginFlow?.steps[2].expect, undefined);
assert.equal(good.loginFlow?.steps[3].expect, undefined);

// A build with no auth gate: loginFlow null, no slots.
const noLogin = parseExplorationArtifact(JSON.stringify({ appMap: "Single screen.", loginFlow: null }));
assert(noLogin !== null);
assert.equal(noLogin.loginFlow, null);
assert.deepEqual(noLogin.expectedSlots, []);

// Malformed steps are dropped; a flow left with no valid steps becomes null.
const junkSteps = parseExplorationArtifact(
  JSON.stringify({ appMap: "x", loginFlow: { steps: [{ command: "tap" }, { args: [] }, 7] } }),
);
assert.equal(junkSteps?.loginFlow, null);

// No usable map → null (caller caches nothing).
assert.equal(parseExplorationArtifact("no json here"), null);
assert.equal(parseExplorationArtifact(JSON.stringify({ loginFlow: null })), null); // missing appMap
assert.equal(parseExplorationArtifact("{ not valid json"), null);

console.log("explore check: OK");
