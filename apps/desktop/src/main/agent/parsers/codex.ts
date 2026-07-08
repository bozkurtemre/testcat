import type { AgentEvent } from "@testcat/shared";
import type { StreamParser } from "./claude";

const pick = (obj: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const pickNumber = (
  obj: Record<string, unknown>,
  ...keys: string[]
): number | null => {
  for (const key of keys) {
    const value = asNumber(obj[key]);
    if (value != null) return value;
  }
  return null;
};

/**
 * Best-effort Codex (`codex exec --json`) parser. The codex-cli 0.141.0 JSONL
 * schema is under-documented (see PRD open questions), so this surfaces the
 * agent's text and command runs without crashing. Refine once validated
 * against real output.
 */
export function createCodexParser(emit: (e: AgentEvent) => void): StreamParser {
  let buf = "";
  let last: string | null = null;

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return;
    }

    const msg = (obj.msg ?? obj.item ?? obj) as Record<string, unknown>;
    const type = String(obj.type ?? msg.type ?? "");
    const usage =
      asObject(obj.usage) ??
      asObject(obj.token_usage) ??
      asObject(obj.total_token_usage) ??
      asObject(msg.usage) ??
      asObject(msg.token_usage) ??
      asObject(msg.total_token_usage);
    if (usage) {
      const inputTokens =
        pickNumber(usage, "input_tokens", "prompt_tokens", "inputTokens", "promptTokens") ??
        0;
      const outputTokens =
        pickNumber(
          usage,
          "output_tokens",
          "completion_tokens",
          "outputTokens",
          "completionTokens",
        ) ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        emit({ type: "usage", inputTokens, outputTokens });
      }
    }

    const cmd = pick(msg, "command", "cmd");
    if (cmd || type.includes("exec") || type.includes("command")) {
      if (cmd) emit({ type: "tool_use", name: "shell", family: "exec", input: cmd });
      const out = pick(msg, "output", "stdout", "aggregated_output");
      if (out) emit({ type: "tool_result", ok: true, output: out });
      return;
    }

    if (type.includes("reasoning")) {
      const t = pick(msg, "text", "summary", "content");
      if (t) emit({ type: "thinking_delta", text: t });
      return;
    }

    const text = pick(msg, "text", "message", "content");
    if (text) {
      last = text;
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
      return last;
    },
  };
}
