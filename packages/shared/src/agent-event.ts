/**
 * Normalized agent stream event. Both the Claude (`stream-json`) and Codex
 * (`exec --json`) parsers emit this union so the chat UI stays CLI-agnostic.
 */
type AgentEventMeta = {
  /** ISO timestamp assigned when the app receives/emits this normalized event. */
  timestamp?: string;
};

export type AgentEvent =
  | ({ type: "text_delta"; text: string } & AgentEventMeta)
  | ({ type: "thinking_delta"; text: string } & AgentEventMeta)
  | ({
      type: "tool_use";
      name: string;
      family: ToolFamily;
      input: unknown;
    } & AgentEventMeta)
  | ({ type: "tool_result"; ok: boolean; output: string } & AgentEventMeta)
  | ({ type: "usage"; inputTokens: number; outputTokens: number } & AgentEventMeta)
  | ({ type: "status"; phase: RunPhase } & AgentEventMeta);

export type ToolFamily =
  | "read"
  | "edit"
  | "write"
  | "exec"
  | "skill"
  | "mcp"
  | "other";

export type RunPhase =
  | "starting"
  | "thinking"
  | "acting"
  | "finishing"
  | "done";
