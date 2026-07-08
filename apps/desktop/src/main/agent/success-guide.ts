import type { AgentEvent, TestRun } from "@testcat/shared";

export const SUCCESS_GUIDE_MAX_CHARS = 6_000;

type SuccessGuideRun = Pick<
  TestRun,
  | "id"
  | "name"
  | "buildPath"
  | "physicalBuildPath"
  | "devicePreference"
  | "scenario"
  | "cli"
  | "model"
  | "profileName"
  | "devices"
  | "result"
  | "durationMs"
  | "finishedAt"
>;

interface CommandStep {
  command: string;
  output?: string;
  ok?: boolean;
}

export function buildLastSuccessRunGuide(input: {
  run: SuccessGuideRun;
  events: AgentEvent[];
}): string {
  const commandSteps = sampleCommandSteps(extractCommandSteps(input.events));
  const observations = extractObservations(input.events);
  const notes = extractAgentNotes(input.events);
  const deviceHints = extractDeviceHints(input.run, commandSteps);

  const lines = [
    `Source run: ${input.run.name} (${input.run.id})`,
    `Finished: ${input.run.finishedAt ?? "unknown"}`,
    `Profile/model: ${input.run.profileName || input.run.cli} · ${input.run.cli}/${input.run.model}`,
    `Build: ${input.run.buildPath}`,
    ...(input.run.physicalBuildPath
      ? [`Physical build: ${input.run.physicalBuildPath}`]
      : []),
    `Device preference: ${input.run.devicePreference}`,
    `Duration: ${formatDuration(input.run.durationMs)}`,
    `Final result: ${input.run.result ?? "passed"}`,
    "",
    "Original scenario:",
    oneLine(input.run.scenario, 900),
    "",
    "How to use this guide:",
    "- Treat it as a speed hint, not as current truth.",
    "- Verify each screen with the current accessibility tree before acting.",
    "- Recompute coordinates from the latest describe-ui frames; do not reuse old coordinates blindly.",
    "- If the UI differs from this guide, adapt to the current UI and continue the scenario.",
  ];

  if (deviceHints.length) {
    lines.push("", "Device hints:", ...deviceHints.map((hint) => `- ${hint}`));
  }

  if (commandSteps.length) {
    lines.push("", "Successful command sequence:");
    commandSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${oneLine(step.command, 320)}`);
      if (step.output) {
        const prefix = step.ok === false ? "failed output" : "output";
        lines.push(`   ${prefix}: ${summarizeToolOutput(step.output)}`);
      }
    });
  }

  if (observations.length) {
    lines.push(
      "",
      "Stable UI observations/checkpoints from successful run:",
      ...observations.map((observation) => `- ${observation}`),
    );
  }

  if (notes.length) {
    lines.push(
      "",
      "Agent notes from successful run:",
      ...notes.map((note) => `- ${note}`),
    );
  }

  return truncateGuide(lines.join("\n"));
}

export function lastSuccessGuidePromptBlock(guide: string | null | undefined): string {
  const trimmed = guide?.trim();
  if (!trimmed) return "";
  return [
    "LAST SUCCESSFUL RUN GUIDE",
    "The following guide was generated from a previous passed run of this test. Use it to move faster, but verify the current UI before each action.",
    "",
    trimmed,
  ].join("\n");
}

function extractCommandSteps(events: AgentEvent[]): CommandStep[] {
  const steps: CommandStep[] = [];
  let pendingIndex: number | null = null;

  for (const event of events) {
    if (event.type === "tool_use" && event.family === "exec") {
      const command = commandText(event.input);
      if (!command) continue;
      steps.push({ command });
      pendingIndex = steps.length - 1;
      continue;
    }

    if (event.type === "tool_result" && pendingIndex != null) {
      steps[pendingIndex] = {
        ...steps[pendingIndex],
        ok: event.ok,
        output: event.output,
      };
      pendingIndex = null;
    }
  }

  const relevant = steps.filter((step) =>
    /testcat-(sim|device)|simctl|xcodebuild/i.test(step.command),
  );
  return relevant.length ? relevant : steps;
}

function sampleCommandSteps(steps: CommandStep[]): CommandStep[] {
  const successful = steps.filter((step) => step.ok !== false);
  const source = successful.length ? successful : steps;
  if (source.length <= 28) return source;
  return [...source.slice(0, 20), ...source.slice(-8)];
}

function commandText(input: unknown): string | null {
  if (typeof input === "string") return input.trim() || null;
  if (Array.isArray(input)) return input.map(String).join(" ").trim() || null;
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  for (const key of ["command", "cmd", "script"]) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (Array.isArray(obj.args)) {
    return obj.args.map(String).join(" ").trim() || null;
  }
  return JSON.stringify(input);
}

function extractObservations(events: AgentEvent[]): string[] {
  const observations: string[] = [];
  for (const event of events) {
    if (event.type !== "tool_result" || !event.ok) continue;
    const labels = extractLabels(event.output);
    if (labels.length) {
      observations.push(`Visible labels included: ${labels.slice(0, 14).join(", ")}`);
      continue;
    }
    if (/complete|installed|launched|booted|success/i.test(event.output)) {
      observations.push(oneLine(event.output, 220));
    }
  }
  return dedupe(observations).slice(-8);
}

function extractLabels(output: string): string[] {
  const labels = [
    ...output.matchAll(/"label"\s*:\s*"([^"]{1,90})"/g),
    ...output.matchAll(/"title"\s*:\s*"([^"]{1,90})"/g),
    ...output.matchAll(/"value"\s*:\s*"([^"]{1,90})"/g),
  ]
    .map((match) => cleanLabel(match[1]))
    .filter(Boolean);
  return dedupe(labels).slice(0, 18);
}

function extractAgentNotes(events: AgentEvent[]): string[] {
  return events
    .filter((event): event is Extract<AgentEvent, { type: "text_delta" }> =>
      event.type === "text_delta",
    )
    .map((event) => oneLine(event.text, 360))
    .filter((text) => text.length >= 24)
    .slice(-5);
}

function extractDeviceHints(
  run: SuccessGuideRun,
  commandSteps: CommandStep[],
): string[] {
  const deviceHints = run.devices.map((device) =>
    [
      `${device.name} (${device.udid})`,
      device.runtime,
      device.kind ?? "simulator",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const udids = commandSteps
    .flatMap((step) => [...step.command.matchAll(/--udid\s+([A-Fa-f0-9-]+)/g)])
    .map((match) => `UDID used in commands: ${match[1]}`);
  return dedupe([...deviceHints, ...udids]).slice(0, 6);
}

function summarizeToolOutput(output: string): string {
  const labels = extractLabels(output);
  if (labels.length) {
    return `visible labels: ${labels.slice(0, 10).join(", ")}`;
  }
  return oneLine(output, 260);
}

function oneLine(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 16).trim()} ...[truncated]`;
}

function cleanLabel(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (!value || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value);
  }
  return out;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs == null) return "unknown";
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${Math.round(durationMs / 1_000)}s`;
}

function truncateGuide(value: string): string {
  if (value.length <= SUCCESS_GUIDE_MAX_CHARS) return value;
  return `${value.slice(0, SUCCESS_GUIDE_MAX_CHARS - 34).trim()}\n...[success guide truncated]`;
}
