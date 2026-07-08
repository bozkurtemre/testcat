import { execFile, type ChildProcess } from "node:child_process";
import { dirname } from "node:path";
import type {
  AgentEvent,
  AgentProfileInput,
  RunRequest,
  TestStatus,
} from "@testcat/shared";
import { resolveDeviceBin } from "../devices/device-binary";
import { resolveSimBin } from "../devices/sim-binary";
import { ollamaBaseUrl } from "../ollama-codex";
import { appMapPromptBlock } from "./app-map";
import {
  expandCredentialTemplate,
  fillLoginFlow,
  redactCommand,
} from "./login-flow";
import { lastSuccessGuidePromptBlock } from "./success-guide";

const MAX_DEVICES = 4;
const MAX_STEPS_PER_DEVICE = 180;
const MODEL_TIMEOUT_MS = 120_000;
const SIM_COMMAND_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 10 * 1024 * 1024;
const MODEL_MAX_OUTPUT_TOKENS = 512;
const MODEL_HISTORY_TAIL_MESSAGES = 4;
const INITIAL_LAYOUT_CHARS = 6_000;
const INITIAL_UI_CHARS = 12_000;
const FOLLOW_UP_OUTPUT_CHARS = 10_000;
const FAILED_COMMAND_OUTPUT_CHARS = 6_000;
const REPEATED_MUTATING_ACTION_WARNING_COUNT = 3;
const REPEATED_MUTATING_ACTION_FAILURE_COUNT = 5;
// Oscillation guard: the repeated-action guard above only catches the *same*
// action against the *same* screen. A weak model loops across a small set of
// screens with varying actions (tap email → type → Continue → back to email)
// and produces slightly-different fingerprints, so a "consecutive revisits"
// counter never trips. Instead, watch screen *diversity in a sliding window*:
// if the last NO_PROGRESS_WINDOW observations cover <= NO_PROGRESS_MAX_DISTINCT
// screens, the model is circling. Warn on first detection; only fail once it has
// also spent NO_PROGRESS_FLOOR_OBSERVATIONS, so a short/healthy run that finishes
// fast is never judged as circling.
//
// Calibrated against real stuck gemma runs (51 obs/22 screens and 22 obs/15
// screens): these values fire ~halfway through the 51-obs circling run after a
// nudge, and never fire during its genuine first-13-obs exploration. ponytail:
// these are tuning knobs — adjust against real runs if false-positives appear on
// legitimately narrow tests (data-entry forms that re-describe a few screens).
const NO_PROGRESS_WINDOW = 12;
const NO_PROGRESS_MAX_DISTINCT = 5;
const NO_PROGRESS_FLOOR_OBSERVATIONS = 24;
// Hard-stuck tier: a full window covering only 1-2 screens (parked on one
// alert/screen) is unambiguous — fail earlier instead of burning the user's
// patience waiting for the full floor. ponytail: tuning knobs like the above.
const HARD_STUCK_MAX_DISTINCT = 2;
const HARD_STUCK_FLOOR_OBSERVATIONS = 18;
// Recorded login-replay steps run back-to-back with no model in the loop, so
// give the app time to animate/network between steps (OTP screens load async).
const REPLAY_STEP_SETTLE_MS = 2_000;
// Complete gate: an RL-tuned local model can claim success without doing any
// work (observed live: ornith:35b called complete(passed) after ONE describe,
// zero test actions, with a fully hallucinated multi-case report). A PASSED
// completion needs minimal evidence of effort; a failed completion is always
// accepted. Repeated hollow claims fail the run honestly instead of passing
// it falsely. ponytail: thresholds are tuning knobs like the breaker's.
const COMPLETE_MIN_MUTATING_ACTIONS = 3;
const COMPLETE_MIN_OBSERVATIONS = 3;
const COMPLETE_MAX_REJECTIONS = 2;
// A step's `expect` marker must show up in describe-ui before the step runs.
// Poll for it, and when it never appears, re-tap the previous step a bounded
// number of times — auto-advancing carousels/gates often just need the same
// dismiss tap again. ponytail: fixed budgets; tune against real replays.
const REPLAY_EXPECT_POLL_MS = 1_500;
const REPLAY_EXPECT_TIMEOUT_MS = 12_000;
const REPLAY_MAX_PREVIOUS_RETAPS = 4;
const SCREEN_WIDTH_PLACEHOLDER = "__TESTCAT_SCREEN_WIDTH__";
const SCREEN_HEIGHT_PLACEHOLDER = "__TESTCAT_SCREEN_HEIGHT__";

type Emit = (event: AgentEvent) => void;

export interface DirectMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RawDevice {
  id?: unknown;
  udid?: unknown;
  name?: unknown;
  state?: unknown;
  runtime?: unknown;
  isBooted?: unknown;
  kind?: unknown;
}

interface Device {
  udid: string;
  name: string;
  state: string;
  runtime: string;
  isBooted: boolean;
  kind?: "simulator" | "physical";
}

interface ScreenSize {
  width: number;
  height: number;
}

interface DeviceContext {
  device: Device;
  simIndex: number;
  layout: string;
  ui: string;
}

type OllamaAction =
  | { action: "run_testcat_sim"; args: string[]; note: string | null }
  | { action: "complete"; status: "passed" | "failed"; summary: string };

export interface ModelReply {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface PlannerDecision {
  simulatorCount: number;
  parallel: boolean;
  reason: string;
}

export interface OllamaDirectResult {
  status: TestStatus;
  result: string | null;
}

export interface OllamaDirectHandle {
  cancel(): void;
  finished: Promise<OllamaDirectResult>;
}

export interface OllamaDirectOptions {
  req: RunRequest;
  profile: AgentProfileInput;
  runId: string;
  completeToken: string;
  emit: Emit;
  env?: NodeJS.ProcessEnv;
}

class CancelledError extends Error {
  constructor() {
    super("Cancelled by user");
  }
}

const shellMetaPattern = /(?:;|&&|\|\||\||>|<|`|\$\(|\n|\r|\0)/;
const freeformValueFlags = new Set(["--summary", "--text"]);
const mutatingSubcommands = new Set([
  "tap",
  "double-tap",
  "swipe",
  "pinch",
  "pan",
  "scroll",
  "press",
  "key",
  "click",
  "fill",
  "type",
]);
const screenSizedGestureSubcommands = new Set([
  "tap",
  "double-tap",
  "swipe",
  "pinch",
  "pan",
]);
const udidScopedModelSubcommands = new Set([
  "prepare",
  "boot",
  "terminate",
  "uninstall",
  "describe-ui",
  "click",
  "tap",
  "double-tap",
  "swipe",
  "pinch",
  "pan",
  "scroll",
  "press",
  "key",
  "fill",
  "type",
  "screenshot",
]);

export function validateTestcatSimArgs(
  value: unknown,
  options: { allowComplete?: boolean } = {},
): string[] {
  if (!Array.isArray(value)) throw new Error("args must be an array");
  const args = value.map((item) => {
    if (typeof item !== "string") throw new Error("args must contain strings only");
    if (!item.trim()) throw new Error("args cannot contain empty strings");
    return item;
  });
  if (args.length === 0) throw new Error("args cannot be empty");
  args.forEach((item, index) => {
    if (freeformValueFlags.has(args[index - 1] ?? "")) return;
    if (shellMetaPattern.test(item)) throw new Error("shell syntax is not allowed in args");
  });

  const first = args[0];
  const single = new Set([
    "list",
    "prepare",
    "boot",
    "install",
    "launch",
    "terminate",
    "uninstall",
    "click",
    "tap",
    "double-tap",
    "swipe",
    "pinch",
    "pan",
    "scroll",
    "press",
    "key",
    "fill",
    "type",
    "screenshot",
    "describe-ui",
  ]);
  if (options.allowComplete) single.add("complete");

  if (first === "chrome") {
    if (args[1] !== "layout") throw new Error("only `chrome layout` is allowed");
    requireFlags(args, ["--udid"], "chrome layout");
    rejectUnsupportedFlags(
      args.slice(1),
      ["--udid", "--device-set"],
      "chrome layout",
      "Use chrome layout only to read simulator screen dimensions.",
    );
    return args;
  }
  if (!single.has(first)) throw new Error(`testcat-sim subcommand is not allowed: ${first}`);
  validateSubcommandShape(first, args);
  if (first === "screenshot" && !args.includes("--output")) {
    throw new Error("screenshot must write to --output in Testcat Direct");
  }
  return args;
}

function requireFlags(args: string[], flags: string[], command: string): void {
  for (const flag of flags) {
    if (!args.includes(flag)) throw new Error(`${command} requires ${flag}`);
  }
}

function requireAnyFlag(args: string[], flags: string[], command: string): void {
  if (flags.some((flag) => args.includes(flag))) return;
  throw new Error(`${command} requires one of ${flags.join(", ")}`);
}

function rejectUnsupportedFlags(
  args: string[],
  allowedFlags: string[],
  command: string,
  hint: string,
): void {
  const allowed = new Set(allowedFlags);
  for (let index = 1; index < args.length; index += 1) {
    const item = args[index];
    if (args[index - 1] === "--text") continue;
    if (item.startsWith("--") && !allowed.has(item)) {
      throw new Error(`${command} does not accept ${item}. ${hint}`);
    }
  }
}

function validateSubcommandShape(command: string, args: string[]): void {
  switch (command) {
    case "list":
      return;
    case "prepare":
      requireFlags(args, ["--udid"], command);
      return;
    case "boot":
    case "terminate":
    case "uninstall":
    case "describe-ui":
      requireFlags(args, ["--udid"], command);
      if (command === "describe-ui") {
        rejectUnsupportedFlags(
          args,
          ["--udid", "--device-set", "--x", "--y", "--output"],
          command,
          "Use --width/--height only for gesture commands; describe-ui only accepts --udid plus optional --x/--y/--output.",
        );
      }
      return;
    case "install":
      requireFlags(args, ["--udid", "--app"], command);
      return;
    case "launch":
      requireFlags(args, ["--udid"], command);
      requireAnyFlag(args, ["--app", "--bundle-id"], command);
      return;
    case "click":
      requireFlags(args, ["--udid", "--ref"], command);
      return;
    case "tap":
    case "double-tap":
      requireFlags(args, ["--udid", "--x", "--y", "--width", "--height"], command);
      return;
    case "swipe":
      requireFlags(
        args,
        ["--udid", "--startX", "--startY", "--endX", "--endY", "--width", "--height"],
        command,
      );
      return;
    case "pinch":
      requireFlags(
        args,
        ["--udid", "--cx", "--cy", "--startSpread", "--endSpread", "--width", "--height"],
        command,
      );
      return;
    case "pan":
      requireFlags(
        args,
        ["--udid", "--x1", "--y1", "--x2", "--y2", "--dx", "--dy", "--width", "--height"],
        command,
      );
      return;
    case "scroll":
      requireFlags(args, ["--udid"], command);
      return;
    case "press":
      requireFlags(args, ["--udid", "--button"], command);
      return;
    case "key":
      requireFlags(args, ["--udid", "--code"], command);
      return;
    case "fill":
      requireFlags(args, ["--udid", "--ref", "--text"], command);
      return;
    case "type":
      requireFlags(args, ["--udid", "--text"], command);
      rejectUnsupportedFlags(
        args,
        ["--udid", "--device-set", "--text"],
        command,
        "Focus the field with tap first, then call type with only --udid and --text.",
      );
      return;
    case "screenshot":
      requireFlags(args, ["--udid", "--output"], command);
      return;
    case "complete":
      requireFlags(args, ["--status", "--summary"], command);
      return;
    default:
      throw new Error(`testcat-sim subcommand is not allowed: ${command}`);
  }
}

export function parseOllamaAction(content: string): OllamaAction {
  const text = content.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const jsonText = start >= 0 && end >= start ? text.slice(start, end + 1) : text;
  const parsed = parseActionJsonWithRepairs(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("model response must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.action === "run_testcat_sim") {
    const split = splitInlineNote(obj.args, obj.note);
    return {
      action: "run_testcat_sim",
      args: validateModelActionArgs(split.args),
      note: split.note,
    };
  }
  if (typeof obj.action === "string" && isAllowedShortcutSubcommand(obj.action)) {
    const split = splitInlineNote(obj.args, obj.note);
    const rawArgs = Array.isArray(split.args) ? split.args : [];
    return {
      action: "run_testcat_sim",
      args: validateModelActionArgs([obj.action, ...rawArgs]),
      note: split.note,
    };
  }
  if (obj.action === "complete") {
    if (obj.status !== "passed" && obj.status !== "failed") {
      throw new Error("complete.status must be passed or failed");
    }
    if (typeof obj.summary !== "string" || !obj.summary.trim()) {
      throw new Error("complete.summary is required");
    }
    return {
      action: "complete",
      status: obj.status,
      summary: obj.summary.trim().slice(0, 500),
    };
  }
  throw new Error("unsupported action");
}

function isAllowedShortcutSubcommand(value: string): boolean {
  if (value === "chrome") return false;
  return (
    value === "list" ||
    value === "prepare" ||
    value === "boot" ||
    value === "install" ||
    value === "launch" ||
    value === "terminate" ||
    value === "uninstall" ||
    value === "click" ||
    value === "tap" ||
    value === "double-tap" ||
    value === "swipe" ||
    value === "pinch" ||
    value === "pan" ||
    value === "scroll" ||
    value === "press" ||
    value === "key" ||
    value === "fill" ||
    value === "type" ||
    value === "screenshot" ||
    value === "describe-ui"
  );
}

function parseActionJsonWithRepairs(jsonText: string): unknown {
  const candidates = [
    jsonText,
    repairExtraNoteBracket(jsonText),
    repairInlineNoteInArgs(jsonText),
    repairInlineNoteMissingArgsClose(jsonText),
    repairExtraNoteBracket(repairInlineNoteInArgs(jsonText)),
    repairExtraNoteBracket(repairInlineNoteMissingArgsClose(jsonText)),
  ].filter((value, index, all) => all.indexOf(value) === index);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next repair candidate.
    }
  }
  throw new Error("model response was not valid JSON");
}

function repairInlineNoteInArgs(jsonText: string): string {
  return jsonText.replace(
    /,\s*"(?:--)?note"\s*:\s*("[^"\\]*(?:\\.[^"\\]*)*")\s*\]/g,
    `],"note":$1`,
  );
}

function repairInlineNoteMissingArgsClose(jsonText: string): string {
  return jsonText.replace(
    /,\s*"(?:--)?note"\s*:\s*("[^"\\]*(?:\\.[^"\\]*)*")\s*}/g,
    `],"note":$1}`,
  );
}

function repairExtraNoteBracket(jsonText: string): string {
  return jsonText.replace(
    /("note"\s*:\s*"[^"\\]*(?:\\.[^"\\]*)*")\s*\]\s*}/g,
    "$1}",
  );
}

function splitInlineNote(
  argsValue: unknown,
  noteValue: unknown,
): { args: unknown; note: string | null } {
  let note =
    typeof noteValue === "string" && noteValue.trim() ? noteValue.trim() : null;
  if (!Array.isArray(argsValue)) return { args: argsValue, note };

  const args = [...argsValue];
  const noteIndex = args.indexOf("--note");
  if (noteIndex !== -1) {
    const inlineNote = args[noteIndex + 1];
    if (!note && typeof inlineNote === "string" && inlineNote.trim()) {
      note = inlineNote.trim();
    }
    args.splice(noteIndex, typeof inlineNote === "string" ? 2 : 1);
  }
  return { args, note };
}

function validateModelActionArgs(value: unknown): string[] {
  if (Array.isArray(value)) {
    const args = sanitizeModelActionArgs([...value]);
    const subcommand = String(args[0] ?? "");
    if (udidScopedModelSubcommands.has(subcommand) && !args.includes("--udid")) {
      args.push("--udid", "UDID");
    }
    if (!screenSizedGestureSubcommands.has(subcommand)) {
      return validateTestcatSimArgs(args);
    }
    if (!args.includes("--width")) args.push("--width", SCREEN_WIDTH_PLACEHOLDER);
    if (!args.includes("--height")) args.push("--height", SCREEN_HEIGHT_PLACEHOLDER);
    return validateTestcatSimArgs(args);
  }
  return validateTestcatSimArgs(value, { allowComplete: false });
}

function sanitizeModelActionArgs(args: unknown[]): string[] {
  const out = args.map((item) => String(item));
  if (out[0] !== "type") return out;
  return removeFlagValues(out, ["--x", "--y", "--width", "--height", "--ref"]);
}

function removeFlagValues(args: string[], flags: string[]): string[] {
  const remove = new Set(flags);
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (remove.has(item)) {
      index += 1;
      continue;
    }
    out.push(item);
  }
  return out;
}

export function parseOllamaPlannerDecision(
  content: string,
  availableCount = MAX_DEVICES,
): PlannerDecision {
  const text = content.trim();
  const jsonText =
    text.startsWith("{") && text.endsWith("}")
      ? text
      : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("planner response was not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("planner response must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  const rawCount = obj.simulatorCount ?? obj.simulator_count ?? obj.deviceCount;
  const count =
    typeof rawCount === "number"
      ? rawCount
      : typeof rawCount === "string"
        ? Number(rawCount)
        : NaN;
  if (!Number.isFinite(count)) {
    throw new Error("planner simulatorCount must be a number");
  }
  const simulatorCount = Math.max(
    1,
    Math.min(Math.trunc(count), MAX_DEVICES, Math.max(1, availableCount)),
  );
  const rawReason = obj.reason;
  return {
    simulatorCount,
    parallel: typeof obj.parallel === "boolean" ? obj.parallel : simulatorCount > 1,
    reason:
      typeof rawReason === "string" && rawReason.trim()
        ? rawReason.trim().slice(0, 240)
        : "Testcat Direct planner selected the simulator count.",
  };
}

export function parseDirectPlannerDecision(
  content: string,
  availableCount = MAX_DEVICES,
): PlannerDecision {
  const decision = parseOllamaPlannerDecision(content, availableCount);
  if (decision.simulatorCount <= 1) return decision;
  return {
    simulatorCount: 1,
    parallel: false,
    reason:
      `Direct runner uses one simulator because it cannot coordinate shared state across independent device loops yet. Planner requested ${decision.simulatorCount}: ${decision.reason}`.slice(
        0,
        240,
      ),
  };
}

export function repeatedDirectActionKey(args: string[]): string | null {
  const subcommand = args[0];
  if (!subcommand || !mutatingSubcommands.has(subcommand)) return null;
  return JSON.stringify(args);
}

// Decide whether a model-issued `complete` is credible. "passed" needs enough
// executed UI actions and screen observations to plausibly have exercised the
// scenario; "failed" is always accepted (the model must be able to give up).
export function completeGateVerdict(input: {
  status: "passed" | "failed";
  mutatingActions: number;
  observations: number;
  rejections: number;
}): "accept" | "reject" | "fail-run" {
  if (input.status === "failed") return "accept";
  if (
    input.mutatingActions >= COMPLETE_MIN_MUTATING_ACTIONS &&
    input.observations >= COMPLETE_MIN_OBSERVATIONS
  ) {
    return "accept";
  }
  return input.rejections >= COMPLETE_MAX_REJECTIONS ? "fail-run" : "reject";
}

// Decide whether the model is circling, given the recent observation window.
// Circling = a full window covering few distinct screens. Warn on first
// detection (once); only fail once enough total observations have been spent, so
// short/healthy runs are never judged as stuck.
export function circlingVerdict(input: {
  windowFilled: number;
  distinctInWindow: number;
  totalObservations: number;
  alreadyWarned: boolean;
}): "ok" | "warn" | "fail" {
  const circling =
    input.windowFilled >= NO_PROGRESS_WINDOW &&
    input.distinctInWindow <= NO_PROGRESS_MAX_DISTINCT;
  if (!circling) return "ok";
  const floor =
    input.distinctInWindow <= HARD_STUCK_MAX_DISTINCT
      ? HARD_STUCK_FLOOR_OBSERVATIONS
      : NO_PROGRESS_FLOOR_OBSERVATIONS;
  if (input.totalObservations >= floor) return "fail";
  return input.alreadyWarned ? "ok" : "warn";
}

export function normalizeDirectActionArgs(
  args: string[],
  deviceUdid: string,
  screen: ScreenSize | null,
): string[] {
  const normalized = [...args];
  upsertFlagValue(normalized, "--udid", deviceUdid);
  if (screen && screenSizedGestureSubcommands.has(normalized[0] ?? "")) {
    upsertFlagValue(normalized, "--width", String(screen.width));
    upsertFlagValue(normalized, "--height", String(screen.height));
  } else if (
    screenSizedGestureSubcommands.has(normalized[0] ?? "") &&
    (normalized.includes(SCREEN_WIDTH_PLACEHOLDER) ||
      normalized.includes(SCREEN_HEIGHT_PLACEHOLDER))
  ) {
    throw new Error("screen dimensions are required for coordinate gestures");
  }
  return validateTestcatSimArgs(normalized);
}

export function normalizeUiTargetedActionArgs(
  args: string[],
  latestUiOutput: string,
  note: string | null,
  scenario = "",
): string[] {
  if (args[0] !== "tap" || !note) return args;
  const root = parseUiOutput(latestUiOutput);
  if (!root) return args;
  const noteLower = note.toLowerCase();
  const buttonTarget = findButtonTargetForNote(root, noteLower);
  if (buttonTarget) {
    const normalized = [...args];
    upsertFlagValue(normalized, "--x", buttonTarget.center.x);
    upsertFlagValue(normalized, "--y", buttonTarget.center.y);
    return validateTestcatSimArgs(normalized);
  }
  const target = collectUiNodes(root)
    .filter(isSegmentControlNode)
    .map((node) => ({ node, label: uiString(node.label) }))
    .filter((item): item is { node: UiNode; label: string } => Boolean(item.label))
    .filter((item) => noteLower.includes(item.label.toLowerCase()))
    .sort((a, b) => b.label.length - a.label.length)[0];
  if (!target) return args;
  const scenarioTarget =
    uiString(target.node.value) === "1"
      ? (findVisibleScenarioTargets(root, scenario)[0] ??
        findVisibleCountryTargets(root)[0])
      : null;
  const center = scenarioTarget?.center ?? frameCenter(target.node.frame);
  if (!center) return args;
  const normalized = [...args];
  upsertFlagValue(normalized, "--x", center.x);
  upsertFlagValue(normalized, "--y", center.y);
  return validateTestcatSimArgs(normalized);
}

export function compactDirectMessages(messages: DirectMessage[]): DirectMessage[] {
  if (messages.length <= MODEL_HISTORY_TAIL_MESSAGES + 3) return messages;
  const [system, initial] = messages;
  if (!system || !initial) return messages.slice(-MODEL_HISTORY_TAIL_MESSAGES);
  const tail = messages.slice(-MODEL_HISTORY_TAIL_MESSAGES);
  return [
    system,
    initial,
    {
      role: "user",
      content: [
        "Earlier tool/action history was compacted to keep the local model context bounded.",
        "Continue from the latest observations below.",
        "Do not repeat actions that the latest observations show are ineffective.",
      ].join("\n"),
    },
    ...tail,
  ];
}

export function startOllamaDirectRun(
  options: OllamaDirectOptions,
): OllamaDirectHandle {
  const controller = new AbortController();
  const children = new Set<ChildProcess>();
  const run = new OllamaDirectRunner(options, controller, (child) => {
    children.add(child);
    const drop = () => children.delete(child);
    child.once("close", drop);
    child.once("error", drop);
  });

  return {
    cancel() {
      controller.abort();
      for (const child of children) child.kill("SIGTERM");
    },
    finished: run.run(),
  };
}

class OllamaDirectRunner {
  private readonly simBin = resolveSimBin();
  private readonly deviceBin = resolveDeviceBin();
  private completionKind: "simulator" | "physical" = "simulator";

  constructor(
    private readonly options: OllamaDirectOptions,
    private readonly controller: AbortController,
    private readonly trackChild: (child: ChildProcess) => void,
  ) {}

  private providerLabel(): string {
    return "Ollama Direct";
  }

  async run(): Promise<OllamaDirectResult> {
    let outcome: OllamaDirectResult;
    try {
      this.options.emit({
        type: "text_delta",
        text: `${this.providerLabel()} runner started.\n`,
      });
      const devices = await this.prepareDevices();
      const results = await Promise.all(devices.map((ctx) => this.runDevice(ctx)));
      const failed = results.filter((result) => result.status === "failed");
      const status = failed.length > 0 ? "failed" : "passed";
      const summary =
        failed.length > 0
          ? failed.map((result) => result.summary).join(" | ")
          : results.map((result) => result.summary).join(" | ");
      outcome = await this.finish(status, summary || `${this.providerLabel()} run completed.`);
    } catch (error) {
      if (this.controller.signal.aborted || error instanceof CancelledError) {
        outcome = { status: "cancelled", result: "Cancelled by user" };
      } else {
        const message = error instanceof Error ? error.message : String(error);
        try {
          outcome = await this.finish("failed", `${this.providerLabel()} failed: ${message}`);
        } catch {
          outcome = { status: "error", result: message };
        }
      }
    }
    this.options.emit({ type: "status", phase: "done" });
    return outcome;
  }

  private async prepareDevices(): Promise<DeviceContext[]> {
    const req = this.options.req;
    if (req.preferPhysicalDevices && (req.physicalBuildPath || req.physicalBundleId)) {
      try {
        const list = await this.runDeviceCli(["list", "--json"]);
        const devices = parseDevices(list.output).filter((device) => device.isBooted);
        const candidates = devices.filter((device) => /iphone|ipad/i.test(device.name));
        const selected = candidates[0] ?? devices[0];
        if (selected) {
          this.options.emit({
            type: "text_delta",
            text: [
              "Warm-up summary:",
              "- Device count: 1",
              "- Physical device preference: yes",
              `- Selected: ${selected.name} (${selected.udid})`,
              "",
            ].join("\n"),
          });
          return [await this.preparePhysicalDevice(selected, 1)];
        }
        this.options.emit({
          type: "text_delta",
          text: "Warm-up summary:\n- No available physical device found; falling back to simulator.\n\n",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.options.emit({
          type: "text_delta",
          text: `Warm-up summary:\n- Physical device setup failed; falling back to simulator.\n- Reason: ${truncate(message, 500)}\n\n`,
        });
      }
    }

    const list = await this.runSim(["list", "--json"]);
    const devices = parseDevices(list.output);
    const iPhones = devices.filter((device) => /iphone/i.test(device.name));
    const assigned = this.options.req.assignedSimulators ?? [];
    const assignedUdids = new Set(assigned.map((device) => device.udid.toUpperCase()));
    const assignedDevices = assignedUdids.size
      ? devices.filter((device) => assignedUdids.has(device.udid.toUpperCase()))
      : [];
    const candidates = assignedDevices.length
      ? assignedDevices
      : iPhones.length
        ? iPhones
        : devices;
    if (candidates.length === 0) throw new Error("No simulators found.");

    const decision = assignedDevices.length
      ? {
          simulatorCount: assignedDevices.length,
          parallel: assignedDevices.length > 1,
          reason: "Using simulator reserved for this Testcat run.",
        }
      : await this.planDevices(candidates.length);
    const count = decision.simulatorCount;
    const selected = selectDevices(candidates, count);
    this.options.emit({
      type: "text_delta",
      text: [
        "Warm-up summary:",
        `- Simulator count: ${selected.length}`,
        `- Parallel run: ${decision.parallel ? "yes" : "no"}`,
        `- Reason: ${decision.reason}`,
        "",
      ].join("\n"),
    });

    return Promise.all(
      selected.map((device, index) => this.prepareDevice(device, index + 1)),
    );
  }

  private async preparePhysicalDevice(
    device: Device,
    simIndex: number,
  ): Promise<DeviceContext> {
    await this.runDeviceCli(["prepare", "--udid", device.udid]);
    const app = this.options.req.physicalBuildPath;
    const bundleId = this.options.req.physicalBundleId;
    if (app) {
      await this.runDeviceCli(["install", "--udid", device.udid, "--app", app]);
      await this.runDeviceCli(["launch", "--udid", device.udid, "--app", app]);
    } else if (bundleId) {
      // App already on the device (e.g. TestFlight) — skip install.
      await this.runDeviceCli(["launch", "--udid", device.udid, "--bundle-id", bundleId]);
    } else {
      throw new Error(
        "Physical devices need a build path or a bundle id (Settings → physical device bundle id).",
      );
    }
    const ui = await this.runDeviceCli(["describe-ui", "--udid", device.udid]).catch((error) => ({
      ok: false,
      output: error instanceof Error ? error.message : String(error),
    }));
    const layout = JSON.stringify({
      physical: true,
      note: "Physical devices do not expose testcat-sim chrome layout; use describe-ui refs or coordinates.",
    });
    this.completionKind = "physical";
    return {
      device: { ...device, kind: "physical" },
      simIndex,
      layout,
      ui: ui.output,
    };
  }

  private async planDevices(availableCount: number): Promise<PlannerDecision> {
    this.throwIfCancelled();
    this.options.emit({
      type: "text_delta",
      text: `Warm-up planning simulator allocation with ${this.providerLabel()}.\n`,
    });
    this.options.emit({ type: "status", phase: "thinking" });
    try {
      const content = await this.callModel([
        { role: "system", content: directPlannerSystemPrompt(availableCount) },
        { role: "user", content: this.plannerPrompt(availableCount) },
      ]);
      return parseDirectPlannerDecision(content, availableCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        simulatorCount: 1,
        parallel: false,
        reason: `Planner failed (${message}); defaulting to one simulator.`,
      };
    }
  }

  private async prepareDevice(
    device: Device,
    simIndex: number,
  ): Promise<DeviceContext> {
    let latest = device;
    if (!latest.isBooted) {
      await this.runSim(["boot", "--udid", latest.udid]);
      latest = await this.findDevice(latest.udid);
    }
    if (!latest.isBooted) {
      await this.runSim(["boot", "--udid", latest.udid]);
      latest = await this.findDevice(latest.udid);
    }
    if (!latest.isBooted) throw new Error(`${latest.name} did not boot.`);

    await this.uninstallAppIfPresent(latest.udid, this.options.req.buildPath);

    try {
      await this.runSim(["install", "--udid", latest.udid, "--app", this.options.req.buildPath]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Shutdown/i.test(message)) throw error;
      await this.runSim(["boot", "--udid", latest.udid]);
      await this.findDevice(latest.udid);
      await this.uninstallAppIfPresent(latest.udid, this.options.req.buildPath);
      await this.runSim(["install", "--udid", latest.udid, "--app", this.options.req.buildPath]);
    }

    await this.runSim([
      "launch",
      "--udid",
      latest.udid,
      "--app",
      this.options.req.buildPath,
      "--terminate-running-process",
    ]);
    await this.replayLogin(latest.udid, simIndex);
    const layout = await this.runSim(["chrome", "layout", "--udid", latest.udid]);
    const ui = await this.runSim(["describe-ui", "--udid", latest.udid]).catch((error) => ({
      ok: false,
      output: error instanceof Error ? error.message : String(error),
    }));
    return { device: latest, simIndex, layout: layout.output, ui: ui.output };
  }

  private async uninstallAppIfPresent(udid: string, appPath: string): Promise<void> {
    try {
      await this.runSim(["uninstall", "--udid", udid, "--app", appPath]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isAppNotInstalledError(message)) throw error;
    }
  }

  private async findDevice(udid: string): Promise<Device> {
    const list = await this.runSim(["list", "--json"]);
    const device = parseDevices(list.output).find((item) => item.udid === udid);
    if (!device) throw new Error(`Simulator disappeared: ${udid}`);
    return device;
  }

  private async runDevice(ctx: DeviceContext): Promise<{ status: "passed" | "failed"; summary: string }> {
    const messages: DirectMessage[] = [
      { role: "system", content: directSystemPrompt(this.providerLabel()) },
      { role: "user", content: this.initialDevicePrompt(ctx) },
    ];
    let screen = parseDescribeRootSize(ctx.ui) ?? parseScreenSize(ctx.layout);
    let invalidResponses = 0;
    let lastObservationFingerprint = observationFingerprint(ctx.ui);
    let latestUiOutput = ctx.ui;
    let repeatedActionScope: string | null = null;
    let repeatedActionCount = 0;
    const recentScreens: string[] = [lastObservationFingerprint];
    let totalObservations = 1;
    let noProgressWarned = false;
    let modelMutatingActions = 0;
    let completeRejections = 0;

    for (let step = 0; step < MAX_STEPS_PER_DEVICE; step += 1) {
      this.throwIfCancelled();
      this.options.emit({ type: "status", phase: "thinking" });
      const content = await this.callModel(compactDirectMessages(messages));
      let action: OllamaAction;
      try {
        action = parseOllamaAction(content);
      } catch (error) {
        invalidResponses += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.options.emit({
          type: "tool_result",
          ok: false,
          output: `Invalid model action (${message}). Raw model response:\n${truncate(content, 1_500)}`,
        });
        messages.push({ role: "assistant", content });
        messages.push({
          role: "user",
          content: `Invalid action: ${message}. Reply with exactly one JSON object matching the action schema.`,
        });
        if (invalidResponses >= 3) {
          return {
            status: "failed",
            summary: `${ctx.device.name}: model did not follow the Testcat Direct JSON action protocol.`,
          };
        }
        continue;
      }

      messages.push({ role: "assistant", content: JSON.stringify(action) });
      if (action.action === "complete") {
        const verdict = completeGateVerdict({
          status: action.status,
          mutatingActions: modelMutatingActions,
          observations: totalObservations,
          rejections: completeRejections,
        });
        if (verdict === "accept") return action;
        if (verdict === "fail-run") {
          return {
            status: "failed",
            summary: `${ctx.device.name}: model claimed success without executing the scenario (${modelMutatingActions} UI action(s) and ${totalObservations} observation(s); completion rejected ${completeRejections} time(s) before this).`,
          };
        }
        completeRejections += 1;
        this.options.emit({
          type: "text_delta",
          text: `${ctx.device.name}: completion rejected — only ${modelMutatingActions} UI action(s) and ${totalObservations} observation(s) so far; the scenario has not actually been exercised.\n`,
        });
        messages.push({
          role: "user",
          content: [
            `Completion rejected: you have performed only ${modelMutatingActions} UI action(s) and ${totalObservations} screen observation(s) — the scenario has not been exercised.`,
            "Execute the scenario step by step (tap/type through the real flow) and verify each expected outcome in describe-ui output before completing.",
            'If the scenario truly cannot be executed, reply with {"action":"complete","status":"failed","summary":"<what blocked you>"} instead of claiming success.',
          ].join("\n"),
        });
        continue;
      }
      const normalizedArgs = normalizeUiTargetedActionArgs(
        normalizeDirectActionArgs(action.args, ctx.device.udid, screen),
        latestUiOutput,
        action.note,
        this.options.req.scenario,
      );

      const repeatKey = repeatedDirectActionKey(normalizedArgs);
      const repeatScope = repeatKey
        ? `${repeatKey}\n@${lastObservationFingerprint}`
        : null;
      if (repeatScope) {
        if (repeatScope === repeatedActionScope) {
          repeatedActionCount += 1;
        } else {
          repeatedActionScope = repeatScope;
          repeatedActionCount = 1;
        }
      }
      if (
        repeatKey &&
        repeatedActionCount >= REPEATED_MUTATING_ACTION_WARNING_COUNT
      ) {
        if (repeatedActionCount >= REPEATED_MUTATING_ACTION_FAILURE_COUNT) {
          return {
            status: "failed",
            summary: `${ctx.device.name}: repeated the same simulator action without making progress.`,
          };
        }
        messages.push({
          role: "user",
          content: buildRepeatedActionPrompt(
            ctx.device.name,
            normalizedArgs,
            repeatedActionCount,
          ),
        });
        continue;
      }

      if (action.note) {
        this.options.emit({ type: "text_delta", text: `${ctx.device.name}: ${action.note}\n` });
      }
      this.options.emit({ type: "status", phase: "acting" });
      const cliName = ctx.device.kind === "physical" ? "testcat-device" : "testcat-sim";
      let result: { ok: boolean; output: string };
      try {
        result =
          ctx.device.kind === "physical"
            ? await this.runDeviceCli(normalizedArgs)
            : await this.runSimulatorAction(
                normalizedArgs,
                latestUiOutput,
                action.note,
                screen,
                ctx.device.udid,
              );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result = { ok: false, output: message };
      }
      if (result.ok && repeatKey) modelMutatingActions += 1;
      let noProgressNudge = false;
      if (result.ok && normalizedArgs[0] === "describe-ui") {
        latestUiOutput = result.output;
        // Gesture --width/--height must match the coordinate space the model's
        // coordinates come from: the latest describe root frame, which shrinks
        // when a system alert owns the screen (420×912 vs 440×956 on iPhone
        // Air). Chrome-layout dims go stale then — pairing coords with them
        // shifted taps a few percent and missed the tracking-alert buttons.
        screen = parseDescribeRootSize(result.output) ?? screen;
        lastObservationFingerprint = observationFingerprint(result.output);
        recentScreens.push(lastObservationFingerprint);
        if (recentScreens.length > NO_PROGRESS_WINDOW) recentScreens.shift();
        totalObservations += 1;
        const distinctInWindow = new Set(recentScreens).size;
        const progress = circlingVerdict({
          windowFilled: recentScreens.length,
          distinctInWindow,
          totalObservations,
          alreadyWarned: noProgressWarned,
        });
        if (progress === "fail") {
          return {
            status: "failed",
            summary: `${ctx.device.name}: no progress — circled among ${distinctInWindow} screens over the last ${recentScreens.length} observations (stuck looping, e.g. on login/onboarding) without reaching the scenario goal.`,
          };
        }
        if (progress === "warn") {
          noProgressWarned = true;
          noProgressNudge = true;
        }
      }
      messages.push({
        role: "user",
        content: result.ok
          ? buildDirectFollowUpPrompt(
              ctx.device.name,
              result.output,
              this.options.req.scenario,
            )
          : [
              `${cliName} command failed for ${ctx.device.name}:`,
              truncate(result.output, FAILED_COMMAND_OUTPUT_CHARS),
              "",
              "Recover by issuing a corrected run_testcat_sim action.",
              "For tap/double-tap, never pass accessibility identifiers as positional args.",
              "Use coordinates AND the root frame width/height from the same, latest describe-ui output, then pass --x --y --width --height.",
            ].join("\n"),
      });
      if (noProgressNudge) {
        messages.push({
          role: "user",
          content: buildNoProgressPrompt(ctx.device.name),
        });
      }
    }

    return {
      status: "failed",
      summary: `${ctx.device.name}: model exceeded ${MAX_STEPS_PER_DEVICE} action steps.`,
    };
  }

  private async finish(
    status: "passed" | "failed",
    summary: string,
  ): Promise<OllamaDirectResult> {
    const cleanSummary = summary.replace(/\s+/g, " ").trim().slice(0, 500);
    this.options.emit({ type: "status", phase: "finishing" });
    const runner =
      this.completionKind === "physical"
        ? this.runDeviceCli.bind(this)
        : this.runSim.bind(this);
    await runner(["complete", "--status", status, "--summary", cleanSummary], {
      allowComplete: true,
    });
    return { status, result: cleanSummary };
  }

  private initialDevicePrompt(ctx: DeviceContext): string {
    return buildInitialDevicePrompt({
      runId: this.options.runId,
      buildPath: this.options.req.buildPath,
      profileSystemPrompt: this.options.profile.systemPrompt,
      profileSkills: this.options.profile.skills,
      scenario: this.options.req.scenario,
      lastSuccessGuide: this.options.req.lastSuccessGuide,
      appMap: this.options.req.appMap,
      assignedSimulators: this.options.req.assignedSimulators,
      device: ctx.device,
      simIndex: ctx.simIndex,
      layout: ctx.layout,
      ui: ctx.ui,
    });
  }

  private plannerPrompt(availableCount: number): string {
    return [
      `Available simulator candidates: ${availableCount}`,
      `Maximum simulators allowed: ${Math.min(MAX_DEVICES, availableCount)}`,
      "",
      "Profile system prompt:",
      this.options.profile.systemPrompt || "(none)",
      "",
      `Profile skills: ${this.options.profile.skills.join(", ") || "(none)"}`,
      "",
      "Scenario:",
      this.options.req.scenario,
      "",
      assignedSimulatorPromptBlock(this.options.req.assignedSimulators),
      "",
      lastSuccessGuidePromptBlock(this.options.req.lastSuccessGuide),
      "",
      "Decide how many simulators Testcat should prepare before the real test starts.",
      "Respect explicit scenario/profile requirements over generic parallelism guidance.",
      "If there is no clear need for multiple simulators, choose 1.",
      "Return only JSON.",
    ].join("\n");
  }

  private async callModel(messages: DirectMessage[]): Promise<string> {
    const reply = await this.callOllama(messages);
    if (reply.inputTokens || reply.outputTokens) {
      this.options.emit({
        type: "usage",
        inputTokens: reply.inputTokens ?? 0,
        outputTokens: reply.outputTokens ?? 0,
      });
    }
    return reply.content;
  }

  private async callOllama(messages: DirectMessage[]): Promise<ModelReply> {
    try {
      return await this.postOllamaChat(messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/missing message content/i.test(message)) throw error;
      return this.postOllamaChat([
        ...messages,
        {
          role: "user",
          content: [
            "Your previous response had no final message content.",
            "Do not use hidden thinking for this call.",
            "Return exactly one valid JSON object using the Testcat Direct action schema.",
          ].join(" "),
        },
      ]);
    }
  }

  private async postOllamaChat(messages: DirectMessage[]): Promise<ModelReply> {
    this.throwIfCancelled();
    const signal = timeoutSignal(this.controller.signal, MODEL_TIMEOUT_MS);
    const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.options.profile.model,
        stream: false,
        format: "json",
        think: false,
        messages,
        options: { temperature: 0.1, num_predict: MODEL_MAX_OUTPUT_TOKENS },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as Record<string, unknown>;
    const inputTokens = numberField(body, "prompt_eval_count");
    const outputTokens = numberField(body, "eval_count");
    const message = body.message;
    if (!message || typeof message !== "object") throw new Error("Ollama response missing message");
    const content = (message as { content?: unknown }).content;
    if (typeof content !== "string" || !content.trim()) {
      const keys = Object.keys(message as Record<string, unknown>).join(",") || "none";
      const doneReason =
        typeof body.done_reason === "string" && body.done_reason.trim()
          ? body.done_reason.trim()
          : "unknown";
      throw new Error(
        `Ollama response missing message content (done_reason=${doneReason}, message_keys=${keys})`,
      );
    }
    return { content, inputTokens, outputTokens };
  }

  private runSim(
    args: string[],
    options: { allowComplete?: boolean; secrets?: string[] } = {},
  ): Promise<{ ok: boolean; output: string }> {
    const cleanArgs = validateTestcatSimArgs(args, options);
    this.throwIfCancelled();
    return this.runCli("testcat-sim", this.simBin, cleanArgs, options.secrets);
  }

  // Deterministically replay the build's recorded login/onboarding flow before
  // the model takes over, so a weak model never has to solve the auth gate (the
  // step where runs were observed to get stuck). The flow is a template; the
  // account is filled from this run's credentials and redacted in all events.
  // A drifted/failed step does not abort the run — the model still gets a turn.
  private async replayLogin(udid: string, simIndex: number): Promise<void> {
    const flow = this.options.req.loginFlow;
    if (!flow?.steps?.length) return;
    // Explicit per-run credentials win; otherwise expand the Settings template
    // ({testId}/{simIndex}) so every run logs in with a fresh account without
    // anyone typing credentials per run.
    const provided = this.options.req.credentials ?? {};
    const credentials = Object.keys(provided).length
      ? provided
      : expandCredentialTemplate(this.options.req.credentialTemplate, {
          runId: this.options.runId,
          simIndex,
        });
    let filled: ReturnType<typeof fillLoginFlow>;
    try {
      filled = fillLoginFlow(flow, credentials);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.emit({
        type: "text_delta",
        text: `Login replay skipped: ${message}\n`,
      });
      return;
    }
    this.options.emit({
      type: "text_delta",
      text: `Replaying recorded login (${filled.length} steps) before handing off to the model.\n`,
    });
    let previousTapArgs: string[] | null = null;
    for (const [index, step] of filled.entries()) {
      const args = [...step.args];
      upsertFlagValue(args, "--udid", udid);
      if (step.expect && !(await this.awaitReplayExpect(udid, step.expect, previousTapArgs))) {
        this.options.emit({
          type: "text_delta",
          text: `Login replay drifted at step ${index + 1}/${filled.length} ("${step.expect}" never appeared). Handing off to the model to continue.\n`,
        });
        return;
      }
      let ok = false;
      let output = "";
      try {
        const typeText = args[0] === "type" ? flagValue(args, "--text") : null;
        const result =
          typeText != null
            ? await this.typeIntoSimulator(udid, typeText, step.secrets)
            : await this.runSim(args, { secrets: step.secrets });
        ok = result.ok;
        output = result.output;
      } catch (error) {
        output = error instanceof Error ? error.message : String(error);
      }
      if (!ok) {
        this.options.emit({
          type: "text_delta",
          text: `Login replay step failed (UI may have drifted): ${truncate(redactCommand(output, step.secrets), 300)}\nHanding off to the model to continue.\n`,
        });
        return;
      }
      if (args[0] === "tap") previousTapArgs = args;
      await new Promise((resolve) => setTimeout(resolve, REPLAY_STEP_SETTLE_MS));
    }
  }

  // Wait until `expect` is visible in describe-ui; when the wait times out,
  // re-run the previous tap (bounded) and wait again — auto-advancing
  // carousels and multi-page gates need the same dismiss tap repeated, which
  // a blind recorded step list cannot express.
  private async awaitReplayExpect(
    udid: string,
    expect: string,
    previousTapArgs: string[] | null,
  ): Promise<boolean> {
    for (let retap = 0; retap <= REPLAY_MAX_PREVIOUS_RETAPS; retap += 1) {
      const deadline = Date.now() + REPLAY_EXPECT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const ui = await this.runSim(["describe-ui", "--udid", udid]).catch(() => null);
        if (ui?.ok && ui.output.includes(expect)) return true;
        await new Promise((resolve) => setTimeout(resolve, REPLAY_EXPECT_POLL_MS));
      }
      if (!previousTapArgs || retap === REPLAY_MAX_PREVIOUS_RETAPS) return false;
      this.options.emit({
        type: "text_delta",
        text: `Login replay: "${expect}" not on screen yet — repeating the previous tap (${retap + 1}/${REPLAY_MAX_PREVIOUS_RETAPS}).\n`,
      });
      const retry = await this.runSim(previousTapArgs).catch(() => null);
      if (!retry?.ok) return false;
      await new Promise((resolve) => setTimeout(resolve, REPLAY_STEP_SETTLE_MS));
    }
    return false;
  }

  private runDeviceCli(
    args: string[],
    options: { allowComplete?: boolean } = {},
  ): Promise<{ ok: boolean; output: string }> {
    const cleanArgs = validateTestcatSimArgs(args, options);
    return this.runCli("testcat-device", this.deviceBin, cleanArgs);
  }

  private async runSimulatorAction(
    args: string[],
    latestUiOutput: string,
    note: string | null,
    screen: ScreenSize | null,
    deviceUdid: string,
  ): Promise<{ ok: boolean; output: string }> {
    if (args[0] === "click") {
      let tapArgs = buildSimulatorRefTapArgs(
        args,
        latestUiOutput,
        note,
        screen,
        deviceUdid,
      );
      if (!tapArgs) {
        const freshUi = await this.runSim(["describe-ui", "--udid", deviceUdid]);
        tapArgs = buildSimulatorRefTapArgs(args, freshUi.output, note, screen, deviceUdid);
      }
      if (!tapArgs) {
        return {
          ok: false,
          output:
            "Simulator click could not resolve the requested --ref in the latest accessibility tree. Describe the UI, compute the target frame center, and use tap.",
        };
      }
      return this.runSim(tapArgs);
    }

    if (args[0] === "fill") {
      let tapArgs = buildSimulatorRefTapArgs(
        args,
        latestUiOutput,
        note,
        screen,
        deviceUdid,
      );
      const text = flagValue(args, "--text");
      if (!tapArgs) {
        const freshUi = await this.runSim(["describe-ui", "--udid", deviceUdid]);
        tapArgs = buildSimulatorRefTapArgs(args, freshUi.output, note, screen, deviceUdid);
      }
      if (!tapArgs || !text) {
        return {
          ok: false,
          output:
            "Simulator fill could not resolve a target field and text. Describe the UI, tap the field center, then use type.",
        };
      }
      const tap = await this.runSim(tapArgs);
      const type = await this.typeIntoSimulator(deviceUdid, text);
      return {
        ok: true,
        output: [
          "Synthesized simulator fill via tap then type.",
          "Tap result:",
          tap.output,
          "Type result:",
          type.output,
        ].join("\n"),
      };
    }

    if (args[0] === "type") {
      let focusTapArgs = buildSimulatorTypeFocusTapArgs(
        args,
        latestUiOutput,
        note,
        screen,
        deviceUdid,
      );
      if (!focusTapArgs) {
        const freshUi = await this.runSim(["describe-ui", "--udid", deviceUdid]);
        const target = findTextEntryTargetForTypeAction(freshUi.output, args, note);
        if (target && shouldBlockTextAppend(target.node, note, flagValue(args, "--text"))) {
          return {
            ok: false,
            output:
              "The target text field already contains text. Do not append the same email or code again; tap Continue if the value is correct, or navigate back/clear the field before typing a replacement.",
          };
        }
        focusTapArgs = buildSimulatorTypeFocusTapArgs(
          args,
          freshUi.output,
          note,
          screen,
          deviceUdid,
        );
        if (!focusTapArgs && !hasFocusedTextEntry(freshUi.output, note, flagValue(args, "--text"))) {
          return {
            ok: false,
            output:
              "No editable text field is visible or focused for type. Inspect the current UI and navigate or tap the correct input field before typing.",
          };
        }
      }
      if (focusTapArgs) await this.runSim(focusTapArgs);
      const text = flagValue(args, "--text");
      if (text != null) return this.typeIntoSimulator(deviceUdid, text);
    }

    return this.runSim(args);
  }

  // Deliver text via the simulator pasteboard + Cmd+V instead of HID key
  // events. HID typing maps US key positions through the host's hardware
  // keyboard layout — on a Turkish-Q host "sim-1@x.com" arrives as
  // "sım*1'xçcom" and every email is rejected (observed live; a major cause
  // of the historical login stalls). Paste is layout-independent.
  private async typeIntoSimulator(
    udid: string,
    text: string,
    secrets: string[] = [],
  ): Promise<{ ok: boolean; output: string }> {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = execFile(
          "xcrun",
          ["simctl", "pbcopy", udid],
          { timeout: SIM_COMMAND_TIMEOUT_MS },
          (error) => (error ? reject(error) : resolve()),
        );
        child.stdin?.write(text);
        child.stdin?.end();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, output: `simctl pbcopy failed: ${redactCommand(message, secrets)}` };
    }
    return this.runSim(
      ["key", "--udid", udid, "--code", "KeyV", "--modifiers", "command"],
      { secrets },
    );
  }

  private runCli(
    name: "testcat-sim" | "testcat-device",
    bin: string,
    cleanArgs: string[],
    secrets: string[] = [],
  ): Promise<{ ok: boolean; output: string }> {
    this.throwIfCancelled();
    const command = `${bin} ${cleanArgs.join(" ")}`;
    // Redact filled-in credentials before the command/output reach the event
    // stream (persisted to SQLite + shown in the chat).
    const redact = (value: string) =>
      secrets.length ? redactCommand(value, secrets) : value;
    this.options.emit({
      type: "tool_use",
      name,
      family: "exec",
      input: redact(command),
    });

    return new Promise((resolve, reject) => {
      const child = execFile(
        bin,
        cleanArgs,
        {
          cwd: this.options.req.buildPath ? dirname(this.options.req.buildPath) : process.cwd(),
          env: {
            ...(this.options.env ?? process.env),
            TESTCAT_RUN_ID: this.options.runId,
            TESTCAT_RUN_COMPLETE_TOKEN: this.options.completeToken,
          },
          maxBuffer: MAX_BUFFER,
          timeout: SIM_COMMAND_TIMEOUT_MS,
        },
        (error, stdout, stderr) => {
          const output = redact(
            [stdout.toString(), stderr.toString()].filter(Boolean).join("\n").trim(),
          );
          if (error) {
            this.options.emit({ type: "tool_result", ok: false, output: output || error.message });
            reject(new Error(output || error.message));
            return;
          }
          this.options.emit({ type: "tool_result", ok: true, output });
          resolve({ ok: true, output });
        },
      );
      this.trackChild(child);
      if (this.controller.signal.aborted) {
        child.kill("SIGTERM");
        reject(new CancelledError());
      }
    });
  }

  private throwIfCancelled(): void {
    if (this.controller.signal.aborted) throw new CancelledError();
  }
}

function parseDevices(json: string): Device[] {
  const parsed = JSON.parse(json) as { running?: RawDevice[]; available?: RawDevice[] };
  const seen = new Set<string>();
  const out: Device[] = [];
  for (const raw of [...(parsed.running ?? []), ...(parsed.available ?? [])]) {
    const udid = stringField(raw, "udid") ?? stringField(raw, "id");
    const name = stringField(raw, "name");
    if (!udid || !name || seen.has(udid)) continue;
    seen.add(udid);
    const state = stringField(raw, "state") ?? "Unknown";
    out.push({
      udid,
      name,
      state,
      runtime: stringField(raw, "runtime") ?? "",
      isBooted: raw.isBooted === true || state === "Booted",
      kind: stringField(raw, "kind") === "physical" ? "physical" : "simulator",
    });
  }
  return out;
}

function selectDevices(devices: Device[], count: number): Device[] {
  return [...devices]
    .sort((a, b) => scoreDevice(b) - scoreDevice(a))
    .slice(0, count);
}

function scoreDevice(device: Device): number {
  const runtime = Number(device.runtime.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
  const model = Number(device.name.match(/iPhone\s+(\d+)/i)?.[1] ?? 0);
  return (device.isBooted ? 1_000_000 : 0) + runtime * 1000 + model;
}

function stringField(obj: RawDevice, key: keyof RawDevice): string | null {
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberField(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flagValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1 || index >= args.length - 1) return null;
  const value = args[index + 1];
  return typeof value === "string" && value.trim() ? value : null;
}

function upsertFlagValue(args: string[], flag: string, value: string): void {
  const index = args.indexOf(flag);
  if (index === -1) {
    args.push(flag, value);
    return;
  }
  if (index === args.length - 1) {
    args.push(value);
    return;
  }
  args[index + 1] = value;
}

/**
 * Coordinate space of the latest describe-ui output: its ROOT frame. This is
 * the width/height gestures must be normalized with — it changes per screen
 * (system alerts report a smaller window than the app), so a fixed
 * chrome-layout size mis-scales taps whenever an alert is up.
 */
export function parseDescribeRootSize(uiOutput: string): ScreenSize | null {
  const frame = parseUiOutput(uiOutput)?.frame;
  const width = typeof frame?.width === "number" ? frame.width : 0;
  const height = typeof frame?.height === "number" ? frame.height : 0;
  if (width <= 0 || height <= 0) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

function parseScreenSize(layoutJson: string): ScreenSize | null {
  try {
    const parsed = JSON.parse(layoutJson) as { screen?: unknown };
    const screen =
      parsed.screen && typeof parsed.screen === "object" && !Array.isArray(parsed.screen)
        ? (parsed.screen as Record<string, unknown>)
        : {};
    const width = numberField(screen, "width");
    const height = numberField(screen, "height");
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

function timeoutSignal(parent: AbortSignal, ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", abort, { once: true });
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    },
    { once: true },
  );
  return controller.signal;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n...[truncated]`;
}

function observationFingerprint(output: string): string {
  return truncate(
    output
      .replace(/"label"\s*:\s*"\d{1,2}:\d{2}"/g, '"label":"<time>"')
      .replace(/"value"\s*:\s*"\d{1,3}%"/g, '"value":"<battery>"'),
    4_000,
  );
}

function isAppNotInstalledError(message: string): boolean {
  return /not installed|no such application|no application.*installed|missing application identifier/i.test(
    message,
  );
}

export function buildInitialDevicePrompt(input: {
  runId: string;
  buildPath: string;
  profileSystemPrompt: string;
  profileSkills: string[];
  scenario: string;
  lastSuccessGuide?: string;
  appMap?: string;
  assignedSimulators?: Device[];
  device: Device;
  simIndex: number;
  layout: string;
  ui: string;
}): string {
  const isPhysical = input.device.kind === "physical";
  const runtimeLabel = isPhysical ? "Physical device" : "Simulator";
  const cliLabel = isPhysical ? "testcat-device" : "testcat-sim";
  return [
    `Run id: ${input.runId}`,
    `${runtimeLabel}: ${input.device.name} (${input.device.udid}, ${input.device.runtime})`,
    `Device index: sim-${input.simIndex}`,
    // Provide only a short unique id + the sim index; the account-naming
    // convention (domain, format, length) belongs to the profile system prompt.
    // Do NOT inject a full-run-id email here — it overrides the profile's rule
    // (e.g. an 8-char id limit) and a weak model follows this concrete line.
    `Unique id for any test accounts this run: ${input.runId.slice(0, 8)} (sim index: ${input.simIndex}). Follow your system prompt's account-naming rule and use this id where it expects a unique test id. Never type a literal "{test-id}" placeholder, and do not use the full run id.`,
    `App build under test: ${input.buildPath}`,
    "",
    "Profile system prompt:",
    input.profileSystemPrompt || "(none)",
    "",
    `Profile skills: ${input.profileSkills.join(", ") || "(none)"}`,
    "",
    "Scenario:",
    input.scenario,
    "",
    assignedSimulatorPromptBlock(input.assignedSimulators),
    "",
    appMapPromptBlock(input.appMap),
    "",
    lastSuccessGuidePromptBlock(input.lastSuccessGuide),
    "",
    "Screen layout JSON:",
    truncate(input.layout, INITIAL_LAYOUT_CHARS),
    "",
    "Initial accessibility tree JSON:",
    truncate(input.ui, INITIAL_UI_CHARS),
    "",
    `Start by inspecting the accessibility tree and driving the UI through ${cliLabel} actions. Complete only after verification.`,
    isPhysical
      ? "For physical devices, prefer describe-ui refs with click/fill when present; coordinate gestures still work when frames are available."
      : "For simulators, every coordinate gesture needs --width/--height taken from the ROOT frame of the same describe-ui output the coordinates came from (it changes when system alerts appear).",
  ].join("\n");
}

function assignedSimulatorPromptBlock(devices: Device[] | undefined): string {
  if (!devices?.length) return "";
  return [
    "Assigned simulator(s) for this run:",
    ...devices.map((device) => `- ${device.name} (${device.udid})`),
    "Use these reserved simulator UDID(s). Do not switch to a different already-booted simulator unless the reserved simulator is unavailable and the scenario cannot continue.",
  ].join("\n");
}

export function buildDirectFollowUpPrompt(
  deviceName: string,
  output: string,
  scenario = "",
): string {
  return [
    `Testcat device action result for ${deviceName}:`,
    truncate(output, FOLLOW_UP_OUTPUT_CHARS),
    "",
    ...directInteractionHints(output, scenario),
    "Continue with the next action or complete.",
  ].join("\n");
}

function buildNoProgressPrompt(deviceName: string): string {
  return [
    `Progress guard for ${deviceName}:`,
    "The last several screens you observed are ones you have already seen — you are looping without reaching a new state.",
    "Stop repeating the current path (for example, retyping an email/OTP or re-tapping the same login/Continue controls).",
    "Describe the UI, pick a control you have not used yet that moves toward the scenario goal, and take that action.",
    "If you are genuinely blocked (e.g. login cannot proceed), complete with status failed and a concise summary of the blocker.",
  ].join("\n");
}

function buildRepeatedActionPrompt(
  deviceName: string,
  args: string[],
  count: number,
): string {
  return [
    `Repeated action guard for ${deviceName}:`,
    `The same state-changing Testcat device action has been proposed ${count} times: ${args.join(" ")}`,
    "Do not repeat it again.",
    "Describe the UI, compare the current screen to the goal, and choose a different control or recovery path.",
    "If this is a real blocker, complete with status failed and a concise summary.",
  ].join("\n");
}

function directInteractionHints(output: string, scenario = ""): string[] {
  const lower = output.toLowerCase();
  const hints: string[] = [];
  const hasUncheckedCheckbox =
    lower.includes("checkboxemptyicon") ||
    lower.includes("checkbox empty") ||
    lower.includes("unchecked") ||
    /"identifier"\s*:\s*"[^"]*checkbox/i.test(output);
  const hasContinue = lower.includes("continue");
  if (hasUncheckedCheckbox && hasContinue) {
    hints.push(
      "Interaction hint: this screen appears to have an unchecked checkbox or consent control gating Continue.",
      "Tap the checkbox/toggle control itself first, then re-check the UI before tapping Continue.",
      "If a successful tap leaves the UI unchanged, do not repeat the same coordinates more than once; inspect the tree and choose a different required control.",
    );
  }
  if (/enter your card info|card number|cardholder|cvv|expiration/i.test(output)) {
    hints.push(
      "Payment-form hint: for simulators, tap each payment field's frame center before typing. Do not use click/fill on simulator.",
      "Fill fields in order when labels are ambiguous: card number, cardholder name, expiration month, expiration year, CVV.",
    );
  }
  hints.push(...segmentedControlHints(output));
  hints.push(...visibleScenarioTargetHints(output, scenario));
  hints.push(...visibleCountryListHints(output, scenario));
  if (hints.length > 0) hints.push("");
  return hints;
}

function segmentedControlHints(output: string): string[] {
  const root = parseUiOutput(output);
  if (!root) return [];
  const groups = collectUiNodes(root).filter((node) => {
    const children = Array.isArray(node.children) ? node.children : [];
    const controls = children.filter(isSegmentControlNode);
    return controls.length >= 2;
  });
  const group = groups[0];
  if (!group || !Array.isArray(group.children)) return [];
  const controls = group.children.filter(isSegmentControlNode);
  const details = controls
    .map((node) => {
      const label = uiString(node.label) ?? "segment";
      const center = frameCenter(node.frame);
      const selected = uiString(node.value) === "1" ? " selected" : "";
      return center ? `${label} center=(${center.x},${center.y})${selected}` : null;
    })
    .filter((value): value is string => Boolean(value));
  if (details.length < 2) return [];
  const labels = controls.map((node) => uiString(node.label) ?? "").join(" ");
  const countryRouteHint = /countries|regions|global/i.test(labels)
    ? " For country-specific purchases such as Italy, select the Countries segment before choosing the country or search field."
    : "";
  return [
    `Segmented-control hint: tap the center of the target segment's own frame, not the parent group center. ${details.join("; ")}.${countryRouteHint}`,
  ];
}

function visibleScenarioTargetHints(output: string, scenario: string): string[] {
  if (!scenario.trim()) return [];
  const root = parseUiOutput(output);
  if (!root) return [];
  const targets = findVisibleScenarioTargets(root, scenario)
    .map((target) => `${target.label} center=(${target.center.x},${target.center.y})`)
    .slice(0, 3);
  if (targets.length === 0) return [];
  return [
    `Scenario target hint: visible target from the scenario is ${targets.join("; ")}. Tap the visible target row/control next instead of repeating surrounding tabs or filters.`,
  ];
}

function visibleCountryListHints(output: string, scenario: string): string[] {
  const root = parseUiOutput(output);
  if (!root) return [];
  if (/italy|country|countries/i.test(scenario) && findVisibleScenarioTargets(root, scenario).length) {
    return [];
  }
  const targets = findVisibleCountryTargets(root)
    .slice(0, 3)
    .map((target) => `${target.label} center=(${target.center.x},${target.center.y})`);
  if (targets.length === 0) return [];
  return [
    `Country-list hint: visible country rows include ${targets.join("; ")}. Select a country row next instead of repeating the Countries segment.`,
  ];
}

function findVisibleScenarioTargets(
  root: UiNode,
  scenario: string,
): Array<{ label: string; center: { x: string; y: string } }> {
  if (!scenario.trim()) return [];
  const scenarioLower = scenario.toLowerCase();
  const seen = new Set<string>();
  return collectUiNodes(root)
    .map((node) => {
      const label = uiString(node.label);
      const identifier = uiString(node.identifier);
      const center = frameCenter(node.frame);
      if (!label || !identifier || !center) return null;
      if (identifier !== "countryLabel") return null;
      if (!scenarioLower.includes(label.toLowerCase())) return null;
      const key = label.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return { label, center };
    })
    .filter(
      (value): value is { label: string; center: { x: string; y: string } } =>
        Boolean(value),
    );
}

function findVisibleCountryTargets(
  root: UiNode,
): Array<{ label: string; center: { x: string; y: string } }> {
  const seen = new Set<string>();
  return collectUiNodes(root)
    .map((node) => {
      const label = uiString(node.label);
      const identifier = uiString(node.identifier);
      const center = frameCenter(node.frame);
      if (!label || identifier !== "countryLabel" || !center) return null;
      const x = Number(center.x);
      const y = Number(center.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (x < 0 || x > 440 || y < 130 || y > 860) return null;
      const key = label.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return { label, center };
    })
    .filter(
      (value): value is { label: string; center: { x: string; y: string } } =>
        Boolean(value),
    );
}

function findButtonTargetForNote(
  root: UiNode,
  noteLower: string,
): { center: { x: string; y: string } } | null {
  const nodes = collectUiNodes(root);
  const checkbox = nodes.find(
    (node) => uiString(node.identifier) === "checkboxButton" && frameCenter(node.frame),
  );
  if (!noteLower.includes("checkbox") && noteLower.includes("continue")) {
    const continueButton = findButtonByLabel(nodes, "continue");
    if (continueButton) return continueButton;
  }
  const mentionsConsentAction = /checkbox|agree|agreement|confirm|terms|continue/.test(noteLower);
  if (mentionsConsentAction && checkbox) {
    const checkboxLabel = (uiString(checkbox.label) ?? "").toLowerCase();
    const selected = checkboxLabel === "selected" || checkboxLabel === "checked";
    if (!selected) {
      const center = frameCenter(checkbox.frame);
      return center ? { center } : null;
    }
    const continueButton = findButtonByLabel(nodes, "continue");
    if (continueButton) return continueButton;
  }

  for (const node of nodes) {
    if (uiString(node.role) !== "AXButton") continue;
    const label = uiString(node.label);
    const identifier = uiString(node.identifier);
    const center = frameCenter(node.frame);
    if (!center) continue;
    if (label && noteLower.includes(label.toLowerCase())) return { center };
    if (identifier && identifierMatchesNote(identifier, noteLower)) return { center };
    if (identifier === "welcomeContinueButton" && noteLower.includes("continue")) {
      return { center };
    }
  }
  return null;
}

function findButtonByLabel(
  nodes: UiNode[],
  labelLower: string,
): { center: { x: string; y: string } } | null {
  for (const node of nodes) {
    if (uiString(node.role) !== "AXButton") continue;
    const label = uiString(node.label);
    const center = frameCenter(node.frame);
    if (label?.toLowerCase() === labelLower && center) return { center };
  }
  return null;
}

function identifierMatchesNote(identifier: string, noteLower: string): boolean {
  const words = humanizeIdentifier(identifier)
    .split(/\s+/)
    .filter((word) => word.length > 2 && word !== "button");
  return words.length > 0 && words.every((word) => noteLower.includes(word));
}

function humanizeIdentifier(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

export function buildSimulatorRefTapArgs(
  args: string[],
  latestUiOutput: string,
  note: string | null,
  screen: ScreenSize | null,
  deviceUdid: string,
): string[] | null {
  if (args[0] !== "click" && args[0] !== "fill") return null;
  // Coordinates come from this ui output, so its root frame is the right
  // normalization base; the caller's screen is only a fallback.
  const effectiveScreen = parseDescribeRootSize(latestUiOutput) ?? screen;
  if (!effectiveScreen) return null;
  const root = parseUiOutput(latestUiOutput);
  if (!root) return null;
  const ref = flagValue(args, "--ref");
  const text = flagValue(args, "--text");
  const target =
    args[0] === "fill"
      ? findTextEntryTarget(root, note, text, ref)
      : findRefTarget(root, ref, note);
  return target
    ? buildTapArgs(deviceUdid, target.center, effectiveScreen)
    : null;
}

function findTextEntryTargetForTypeAction(
  latestUiOutput: string,
  args: string[],
  note: string | null,
): { node: UiNode; center: { x: string; y: string } } | null {
  if (args[0] !== "type") return null;
  const root = parseUiOutput(latestUiOutput);
  if (!root) return null;
  return findTextEntryTarget(root, note, flagValue(args, "--text"), null);
}

function shouldBlockTextAppend(
  node: UiNode,
  note: string | null,
  text: string | null,
): boolean {
  const current = uiString(node.value);
  if (!current) return false;
  if (/^enter your\b/i.test(current) || /^email address$/i.test(current)) return false;
  const identifier = (uiString(node.identifier) ?? "").toLowerCase();
  const requested = `${note ?? ""} ${text ?? ""}`.toLowerCase();
  const isEmailEntry =
    requested.includes("@") ||
    requested.includes("email") ||
    identifier.includes("email") ||
    current.includes("@");
  if (isEmailEntry) return true;
  const isPinEntry = identifier.includes("pin") || /otp|verification|code|111111/.test(requested);
  return isPinEntry && current.trim().length > 0 && (text?.trim().length ?? 0) > 1;
}

export function buildSimulatorTypeFocusTapArgs(
  args: string[],
  latestUiOutput: string,
  note: string | null,
  screen: ScreenSize | null,
  deviceUdid: string,
): string[] | null {
  if (args[0] !== "type") return null;
  const effectiveScreen = parseDescribeRootSize(latestUiOutput) ?? screen;
  if (!effectiveScreen) return null;
  const root = parseUiOutput(latestUiOutput);
  if (!root) return null;
  const target = findTextEntryTarget(root, note, flagValue(args, "--text"), null);
  if (!target || target.node.focused === true) return null;
  return buildTapArgs(deviceUdid, target.center, effectiveScreen);
}

function buildTapArgs(
  deviceUdid: string,
  center: { x: string; y: string },
  screen: ScreenSize,
): string[] {
  return [
    "tap",
    "--udid",
    deviceUdid,
    "--x",
    center.x,
    "--y",
    center.y,
    "--width",
    String(screen.width),
    "--height",
    String(screen.height),
  ];
}

function findRefTarget(
  root: UiNode,
  ref: string | null,
  note: string | null,
): { node: UiNode; center: { x: string; y: string } } | null {
  if (!ref) return null;
  const normalizedRef = normalizeRef(ref);
  const matches = collectUiNodes(root)
    .filter((node) => !node.hidden)
    .map((node) => ({ node, center: frameCenter(node.frame), haystack: nodeSearchText(node) }))
    .filter(
      (item): item is { node: UiNode; center: { x: string; y: string }; haystack: string } =>
        Boolean(item.center),
    )
    .filter((item) =>
      uiNodeStrings(item.node).some((value) => normalizeRef(value) === normalizedRef),
    );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const noteLower = (note ?? "").toLowerCase();
  return (
    matches.find((item) => noteLower && item.haystack.includes(noteLower)) ??
    matches
      .map((item) => ({ ...item, score: scoreFieldCandidate(item.node, note, null, null) }))
      .sort((a, b) => b.score - a.score)[0] ??
    null
  );
}

function findTextEntryTarget(
  root: UiNode,
  note: string | null,
  text: string | null,
  ref: string | null,
): { node: UiNode; center: { x: string; y: string } } | null {
  const refLower = ref ? normalizeRef(ref) : null;
  const nodes = collectUiNodes(root).filter((node) => !node.hidden);
  const exactRefNodes =
    refLower == null
      ? []
      : nodes.filter((node) =>
          uiNodeStrings(node).some((value) => normalizeRef(value) === refLower),
        );
  const sourceNodes = exactRefNodes.length > 0 ? exactRefNodes : nodes;
  const candidates = sourceNodes
    .filter(isLikelyTextEntryNode)
    .map((node) => ({ node, center: frameCenter(node.frame) }))
    .filter(
      (item): item is { node: UiNode; center: { x: string; y: string } } =>
        Boolean(item.center),
    )
    .sort((a, b) => frameTop(a.node) - frameTop(b.node) || frameLeft(a.node) - frameLeft(b.node));

  if (candidates.length === 0) {
    const target = findRefTarget(root, ref, note);
    return target ? { node: target.node, center: target.center } : null;
  }

  const ranked = candidates
    .map((candidate, index) => ({
      ...candidate,
      tokenMatches: countFieldIntentMatches(candidate.node, note, text),
      score: scoreFieldCandidate(candidate.node, note, text, index),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const intent = fieldIntent(note, text);
  if (
    best &&
    intent.requiresTokenMatch &&
    best.tokenMatches === 0 &&
    best.node.focused !== true
  ) {
    return null;
  }
  if (best && best.score > 0) return { node: best.node, center: best.center };

  const ordinal = fieldIntentOrdinal(note, text);
  return candidates[Math.min(ordinal ?? 0, candidates.length - 1)] ?? null;
}

function isLikelyTextEntryNode(node: UiNode): boolean {
  const role = (uiString(node.role) ?? "").toLowerCase();
  const identifier = (uiString(node.identifier) ?? "").toLowerCase();
  const haystack = nodeSearchText(node);
  return (
    role.includes("textfield") ||
    role.includes("text field") ||
    role.includes("secure") ||
    identifier.includes("textfield") ||
    identifier.includes("text_field") ||
    identifier.includes("input") ||
    identifier.includes("field") ||
    haystack.includes("text field") ||
    node.focused === true
  );
}

function hasFocusedTextEntry(
  output: string,
  note: string | null = null,
  text: string | null = null,
): boolean {
  const root = parseUiOutput(output);
  if (!root) return false;
  const intent = fieldIntent(note, text);
  return collectUiNodes(root).some((node) => {
    if (node.focused !== true || !isLikelyTextEntryNode(node)) return false;
    if (!intent.requiresTokenMatch) return true;
    return countFieldIntentMatches(node, note, text) > 0;
  });
}

function scoreFieldCandidate(
  node: UiNode,
  note: string | null,
  text: string | null,
  index: number | null,
): number {
  const haystack = nodeSearchText(node);
  const intent = fieldIntent(note, text);
  let score = isLikelyTextEntryNode(node) ? 5 : 0;
  if (node.focused === true) score += 3;
  score += countFieldIntentMatches(node, note, text) * 20;
  if (index != null && intent.ordinal != null) {
    score += Math.max(0, 8 - Math.abs(index - intent.ordinal) * 4);
  }
  return score;
}

function countFieldIntentMatches(
  node: UiNode,
  note: string | null,
  text: string | null,
): number {
  const haystack = nodeSearchText(node);
  return fieldIntent(note, text).tokens.filter((token) => haystack.includes(token)).length;
}

function fieldIntentOrdinal(note: string | null, text: string | null): number | null {
  return fieldIntent(note, text).ordinal;
}

function fieldIntent(
  note: string | null,
  text: string | null,
): { tokens: string[]; ordinal: number | null; requiresTokenMatch: boolean } {
  const lower = `${note ?? ""} ${text ?? ""}`.toLowerCase();
  if (/cvv|cvc|security/.test(lower)) {
    return { tokens: ["cvv", "cvc", "security"], ordinal: 4, requiresTokenMatch: false };
  }
  if (/expir\w*\s*year|expiry\s*year|\byear\b/.test(lower)) {
    return { tokens: ["year", "yy", "yyyy"], ordinal: 3, requiresTokenMatch: false };
  }
  if (/expir\w*\s*month|expiry\s*month|\bmonth\b/.test(lower)) {
    return { tokens: ["month", "mm"], ordinal: 2, requiresTokenMatch: false };
  }
  if (/expir|expiry|03\/30/.test(lower)) {
    return {
      tokens: ["expiry", "expiration", "exp", "mm", "yy"],
      ordinal: 2,
      requiresTokenMatch: false,
    };
  }
  if (/card\s*holder|cardholder|holder|john doe|\bname\b/.test(lower)) {
    return {
      tokens: ["holder", "cardholder", "name"],
      ordinal: 1,
      requiresTokenMatch: false,
    };
  }
  if (/card\s*number|411111|credit\s*card/.test(lower)) {
    return {
      tokens: ["card", "number", "credit"],
      ordinal: 0,
      requiresTokenMatch: false,
    };
  }
  if (/email|@/.test(lower)) {
    return { tokens: ["email"], ordinal: 0, requiresTokenMatch: true };
  }
  if (/otp|pin|verification|code|111111/.test(lower)) {
    return {
      tokens: ["otp", "pin", "verification", "code"],
      ordinal: 0,
      requiresTokenMatch: true,
    };
  }
  return { tokens: [], ordinal: null, requiresTokenMatch: false };
}

function uiNodeStrings(node: UiNode): string[] {
  return [node.identifier, node.label, node.title, node.value, node.help]
    .map(uiString)
    .filter((value): value is string => Boolean(value));
}

function nodeSearchText(node: UiNode): string {
  return uiNodeStrings(node).join(" ").toLowerCase();
}

function normalizeRef(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function frameTop(node: UiNode): number {
  const value = node.frame?.y;
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function frameLeft(node: UiNode): number {
  const value = node.frame?.x;
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

interface UiNode {
  children?: UiNode[];
  frame?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  focused?: unknown;
  help?: unknown;
  hidden?: unknown;
  identifier?: unknown;
  label?: unknown;
  role?: unknown;
  subrole?: unknown;
  title?: unknown;
  value?: unknown;
}

function parseUiOutput(output: string): UiNode | null {
  const logStart = output.indexOf("\n\n[");
  const jsonText = (logStart === -1 ? output : output.slice(0, logStart)).trim();
  if (!jsonText.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as UiNode)
      : null;
  } catch {
    return null;
  }
}

function collectUiNodes(node: UiNode, out: UiNode[] = []): UiNode[] {
  out.push(node);
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) collectUiNodes(child, out);
  return out;
}

function isSegmentControlNode(node: UiNode): boolean {
  return uiString(node.role) === "AXRadioButton" && uiString(node.subrole) === "AXTabButton";
}

function uiString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function frameCenter(frame: UiNode["frame"]): { x: string; y: string } | null {
  if (!frame) return null;
  const x = numberField(frame as Record<string, unknown>, "x");
  const y = numberField(frame as Record<string, unknown>, "y");
  const width = numberField(frame as Record<string, unknown>, "width");
  const height = numberField(frame as Record<string, unknown>, "height");
  if (x == null || y == null || width == null || height == null) return null;
  return {
    x: formatCoordinate(x + width / 2),
    y: formatCoordinate(y + height / 2),
  };
}

function formatCoordinate(value: number): string {
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function directSystemPrompt(providerLabel: string): string {
  return [
    `You are Testcat ${providerLabel}, a narrow iOS testing agent for simulator and physical iOS devices.`,
    "You can only control the assigned iOS device by replying with one JSON object.",
    "Never write markdown, prose outside JSON, shell scripts, or raw terminal commands.",
    "Action schema 1: {\"action\":\"run_testcat_sim\",\"args\":[\"describe-ui\",\"--udid\",\"UDID\"],\"note\":\"short reason\"}",
    "Action schema 2: {\"action\":\"complete\",\"status\":\"passed\",\"summary\":\"short verified result\"}",
    "The action name run_testcat_sim is legacy; Testcat routes it to testcat-sim for simulators and testcat-device for physical devices.",
    "Use describe-ui as the primary observation source. Use tap/type/key/swipe/press only through run_testcat_sim for simulators.",
    "Never pass accessibility identifiers, labels, or element names as positional gesture args.",
    "For simulators, do not use click or fill; tap the field center first, then use type with only --udid and --text.",
    "For physical devices, if describe-ui exposes @e refs, prefer [\"click\",\"--udid\",\"UDID\",\"--ref\",\"@e1\"] and [\"fill\",\"--udid\",\"UDID\",\"--ref\",\"@e1\",\"--text\",\"TEXT\"].",
    "To tap an element, compute its center from the describe-ui frame and use: [\"tap\",\"--udid\",\"UDID\",\"--x\",\"CENTER_X\",\"--y\",\"CENTER_Y\",\"--width\",\"SCREEN_WIDTH\",\"--height\",\"SCREEN_HEIGHT\"].",
    "To type text, first tap the input field to focus it, then use exactly: [\"type\",\"--udid\",\"UDID\",\"--text\",\"TEXT\"]. Never include --x, --y, --width, or --height with type.",
    "For every tap, double-tap, swipe, pinch, or pan gesture, take --width/--height from the ROOT frame of the same describe-ui output the coordinates came from; never reuse dimensions from an older screen.",
    "When a Continue/Next action is gated by an unchecked checkbox, switch, consent, or permission control, activate that required control before tapping Continue.",
    "If the UI is unchanged after a successful tap, inspect the accessibility tree and pick a different required control instead of repeating the same coordinates.",
    "Do not complete until the scenario has been verified or a real blocker is observed.",
  ].join("\n");
}

function directPlannerSystemPrompt(availableCount: number): string {
  return [
    "You are Testcat's pre-run simulator allocation planner.",
    "Your only job is to decide how many iOS simulators should be prepared before the real test starts.",
    `You may choose from 1 to ${Math.min(MAX_DEVICES, Math.max(1, availableCount))} simulators.`,
    "For Ollama Direct mode, choose 1 simulator. Direct mode does not coordinate shared state across multiple independent device loops yet.",
    "Handle multi-user scenarios sequentially in one simulator by signing out, uninstalling/reinstalling, or otherwise resetting app state when needed.",
    "Do not choose more than one simulator for Direct mode when subagents, parallelism, two users, or multiple accounts are mentioned.",
    "If uncertain, choose 1.",
    "Return exactly one JSON object: {\"simulatorCount\":1,\"parallel\":false,\"reason\":\"short planning summary\"}",
  ].join("\n");
}
