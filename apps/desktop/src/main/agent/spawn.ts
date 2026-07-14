import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentProfile, RunRequest } from "@testcat/shared";
import { lastSuccessGuidePromptBlock } from "./success-guide";

export interface SpawnSpec {
  cmd: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  /** Prompt is fed via stdin — avoids positional/variadic-flag conflicts
   *  (e.g. claude's variadic --add-dir would otherwise swallow it). */
  input: string;
}

type SpawnProfile = Pick<
  AgentProfile,
  "cli" | "model" | "reasoning" | "skills" | "systemPrompt"
>;

const OPENCODE_TESTCAT_AGENT = "testcat-runner";
const OPENCODE_TESTCAT_STEPS = 80;

// The QA & Test Automation identity every child-process run should assume.
// Installed by onboarding (like the testcat-ios skill): claude loads it
// natively via --agent; codex/opencode get its body prepended to the prompt.
export const TESTCAT_AGENT_NAME = "testcat-agent";
const TESTCAT_AGENT_FILES = [
  ".claude/agents/testcat-agent.md",
  ".codex/agents/testcat-agent.md",
];

/** Strip the agent file's frontmatter; the markdown body is the identity prompt. */
export function testcatAgentBody(fileContent: string): string {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(fileContent);
  return (match ? fileContent.slice(match[0].length) : fileContent).trim();
}

function readInstalledTestcatAgent(): string | null {
  for (const relative of TESTCAT_AGENT_FILES) {
    const path = join(homedir(), relative);
    if (!existsSync(path)) continue;
    try {
      const body = testcatAgentBody(readFileSync(path, "utf8"));
      if (body) return body;
    } catch {
      // Unreadable install — fall through to the next location / no agent.
    }
  }
  return null;
}

function opencodeTestcatConfigContent(): string {
  return JSON.stringify({
    agent: {
      [OPENCODE_TESTCAT_AGENT]: {
        description: "Testcat non-interactive iOS test runner",
        mode: "primary",
        steps: OPENCODE_TESTCAT_STEPS,
        permission: {
          bash: "allow",
          read: "allow",
          glob: "allow",
          grep: "allow",
          list: "allow",
          task: "deny",
          question: "deny",
          todowrite: "deny",
        },
      },
    },
  });
}

export function isTestcatIosSkill(skill: string): boolean {
  const normalized = skill.trim().toLowerCase();
  return (
    normalized === "testcat-ios" ||
    normalized.endsWith(":testcat-ios") ||
    normalized.endsWith("/testcat-ios")
  );
}

function skillInstructions(profile: SpawnProfile, req: RunRequest): string {
  const skills = profile.skills.map((s) => s.trim()).filter(Boolean);
  if (skills.length === 0) return "";

  const trigger = (skill: string) =>
    profile.cli === "claude" ? `/${skill}` : `$${skill}`;
  const embedsSkillInstructions =
    profile.cli === "codex" || profile.cli === "opencode";
  const executionRule =
    profile.cli === "opencode"
      ? "Do not use `task`, subagents, delegation, parallel agents, or background agents. The main opencode session must make the simulator shell tool calls itself and must emit the final Testcat completion marker itself."
      : profile.cli === "codex"
        ? "Do not call `update_plan`. If the profile or scenario asks for subagents, parallel simulators, or splitting the work, honor that instruction when the CLI/model exposes delegation; keep the main run responsible for the final testcat completion marker. If delegation is unavailable, continue directly and say that subagent tooling was unavailable."
        : "Before executing the scenario, load/use the listed skills with the CLI's native skill mechanism when available.";

  const lines = [
    "Execution contract for this non-interactive test run:",
    ...skills.map((skill) =>
      embedsSkillInstructions
        ? `- ${skill} instructions are embedded here; do not stop to load or discuss the skill trigger.`
        : `- ${skill} (native trigger if available: ${trigger(skill)})`,
    ),
    "",
    executionRule,
    "If a listed skill is unavailable, say so clearly in the run output before continuing.",
    "A plan alone is not a completed test run. Keep any initial plan brief, then execute the scenario with shell tool calls in the same run.",
    "Do not describe future shell commands as if they ran. If you say the simulator was listed, booted, the app was installed, or the UI was verified, there must be an actual shell tool call in the transcript that did it.",
    "Do not ask the user for confirmation or permission during the run. Continue autonomously with the provided scenario, tools, and environment.",
  ];

  if (skills.some(isTestcatIosSkill)) {
    const preferPhysical = req.preferPhysicalDevices === true;
    const listCommand = preferPhysical
      ? "${TESTCAT_DEVICE_BIN:-testcat-device} list --json"
      : "${TESTCAT_SIM_BIN:-testcat-sim} list --json";
    lines.push(
      "",
      "Headless iOS device requirement for testcat-ios:",
      "- `testcat-ios` is a skill/instruction name, not a shell executable. Do not run `which testcat-ios`, `testcat-ios --version`, or any `testcat-ios ...` command.",
      "- The simulator shell CLI is `testcat-sim`. If `TESTCAT_SIM_BIN` is set, use that absolute path; otherwise use `testcat-sim` from PATH.",
      "- The physical iOS shell CLI is `testcat-device`. If `TESTCAT_DEVICE_BIN` is set, use that absolute path; otherwise use `testcat-device` from PATH.",
      req.warmup?.ok
        ? `- Testcat already warmed up the reserved simulator. Your first visible agent action must verify it with a shell tool call such as \`${listCommand.replace("list --json", `describe-ui --udid ${req.warmup.device.udid}`)}\` before any plan or narrative.`
        : `- Your first visible action must be a shell tool call. Run exactly this first command before any plan or narrative: \`${listCommand}\`.`,
      req.warmup?.ok
        ? "- If verification shows the warmed-up app is unavailable, recover on the same reserved simulator before reporting a blocker."
        : "- If that first command fails because the CLI is missing, report the exact error and stop. Otherwise continue from the returned device list.",
      ...(req.assignedSimulators?.length
        ? [
            `- Testcat has reserved simulator UDID(s) for this run: ${req.assignedSimulators.map((device) => `${device.name} (${device.udid})`).join(", ")}.`,
            "- After the required list command, use the reserved simulator UDID(s) for this run. If a reserved simulator is Shutdown, boot that reserved UDID instead of switching to a different already-booted simulator.",
            "- Do not choose a different booted simulator just because it is already open. It may be reserved by another active run.",
          ]
        : []),
      ...(req.assignedSimulators && req.assignedSimulators.length > 1
        ? [
            `- ${req.assignedSimulators.length} simulators are reserved because the scenario requires ${req.assignedSimulators.length} devices. Boot, install, and launch the build on ALL ${req.assignedSimulators.length} reserved UDIDs and drive each one as the scenario describes. Running the scenario on fewer devices than reserved does not satisfy the scenario.${req.warmup?.ok ? " The warmed-up simulator is only the FIRST of them — bring the remaining reserved simulator(s) up yourself before the multi-device steps." : ""}`,
          ]
        : []),
      "- `TESTCAT_IN_USE_DEVICES_JSON` may contain devices reserved by active runs. Never use a simulator reserved by another run.",
      req.warmup?.ok
        ? "- Warm-up already completed list/boot/install/launch/initial describe-ui for the reserved simulator. Continue with verify/interact/complete on that same UDID."
        : "- Required lifecycle sequence: list devices, choose a UDID, boot it if it is a simulator whose state is not Booted, confirm it is ready, install the app, launch the app, then interact/verify.",
      ...(preferPhysical
        ? [
            "- Physical devices are preferred for this run. Read `TESTCAT_ASSIGNED_DEVICES_JSON`; if it contains available physical devices, use those first with `${TESTCAT_DEVICE_BIN:-testcat-device}`.",
            req.physicalBuildPath
              ? "- Physical devices do not use `boot` or `chrome layout`. Prepare the runner with `${TESTCAT_DEVICE_BIN:-testcat-device} prepare --udid <UDID>`, install with `install --udid <UDID> --app <PHYSICAL_APP_OR_IPA>`, launch with `launch --udid <UDID> --bundle-id <BUNDLE_ID>` or `--app <PHYSICAL_APP_OR_IPA>`, inspect with `describe-ui`, and interact with `tap`, `fill`, `type`, `swipe`, `scroll`, `press`, and `screenshot`."
              : `- Physical devices do not use \`boot\` or \`chrome layout\`. The app under test is ALREADY INSTALLED on the device (e.g. a TestFlight build) — do NOT run \`install\` and do not ask for an .ipa. Prepare the runner with \`\${TESTCAT_DEVICE_BIN:-testcat-device} prepare --udid <UDID>\`, then launch with \`launch --udid <UDID> --bundle-id ${req.physicalBundleId ?? "<CFBundleIdentifier from the simulator build's Info.plist>"}\`, inspect with \`describe-ui\`, and interact with \`tap\`, \`fill\`, \`type\`, \`swipe\`, \`scroll\`, \`press\`, and \`screenshot\`.`,
            "- If more devices are required than assigned physical devices, use `testcat-sim` for the remaining simulators.",
          ]
        : []),
      "- To boot a Shutdown simulator, run exactly `${TESTCAT_SIM_BIN:-testcat-sim} boot --udid <UDID>`. Never use `launch` as a boot command.",
      "- Never run `install` against a simulator whose latest listed state is Shutdown. If install fails with `Unable to lookup in current state: Shutdown`, run `boot --udid <UDID>`, re-run `list --json`, then retry install once.",
      req.assignedSimulators?.length
        ? "- Prefer the simulator reserved for this run. Do not switch to another already-running iPhone unless the reserved simulator is unavailable and not owned by another active run."
        : "- Prefer an already running iPhone from `.running`; if none exists, choose the available iPhone with the newest iOS runtime and newest device model, boot it, and continue only after a later list shows that UDID as Booted.",
      "- Do not run `open -a Simulator`, open Simulator.app directly, or use any fallback intended to show the native Simulator window.",
      "- Install with `${TESTCAT_SIM_BIN:-testcat-sim} install --udid <UDID> --app <APP_PATH>` and launch with `${TESTCAT_SIM_BIN:-testcat-sim} launch --udid <UDID> --app <APP_PATH> --terminate-running-process`; both must stay headless against the selected UDID.",
      "- The run is incomplete until you interact with or verify the launched app through `testcat-sim` commands such as `tap`, `type`, `screenshot`, or `describe-ui`.",
      "- Simulator command contract: inspect UI with `${TESTCAT_SIM_BIN:-testcat-sim} describe-ui --udid <UDID>`; it returns element labels/frames. There is no `describe-status` command.",
      "- Simulator taps require coordinates and viewport size: `${TESTCAT_SIM_BIN:-testcat-sim} tap --udid <UDID> --x <centerX> --y <centerY> --width <screenWidth> --height <screenHeight>`. Compute coordinates from `describe-ui` frames. Do not pass `--ui-element`, `--ref`, or accessibility identifiers to simulator `tap`.",
      "- Never use approximate coordinates or coordinates remembered from a previous run. For any UI element returned by the latest `describe-ui`, calculate `centerX = frame.x + frame.width / 2` and `centerY = frame.y + frame.height / 2`, then pass those values to `tap` with the current root frame width/height.",
      "- Simulator typing only accepts text into the currently focused field: first tap the target field by coordinates, then run `${TESTCAT_SIM_BIN:-testcat-sim} type --udid <UDID> --text \"<text>\"`. Do not pass `--ui-element`, bundle ids, or positional text arguments to simulator `type`.",
      "- Every shell/bash tool call must include both a `command` and a short `description` field if the agent CLI requires structured tool input.",
      "- After every interaction command such as `tap`, `type`, `swipe`, `scroll`, or `press`, immediately verify the new app state with `${TESTCAT_SIM_BIN:-testcat-sim} describe-ui --udid <UDID>` or `${TESTCAT_SIM_BIN:-testcat-sim} screenshot --udid <UDID> --output /tmp/testcat-proof.jpg` unless the next command is the final `complete` call.",
      "- Never exit after an interaction command unless the latest successful Testcat CLI output is the `complete` marker. If you are unsure what to do after any tool result, call `complete --status failed --summary \"<specific blocker>\"` instead of stopping silently.",
      "- Text like \"I will tap\" or \"I need to continue\" is not enough. The transcript must continue with the actual shell tool call, then verification or completion.",
      "- When the test is genuinely finished, the final Testcat CLI call must be `${TESTCAT_SIM_BIN:-testcat-sim} complete --status passed --summary \"<short verified result>\"` for simulator-only runs or `${TESTCAT_DEVICE_BIN:-testcat-device} complete --status passed --summary \"<short verified result>\"` for physical-device runs. If the app behavior fails the scenario, use `--status failed` with the observed reason. Without this completion marker, testcat records the run as an error.",
      "- If a real blocker prevents continuing after you tried the headless alternatives, still end the run with `complete --status failed --summary \"<observed blocker>\"` through the Testcat CLI you used for the device so testcat records the terminal result.",
      "- If the required Testcat CLI is unavailable, report the missing CLI in the run output and stop instead of switching to visible Simulator.app or Xcode tooling.",
    );
  }

  return lines.join("\n");
}

function networkCapturePromptBlock(req: RunRequest): string {
  if (!req.captureNetwork || !req.networkProxyUrl) return "";
  return [
    "Network capture is enabled for this Testcat run.",
    `- Testcat started a lightweight local proxy at ${req.networkProxyUrl}.`,
    "- Do not change macOS system proxy settings.",
    "- `testcat-sim launch` configures proxy environment only inside the targeted simulator launch domain for the app launch, then restores it. It does not route the whole Mac through Testcat.",
    "- Only simulator apps launched by this run are asked to send proxy-aware HTTP/HTTPS traffic to the Network panel.",
    `- To inspect captured traffic from shell, read ${req.networkProxyUrl}/__testcat/events.`,
    "- Do not set HTTP_PROXY or HTTPS_PROXY for the agent CLI or model provider process.",
  ].join("\n");
}

function warmupPromptBlock(req: RunRequest): string {
  if (!req.warmup) return "";
  const device = req.warmup.device;
  if (!req.warmup.ok) {
    return [
      "Testcat warm-up was attempted before the agent started, but it failed.",
      `- Reserved simulator: ${device.name} (${device.udid})`,
      `- Error: ${req.warmup.error ?? req.warmup.summary}`,
      "- Continue with the normal Testcat lifecycle on the reserved simulator if possible. Do not switch to another in-use simulator.",
    ].join("\n");
  }
  return [
    "Testcat warm-up already completed before the agent started.",
    `- Reserved simulator: ${device.name} (${device.udid})`,
    `- ${req.warmup.summary}`,
    "- The app is already installed and launched on this simulator.",
    "- Start by verifying the current UI on this same UDID with `describe-ui`; do not repeat device selection, install, or launch unless verification shows the app is not running.",
    req.warmup.ui
      ? `- Latest warm-up UI snapshot: ${truncateInline(req.warmup.ui, 1_500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function truncateInline(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length <= max
    ? cleaned
    : `${cleaned.slice(0, max - 16).trim()} ...[truncated]`;
}

// Claude/Codex run with bypass flags so the agent can drive the simulator (run
// the testcat skill / shell commands) without interactive permission prompts.
// opts.testcatAgent: undefined → read the installed agent file; null → run
// without the identity (not installed); string → use as the identity body.
export function buildSpawn(
  profile: SpawnProfile,
  req: RunRequest,
  opts: { testcatAgent?: string | null } = {},
): SpawnSpec {
  const testcatAgent =
    opts.testcatAgent === undefined
      ? readInstalledTestcatAgent()
      : opts.testcatAgent;
  const buildDir = req.buildPath ? dirname(req.buildPath) : process.cwd();
  const skillBlock = skillInstructions(profile, req);
  const preferPhysical = req.preferPhysicalDevices === true;
  const firstListCommand = preferPhysical
    ? "`${TESTCAT_DEVICE_BIN:-testcat-device} list --json`"
    : "`${TESTCAT_SIM_BIN:-testcat-sim} list --json`";
  const warmupCommand = req.warmup?.ok
    ? `\`\${TESTCAT_SIM_BIN:-testcat-sim} describe-ui --udid ${req.warmup.device.udid}\``
    : null;
  const commandFirstBlock = profile.skills.some(isTestcatIosSkill)
    ? [
        "COMMAND-FIRST REQUIREMENT:",
        warmupCommand
          ? "Before writing any plan, explanation, or status text, verify the already warmed-up simulator with this shell command:"
          : "Before writing any plan, explanation, or status text, run this shell command exactly:",
        warmupCommand ?? firstListCommand,
        "Only after that tool result may you continue with the scenario.",
      ].join("\n")
    : "";

  const buildLines = [];
  if (req.buildPath) {
    buildLines.push(
      `Simulator build under test (install & launch headlessly on selected simulator UDIDs; never open Simulator.app): ${req.buildPath}`,
    );
  }
  if (preferPhysical && req.physicalBuildPath) {
    buildLines.push(
      `Physical-device build under test (install & launch headlessly on selected physical iOS UDIDs): ${req.physicalBuildPath}`,
    );
  }
  if (preferPhysical && !req.physicalBuildPath) {
    buildLines.push(
      `No separate physical build was provided: the app under test is already installed on the physical device (e.g. via TestFlight). Skip install and launch it by bundle id${req.physicalBundleId ? ` (${req.physicalBundleId})` : ""}.`,
    );
  }
  if (preferPhysical) {
    buildLines.push(
      "Physical device preference is enabled. Use assigned physical devices first, then simulator fallback only if the scenario requires additional devices or physical setup is unavailable.",
    );
  }
  const scenario = buildLines.length
    ? `${req.scenario}\n\n${buildLines.join("\n")}`
    : req.scenario;
  const task = [
    commandFirstBlock,
    skillBlock,
    warmupPromptBlock(req),
    lastSuccessGuidePromptBlock(req.lastSuccessGuide),
    networkCapturePromptBlock(req),
    scenario,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (profile.cli === "claude") {
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      profile.model,
      "--effort",
      profile.reasoning,
      "--permission-mode",
      "bypassPermissions",
      // The QA agent tests the app; it never edits code or files.
      "--disallowedTools",
      "Write",
      "Edit",
      "NotebookEdit",
    ];
    // Run AS the installed QA identity; its agent file also carries the tool
    // allowlist. The profile's own prompt still appends on top.
    if (testcatAgent) args.push("--agent", TESTCAT_AGENT_NAME);
    if (profile.systemPrompt.trim()) {
      args.push("--append-system-prompt", profile.systemPrompt);
    }
    args.push("--add-dir", buildDir); // variadic — keep last so it only takes the dir
    return { cmd: "claude", args, cwd: buildDir, input: task };
  }
  if (profile.cli !== "codex" && profile.cli !== "opencode") {
    throw new Error(`${profile.cli} does not use the child-process spawn path`);
  }

  // Codex/opencode have no --append-system-prompt or agent files, so compose
  // identity + system + task into stdin.
  const composed = [testcatAgent, profile.systemPrompt.trim(), task]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("\n\n");
  if (profile.cli === "opencode") {
    const args = [
      "run",
      "--format",
      "json",
      "--pure",
      "--dangerously-skip-permissions",
      "--agent",
      OPENCODE_TESTCAT_AGENT,
      "-m",
      profile.model,
      "--dir",
      buildDir,
    ];
    return {
      cmd: "opencode",
      args,
      cwd: buildDir,
      env: { OPENCODE_CONFIG_CONTENT: opencodeTestcatConfigContent() },
      input: composed,
    };
  }

  const args = [
    "exec",
    "--json",
    "-m",
    profile.model,
    "-c",
    `model_reasoning_effort=${profile.reasoning}`,
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    "-C",
    buildDir,
  ];
  return { cmd: "codex", args, cwd: buildDir, input: composed };
}
