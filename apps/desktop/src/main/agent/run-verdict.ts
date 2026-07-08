import type { AgentEvent, TestStatus } from "@testcat/shared";

interface RunVerdictInput {
  cmd: string;
  events: AgentEvent[];
  expectedCompleteToken: string;
  expectedRunId: string;
  exitCode: number | null;
  parserResult: string | null;
  requiresTestcatIosExecution: boolean;
  stderr: string;
}

interface RunVerdict {
  result: string | null;
  status: TestStatus;
}

const EXECUTION_SUBCOMMANDS = [
  "tap",
  "double-tap",
  "swipe",
  "pinch",
  "pan",
  "scroll",
  "press",
  "key",
  "type",
  "input",
  "screenshot",
  "describe-ui",
  "logs",
] as const;

interface CompletionMarker {
  status: "passed" | "failed";
  summary: string | null;
}

interface SimulatorCommandSummary {
  exercised: boolean;
  attemptedBoot: boolean;
  hitShutdownInstallError: boolean;
}

function commandText(input: unknown): string {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "";
  const command = (input as { command?: unknown }).command;
  if (typeof command === "string") return command;
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-zA-Z0-9-])${word}($|[^a-zA-Z0-9-])`).test(text);
}

function commandUsesTestcatCli(command: string): boolean {
  return (
    command.includes("testcat-sim") ||
    command.includes("TESTCAT_SIM_BIN") ||
    command.includes("testcat-device") ||
    command.includes("TESTCAT_DEVICE_BIN")
  );
}

function commandHasAnySubcommand(
  command: string,
  subcommands: readonly string[],
): boolean {
  return subcommands.some((subcommand) => hasWord(command, subcommand));
}

function isExecToolUse(
  event: AgentEvent,
): event is Extract<AgentEvent, { type: "tool_use" }> & { family: "exec" } {
  return event.type === "tool_use" && event.family === "exec";
}

function summarizeTestcatSimUse(events: AgentEvent[]): SimulatorCommandSummary {
  const commands = events
    .filter(isExecToolUse)
    .map((event) => commandText(event.input))
    .filter(commandUsesTestcatCli)
    .filter((command) => !hasWord(command, "complete"));
  const toolOutputs = events
    .filter((event) => event.type === "tool_result")
    .map((event) => event.output)
    .join("\n");

  return {
    exercised: commands.some((command) =>
      commandHasAnySubcommand(command, EXECUTION_SUBCOMMANDS),
    ),
    attemptedBoot: commands.some((command) => hasWord(command, "boot")),
    hitShutdownInstallError:
      commands.some((command) => hasWord(command, "install")) &&
      /Unable to lookup in current state:\s*Shutdown/i.test(toolOutputs),
  };
}

function hasAnyExecToolUse(events: AgentEvent[]): boolean {
  return events.some(isExecToolUse);
}

function looksLikeCliError(result: string | null): boolean {
  return Boolean(
    result &&
      /(apierror|unknownerror|provider|model .*not found|not listed|not currently runnable|error event|failed|exited|stopped without producing final text|steps limit)/i.test(
        result,
      ),
  );
}

function completionFromObject(
  value: unknown,
  expectedRunId: string,
  expectedCompleteToken: string,
): CompletionMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (obj.event !== "testcat.run_complete") return null;
  if (obj.ok !== true) return null;
  if (obj.runId !== expectedRunId) return null;
  if (obj.token !== expectedCompleteToken) return null;
  if (obj.status !== "passed" && obj.status !== "failed") return null;
  return {
    status: obj.status,
    summary:
      typeof obj.summary === "string" && obj.summary.trim()
        ? obj.summary.trim()
        : null,
  };
}

function completionFromValue(
  value: unknown,
  expectedRunId: string,
  expectedCompleteToken: string,
  depth = 0,
): CompletionMarker | null {
  if (depth > 5) return null;
  const direct = completionFromObject(value, expectedRunId, expectedCompleteToken);
  if (direct) return direct;

  if (typeof value === "string") {
    if (!value.includes("testcat.run_complete")) return null;
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.includes("testcat.run_complete")) continue;
      try {
        const marker = completionFromValue(
          JSON.parse(trimmed),
          expectedRunId,
          expectedCompleteToken,
          depth + 1,
        );
        if (marker) return marker;
      } catch {
        // Keep scanning; the line may be human-readable text around JSON.
      }
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const marker = completionFromValue(
        item,
        expectedRunId,
        expectedCompleteToken,
        depth + 1,
      );
      if (marker) return marker;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const marker = completionFromValue(
        item,
        expectedRunId,
        expectedCompleteToken,
        depth + 1,
      );
      if (marker) return marker;
    }
  }

  return null;
}

function findCompletionMarker(input: RunVerdictInput): CompletionMarker | null {
  for (const event of input.events) {
    if (event.type !== "tool_result" || !event.ok) continue;
    for (const line of event.output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.includes("testcat.run_complete")) continue;
      try {
        const marker = completionFromValue(
          JSON.parse(trimmed),
          input.expectedRunId,
          input.expectedCompleteToken,
        );
        if (marker) return marker;
      } catch {
        // Tool output may contain non-JSON lines around the marker.
      }
    }
  }
  return null;
}

export function determineRunVerdict(input: RunVerdictInput): RunVerdict {
  if (input.exitCode !== 0) {
    const fallbackResult =
      input.stderr.trim().slice(-2000) ||
      `${input.cmd} exited with code ${input.exitCode}`;
    return {
      status: "error",
      result: input.parserResult ?? fallbackResult,
    };
  }

  if (!input.requiresTestcatIosExecution) {
    return { status: "passed", result: input.parserResult };
  }

  const completion = findCompletionMarker(input);
  if (!completion) {
    if (!hasAnyExecToolUse(input.events)) {
      if (looksLikeCliError(input.parserResult)) {
        return {
          status: "error",
          result: input.parserResult,
        };
      }
      return {
        status: "error",
        result:
          "Agent exited without making any shell tool calls. It only produced narrative text, so the simulator and app were never controlled. Retry with a tool-capable agent/model or a profile that follows shell tool instructions.",
      };
    }

    if (looksLikeCliError(input.parserResult)) {
      return {
        status: "error",
        result: input.parserResult,
      };
    }

    return {
      status: "error",
      result:
        "Agent exited without the required Testcat completion marker. The test is only finished after `${TESTCAT_SIM_BIN:-testcat-sim} complete ...` or `${TESTCAT_DEVICE_BIN:-testcat-device} complete ...` runs successfully.",
    };
  }

  const sim = summarizeTestcatSimUse(input.events);

  if (completion.status === "failed") {
    if (sim.hitShutdownInstallError && !sim.attemptedBoot) {
      return {
        status: "error",
        result:
          "Agent attempted to install on a Shutdown simulator but never ran `${TESTCAT_SIM_BIN:-testcat-sim} boot --udid <UDID>`. The run did not exhaust the required headless setup sequence.",
      };
    }

    return {
      status: "failed",
      result:
        completion.summary ?? input.parserResult ?? "Agent marked the test as failed.",
    };
  }

  if (!sim.exercised) {
    return {
      status: "error",
      result:
        "Agent emitted the completion marker without any prior Testcat device interaction or verification command, so the app was not actually tested.",
    };
  }

  return { status: "passed", result: completion.summary ?? input.parserResult };
}
