import type { AgentEvent, ToolFamily } from "@testcat/shared";
import type { StreamParser } from "./claude";

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const okFromToolState = (
  state: Record<string, unknown>,
  output: string,
): boolean => {
  const metadata = asObject(state.metadata);
  const exit = asNumber(metadata?.exit);
  if (exit != null) return exit === 0;
  return !/^Error:/i.test(output.trim());
};

function classify(tool: string): ToolFamily {
  const name = tool.toLowerCase();
  if (name === "bash" || name === "shell") return "exec";
  if (["read", "glob", "grep", "ls"].includes(name)) return "read";
  if (["edit", "multiedit"].includes(name)) return "edit";
  if (name === "write") return "write";
  if (name.startsWith("mcp__")) return "mcp";
  return "other";
}

function errorText(error: unknown): string | null {
  if (typeof error === "string" && error.trim()) return error.trim();
  const obj = asObject(error);
  if (!obj) return null;
  const name = asString(obj.name);
  const data = asObject(obj.data);
  const message =
    asString(obj.message) ??
    asString(data?.message) ??
    asString(data?.responseBody);
  if (name && message) return `${name}: ${message}`;
  return message ?? name;
}

function tokenUsage(part: Record<string, unknown>): AgentEvent | null {
  const tokens = asObject(part.tokens);
  if (!tokens) return null;
  const inputTokens =
    asNumber(tokens.input) ??
    asNumber(tokens.inputTokens) ??
    asNumber(tokens.prompt_tokens) ??
    0;
  const outputTokens =
    asNumber(tokens.output) ??
    asNumber(tokens.outputTokens) ??
    asNumber(tokens.completion_tokens) ??
    0;
  if (inputTokens <= 0 && outputTokens <= 0) return null;
  return { type: "usage", inputTokens, outputTokens };
}

export function createOpencodeParser(emit: (e: AgentEvent) => void): StreamParser {
  let buf = "";
  let result: string | null = null;
  let errorResult: string | null = null;
  let lastStepStopWithoutOutput = false;
  let sessionId: string | null = null;

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return;
    }

    const type = String(obj.type ?? "");
    const part = asObject(obj.part) ?? {};
    sessionId = asString(obj.sessionID) ?? asString(part.sessionID) ?? sessionId;

    if (type === "text") {
      const text = asString(part.text);
      if (text) {
        result = text;
        lastStepStopWithoutOutput = false;
        emit({ type: "text_delta", text });
      }
      return;
    }

    if (type === "tool_use") {
      const tool = asString(part.tool) ?? "tool";
      const state = asObject(part.state);
      const input = state?.input ?? {};
      emit({
        type: "tool_use",
        name: tool,
        family: classify(tool),
        input,
      });

      if (state?.status === "completed") {
        const metadata = asObject(state.metadata);
        const output =
          asString(state.output) ??
          asString(metadata?.output) ??
          (metadata ? JSON.stringify(metadata) : "");
        emit({ type: "tool_result", ok: okFromToolState(state, output), output });
      } else if (state?.status === "error") {
        emit({
          type: "tool_result",
          ok: false,
          output: asString(state.error) ?? JSON.stringify(state),
        });
      }
      return;
    }

    if (type === "step_finish") {
      const usage = tokenUsage(part);
      const reason = asString(part.reason);
      const outputTokens = usage?.type === "usage" ? usage.outputTokens : 0;
      lastStepStopWithoutOutput = reason === "stop" && outputTokens === 0;
      if (usage) emit(usage);
      return;
    }

    if (type === "error") {
      const text = errorText(obj.error) ?? "opencode returned an error event.";
      errorResult = text;
      emit({ type: "text_delta", text });
    }
  }

  return {
    push(chunk) {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        handleLine(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    },
    flush() {
      if (buf.trim()) handleLine(buf);
      buf = "";
      emit({ type: "status", phase: "done" });
    },
    getResult() {
      if (!errorResult && lastStepStopWithoutOutput) {
        return "opencode stopped without producing final text after an empty step. This usually means the selected opencode agent hit its configured `steps` limit before emitting the Testcat completion marker.";
      }
      return result ?? errorResult;
    },
    getSessionId() {
      return sessionId;
    },
  };
}
