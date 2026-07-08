import type { AgentEvent, ToolFamily } from "@testcat/shared";

export interface StreamParser {
  push(chunk: string): void;
  flush(): void;
  getResult(): string | null;
  getSessionId?(): string | null;
}

function classify(name: string): ToolFamily {
  if (name.startsWith("mcp__")) return "mcp";
  const n = name.toLowerCase();
  if (n === "bash") return "exec";
  if (["read", "glob", "grep", "ls", "notebookread"].includes(n)) return "read";
  if (n === "edit" || n === "multiedit") return "edit";
  if (n === "write") return "write";
  if (n === "skill") return "skill";
  return "other";
}

const asText = (c: unknown): string =>
  typeof c === "string" ? c : JSON.stringify(c);

/**
 * Parses `claude --print --output-format stream-json --verbose` output (NDJSON).
 * Emits one normalized AgentEvent per content block; coalescing into chat
 * bubbles happens in the renderer.
 */
export function createClaudeParser(emit: (e: AgentEvent) => void): StreamParser {
  let buf = "";
  let result: string | null = null;

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return; // ignore non-JSON noise
    }

    switch (obj.type) {
      case "assistant": {
        const content =
          (obj.message as { content?: unknown[] } | undefined)?.content ?? [];
        for (const raw of content) {
          const b = raw as Record<string, unknown>;
          if (b.type === "text" && b.text) {
            emit({ type: "text_delta", text: String(b.text) });
          } else if (b.type === "thinking" && b.thinking) {
            emit({ type: "thinking_delta", text: String(b.thinking) });
          } else if (b.type === "tool_use") {
            const name = String(b.name ?? "tool");
            emit({
              type: "tool_use",
              name,
              family: classify(name),
              input: b.input,
            });
          }
        }
        break;
      }
      case "user": {
        const content =
          (obj.message as { content?: unknown[] } | undefined)?.content ?? [];
        for (const raw of content) {
          const b = raw as Record<string, unknown>;
          if (b.type === "tool_result") {
            emit({
              type: "tool_result",
              ok: b.is_error !== true,
              output: asText(b.content),
            });
          }
        }
        break;
      }
      case "result": {
        const usage = obj.usage as
          | { input_tokens?: number; output_tokens?: number }
          | undefined;
        if (usage) {
          emit({
            type: "usage",
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
          });
        }
        if (typeof obj.result === "string") result = obj.result;
        emit({ type: "status", phase: "done" });
        break;
      }
      default:
        break; // "system" init etc. — nothing to render
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
    },
    getResult() {
      return result;
    },
  };
}
