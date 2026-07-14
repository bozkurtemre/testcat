// Durable spawn prompt check. Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/spawn.check.ts
import assert from "node:assert/strict";
import { buildSpawn, testcatAgentBody } from "./spawn";

// Pass testcatAgent explicitly everywhere so the check does not depend on
// whether the running machine has the agent file installed.
const NO_AGENT = { testcatAgent: null };

const req = {
  name: "Parallel eSIM smoke",
  buildPath: "/tmp/MyApp.app",
  profileId: "profile-1",
  scenario:
    "Subagentlar kullanarak paralel test yap; iki simülatörde login ve payment flowlarını böl.",
};

const reservedSimulator = {
  udid: "33333333-3333-4333-8333-333333333333",
  name: "iPhone 17",
  state: "Booted",
  runtime: "iOS 26.5",
  isBooted: true,
  kind: "simulator" as const,
  provider: "testcat-sim" as const,
};

const codexGpt = buildSpawn(
  {
    cli: "codex",
    model: "gpt-5-codex",
    reasoning: "high",
    skills: ["testcat-ios"],
    systemPrompt:
      "Subagentlar kullanarak paralel test yap. Testin başında işi subagentlara böl.",
  },
  req,
  NO_AGENT,
);

assert.match(codexGpt.input, /subagents, parallel simulators, or splitting the work/i);
assert.doesNotMatch(codexGpt.input, /do not delegate to subagents/i);
assert.doesNotMatch(codexGpt.input, /Treat any request to plan or split among subagents as internal strategy only/i);

const opencodeOllama = buildSpawn(
  {
    cli: "opencode",
    model: "ollama/gemma4:e4b",
    reasoning: "medium",
    skills: ["testcat-ios"],
    systemPrompt: "Use shell tools to drive the simulator.",
  },
  req,
  NO_AGENT,
);

assert.equal(opencodeOllama.cmd, "opencode");
assert.deepEqual(opencodeOllama.args, [
  "run",
  "--format",
  "json",
  "--pure",
  "--dangerously-skip-permissions",
  "--agent",
  "testcat-runner",
  "-m",
  "ollama/gemma4:e4b",
  "--dir",
  "/tmp",
]);
assert.ok(opencodeOllama.env?.OPENCODE_CONFIG_CONTENT);
const opencodeConfig = JSON.parse(opencodeOllama.env.OPENCODE_CONFIG_CONTENT);
assert.equal(opencodeConfig.agent["testcat-runner"].steps, 80);
assert.equal(
  opencodeConfig.agent["testcat-runner"].permission.task,
  "deny",
);
assert.match(opencodeOllama.input, /Use shell tools to drive the simulator/);
assert.match(opencodeOllama.input, /testcat-ios instructions are embedded here/i);
assert.match(opencodeOllama.input, /Do not use `task`, subagents, delegation/i);
assert.match(opencodeOllama.input, /There is no `describe-status` command/);
assert.match(opencodeOllama.input, /Do not pass `--ui-element`/);
assert.match(opencodeOllama.input, /Never use approximate coordinates/i);
assert.match(opencodeOllama.input, /type --udid <UDID> --text/);
assert.match(opencodeOllama.input, /command` and a short `description` field/);
assert.match(opencodeOllama.input, /After every interaction command/i);
assert.match(opencodeOllama.input, /Never exit after an interaction command/i);

const codexWithGuide = buildSpawn(
  {
    cli: "codex",
    model: "gpt-5-codex",
    reasoning: "medium",
    skills: ["testcat-ios"],
    systemPrompt: "",
  },
  {
    ...req,
    assignedSimulators: [reservedSimulator],
    lastSuccessGuide:
      "Source run: previous pass\nSuccessful command sequence:\n1. testcat-sim list --json",
  },
  NO_AGENT,
);

assert.match(codexWithGuide.input, /LAST SUCCESSFUL RUN GUIDE/);
assert.match(codexWithGuide.input, /Source run: previous pass/);
assert.match(codexWithGuide.input, /verify the current UI before each action/i);
assert.match(codexWithGuide.input, /reserved simulator UDID/i);
assert.match(codexWithGuide.input, /33333333-3333-4333-8333-333333333333/);
// single reserved sim → no multi-device directive
assert.doesNotMatch(codexWithGuide.input, /ALL \d+ reserved UDIDs/);

const codexMultiSim = buildSpawn(
  {
    cli: "codex",
    model: "gpt-5-codex",
    reasoning: "medium",
    skills: ["testcat-ios"],
    systemPrompt: "",
  },
  {
    ...req,
    assignedSimulators: [
      reservedSimulator,
      { ...reservedSimulator, udid: "44444444-4444-4444-8444-444444444444" },
    ],
    warmup: {
      ok: true,
      device: reservedSimulator,
      summary: "Warm-up completed on iPhone 17.",
      ui: "{}",
    },
  },
  NO_AGENT,
);
assert.match(codexMultiSim.input, /scenario requires 2 devices/);
assert.match(codexMultiSim.input, /ALL 2 reserved UDIDs/);
assert.match(codexMultiSim.input, /warmed-up simulator is only the FIRST/);
assert.match(codexMultiSim.input, /\.running \+ \.available/);

const codexWithWarmup = buildSpawn(
  {
    cli: "codex",
    model: "gpt-5-codex",
    reasoning: "medium",
    skills: ["testcat-ios"],
    systemPrompt: "",
  },
  {
    ...req,
    assignedSimulators: [reservedSimulator],
    warmup: {
      ok: true,
      device: reservedSimulator,
      summary:
        "Warm-up completed on iPhone 17. App was installed, launched, and inspected.",
      ui: '{"label":"Home","frame":{"x":0,"y":0,"width":393,"height":852}}',
    },
  },
  NO_AGENT,
);

assert.match(codexWithWarmup.input, /Testcat warm-up already completed/i);
assert.match(
  codexWithWarmup.input,
  /\$\{TESTCAT_SIM_BIN:-testcat-sim\} describe-ui --udid 33333333-3333-4333-8333-333333333333/,
);
assert.doesNotMatch(codexWithWarmup.input, /<reserved-UDID>/);
assert.match(codexWithWarmup.input, /do not repeat device selection, install, or launch/i);

// TestFlight path: no physical build → the agent must skip install and
// launch the device's installed app by bundle id.
const codexTestFlight = buildSpawn(
  {
    cli: "codex",
    model: "gpt-5.5",
    reasoning: "medium",
    skills: ["testcat-ios"],
    systemPrompt: "",
  },
  {
    ...req,
    preferPhysicalDevices: true,
    physicalBundleId: "io.esim",
  },
  NO_AGENT,
);
assert.match(codexTestFlight.input, /ALREADY INSTALLED on the device/);
assert.match(codexTestFlight.input, /launch --udid <UDID> --bundle-id io\.esim/);
assert.match(codexTestFlight.input, /do NOT run `install`/);
assert.match(codexTestFlight.input, /already installed on the physical device \(e\.g\. via TestFlight\)/);
// With an explicit physical build, install flow stays.
const codexIpa = buildSpawn(
  {
    cli: "codex",
    model: "gpt-5.5",
    reasoning: "medium",
    skills: ["testcat-ios"],
    systemPrompt: "",
  },
  { ...req, preferPhysicalDevices: true, physicalBuildPath: "/tmp/MyApp.ipa" },
  NO_AGENT,
);
assert.match(codexIpa.input, /install --udid <UDID> --app <PHYSICAL_APP_OR_IPA>/);
assert.doesNotMatch(codexIpa.input, /ALREADY INSTALLED on the device/);

// testcat-agent identity: frontmatter is stripped, the body is the prompt.
assert.equal(
  testcatAgentBody("---\nname: testcat-agent\ntools: Bash\n---\n\n# QA identity\nBe autonomous.\n"),
  "# QA identity\nBe autonomous.",
);
assert.equal(testcatAgentBody("no frontmatter body"), "no frontmatter body");

const QA_IDENTITY = "# QA identity\nNever ask the user anything.";
const claudeProfile = {
  cli: "claude" as const,
  model: "sonnet",
  reasoning: "high" as const,
  skills: ["testcat-ios"],
  systemPrompt: "Profile rules here.",
};
// Claude runs AS the installed agent (CLI loads its file) and never gets
// Write/Edit; the identity body is not duplicated into the prompt.
const claudeWithAgent = buildSpawn(claudeProfile, req, { testcatAgent: QA_IDENTITY });
assert.ok(claudeWithAgent.args.includes("--agent"));
assert.equal(
  claudeWithAgent.args[claudeWithAgent.args.indexOf("--agent") + 1],
  "testcat-agent",
);
assert.ok(claudeWithAgent.args.includes("--disallowedTools"));
assert.ok(claudeWithAgent.args.includes("Write"));
assert.ok(claudeWithAgent.args.includes("Edit"));
assert.doesNotMatch(claudeWithAgent.input, /QA identity/);
// Without the installed agent: no --agent flag, but code stays untouchable.
const claudeNoAgent = buildSpawn(claudeProfile, req, NO_AGENT);
assert.equal(claudeNoAgent.args.includes("--agent"), false);
assert.ok(claudeNoAgent.args.includes("--disallowedTools"));
// Codex has no agent files: the identity body leads the composed prompt.
const codexWithAgent = buildSpawn(
  { ...claudeProfile, cli: "codex" as const, model: "gpt-5.5" },
  req,
  { testcatAgent: QA_IDENTITY },
);
assert.ok(codexWithAgent.input.startsWith(QA_IDENTITY));
assert.match(codexWithAgent.input, /Profile rules here\./);

console.log("spawn prompt check: OK");
