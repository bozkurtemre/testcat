// Part B: per-build exploration.
//
// A strong model explores a build once with NO test goal and emits a structured
// artifact: a concise navigation map plus a replayable login/onboarding flow.
// Every later run of that build reuses it (see resolveAppMap + replayLogin), so
// the expensive discovery — and the auth gate weak models got stuck on — is paid
// once, by a capable model, not re-solved per run by a weak one.
//
// This file holds the artifact contract, the exploration prompt, and the parser
// (all pure + tested). The spawn/drive orchestration that runs the strong-model
// CLI and caches the result is wired separately and validated against a live run.

import { type ChildProcess, spawn } from "node:child_process";
import type { AgentEvent, AgentProfile, Device, LoginFlow, RunRequest } from "@testcat/shared";
import { loginFlowSlots } from "./login-flow";
import { createClaudeParser, type StreamParser } from "./parsers/claude";
import { createCodexParser } from "./parsers/codex";
import { createOpencodeParser } from "./parsers/opencode";
import { buildSpawn } from "./spawn";

export interface ExplorationArtifact {
  /** Concise, scenario-agnostic navigation/screen map (a hint, verified live). */
  appMap: string;
  /** Replayable login template, or null if the build has no auth gate. */
  loginFlow: LoginFlow | null;
  /** Credential slots the login flow references (derived from `{slot}` args). */
  expectedSlots: string[];
}

export function explorationSystemPrompt(): string {
  return [
    "You are Testcat's app explorer. You drive an iOS simulator to MAP a build, not to test it.",
    "There is no pass/fail goal. Your job is to discover, once, what later test runs will reuse.",
    "",
    "Start from a FRESH install: uninstall the app if present, install the build, then launch.",
    "This matters because replay always starts from a fresh install — first-launch gates",
    "(system permission alerts, consent/welcome sheets) WILL appear on every replay.",
    "",
    "Explore with intent, bounded:",
    "- Visit the reachable top-level screens and note how to navigate between them.",
    "- Get from fresh first launch to a logged-in state and record the EXACT steps.",
    "- Do not chase deep flows or edge cases; cover the main navigation surface, then stop.",
    "",
    "Record the login flow as a REPLAYABLE TEMPLATE, never with real account data:",
    "- The flow replays against a fresh install right after launch, with no human help.",
    "  It must contain EVERY step from that state to logged-in, in order: dismissing system",
    "  permission alerts (e.g. tracking consent), welcome/consent screens, navigating to the",
    "  login screen, entering credentials, submitting.",
    "- For each credential field, use a placeholder slot: `--text {email}`, `--text {otp}`, `--text {password}`.",
    "- Record taps as: tap --x <cx> --y <cy> --width <w> --height <h>, where <cx>/<cy> come from",
    "  describe-ui and <w>/<h> are the ROOT frame width/height OF THAT SAME describe-ui output.",
    "  The root frame changes between screens (system alerts use a smaller window than the app),",
    "  so re-read it for every step — a stale width/height makes the tap miss.",
    '- Give every step an "expect": a short LITERAL label or identifier string that is visible in',
    "  describe-ui on the screen this step acts on (copy it exactly from the output). Replay waits",
    "  for it before running the step, and re-taps the previous step when it is missing — this is",
    "  what survives auto-advancing carousels, async screens, and animation timing. Pick strings",
    "  unique to that screen (a button identifier beats a generic word like Continue).",
    "",
    "When finished, output ONE final JSON object and nothing after it:",
    '{"appMap":"<short navigation map: screens + how to reach each>",',
    ' "loginFlow":{"steps":[',
    '   {"command":"tap","args":["tap","--x","210","--y","623","--width","420","--height","912"],"expect":"track your activity","note":"Allow on tracking alert"},',
    '   {"command":"tap","args":["tap","--x","220","--y","254","--width","440","--height","956"],"expect":"signInWithEmailTextField","note":"focus email"},',
    '   {"command":"type","args":["type","--text","{email}"],"expect":"signInWithEmailTextField","note":"email"},',
    '   {"command":"tap","args":["tap","--x","220","--y","410","--width","440","--height","956"],"expect":"signInWithEmailContinueButton","note":"Continue"},',
    '   {"command":"type","args":["type","--text","{otp}"],"expect":"pinTextField","note":"OTP"}',
    " ]}}",
    "If the build has no login gate, still record first-launch dismissal steps (alerts/welcome)",
    "as loginFlow so replay lands on the home screen; use null only if launch needs no steps at all.",
    "Do not include --udid in steps; Testcat injects it at replay time.",
  ].join("\n");
}

export function explorationScenario(buildPath: string): string {
  return [
    `Explore the app build at ${buildPath} on a simulator.`,
    "Uninstall it first if installed, install the build fresh, launch, and record the full",
    "first-launch-to-logged-in flow as a replayable template. Then map the main screens.",
    "Do not run any specific test scenario. Finish with the required final JSON artifact.",
  ].join("\n");
}

// Pull the JSON object out of the agent's final text (which may have prose or
// ```json fences around it), mirroring the lenient extraction the direct runner
// uses for model actions.
function extractJsonObject(text: string): string | null {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  return unfenced.slice(start, end + 1);
}

function coerceLoginFlow(value: unknown): LoginFlow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const steps = (value as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;
  const coerced = steps
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const step = raw as Record<string, unknown>;
      const command = typeof step.command === "string" ? step.command.trim() : "";
      const args = Array.isArray(step.args)
        ? step.args.filter((arg): arg is string => typeof arg === "string")
        : [];
      if (!command || args.length === 0) return null;
      const note = typeof step.note === "string" && step.note.trim() ? step.note.trim() : undefined;
      const expect =
        typeof step.expect === "string" && step.expect.trim() ? step.expect.trim() : undefined;
      return {
        command,
        args,
        ...(note ? { note } : {}),
        ...(expect ? { expect } : {}),
      };
    })
    .filter((step): step is NonNullable<typeof step> => step !== null);
  return coerced.length ? { steps: coerced } : null;
}

/**
 * Parse the exploration agent's final text into a validated artifact. Returns
 * null if there is no usable map (a run with no artifact simply caches nothing).
 */
export function parseExplorationArtifact(text: string): ExplorationArtifact | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const appMap = typeof obj.appMap === "string" ? obj.appMap.trim() : "";
  if (!appMap) return null;
  const loginFlow = coerceLoginFlow(obj.loginFlow);
  return {
    appMap,
    loginFlow,
    expectedSlots: loginFlow ? loginFlowSlots(loginFlow) : [],
  };
}

// --- orchestration (spawns a strong-model CLI to explore; validated live) ---

// Strong CLIs that drive the simulator well, in preference order. The first
// matching profile becomes the explorer; the weak/local CLI (ollama) is the
// one being helped, so it is never picked to explore.
const EXPLORER_CLI_PREFERENCE = ["codex", "claude", "opencode"] as const;

export function resolveExplorerProfile<T extends { cli: string }>(
  profiles: T[],
): T | null {
  for (const cli of EXPLORER_CLI_PREFERENCE) {
    const match = profiles.find((profile) => profile.cli === cli);
    if (match) return match;
  }
  return null;
}

function makeExplorationParser(
  cli: string,
  emit: (event: AgentEvent) => void,
): StreamParser {
  if (cli === "claude") return createClaudeParser(emit);
  if (cli === "opencode") return createOpencodeParser(emit);
  return createCodexParser(emit);
}

export interface ExplorationRunOptions {
  /** Strong base profile — only cli/model/reasoning are used; skills + prompt are forced. */
  base: Pick<AgentProfile, "cli" | "model" | "reasoning">;
  buildPath: string;
  sim: Device;
  emit: (event: AgentEvent) => void;
  env: NodeJS.ProcessEnv;
  /** Lets the caller track the child for cancellation. */
  onChild?: (child: ChildProcess) => void;
}

/**
 * Run one bounded exploration with the strong model and return the parsed
 * artifact (or null if it produced none). Reuses the same spawn + parser path
 * as a normal child-process run; the agent drives the sim via the testcat-ios
 * skill and ends with the structured JSON the prompt asks for.
 */
export async function runExploration(
  opts: ExplorationRunOptions,
): Promise<ExplorationArtifact | null> {
  const profile = {
    cli: opts.base.cli,
    model: opts.base.model,
    reasoning: opts.base.reasoning,
    skills: ["testcat-ios"],
    systemPrompt: explorationSystemPrompt(),
  };
  const req: RunRequest = {
    name: "Build exploration",
    buildPath: opts.buildPath,
    scenario: explorationScenario(opts.buildPath),
    assignedSimulators: [opts.sim],
  };

  let spec: ReturnType<typeof buildSpawn>;
  try {
    // Exploration maps the app — it must NOT assume the testcat-agent QA
    // identity, whose complete-marker contract conflicts with the final-JSON
    // artifact this run ends with.
    spec = buildSpawn(profile, req, { testcatAgent: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    opts.emit({ type: "text_delta", text: `Exploration skipped: ${message}\n` });
    return null;
  }

  const parser = makeExplorationParser(profile.cli, opts.emit);
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(spec.cmd, spec.args, {
        cwd: spec.cwd,
        env: { ...opts.env, ...spec.env },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      opts.emit({ type: "text_delta", text: `Exploration could not start: ${message}\n` });
      resolve(null);
      return;
    }
    opts.onChild?.(child);
    child.stdin?.write(spec.input);
    child.stdin?.end();
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (data: string) => parser.push(data));
    child.stderr?.setEncoding("utf8");
    child.on("error", () => resolve(null));
    child.on("close", () => {
      parser.flush();
      resolve(parseExplorationArtifact(parser.getResult() ?? ""));
    });
  });
}
