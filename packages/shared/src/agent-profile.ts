export type AgentCli = "claude" | "codex" | "ollama" | "opencode";

/**
 * Reasoning effort. Codex maps directly to `model_reasoning_effort`.
 * Claude has no first-class effort flag — it maps via a translation rule
 * (see PRD "Open questions"). Direct local providers store "medium" for
 * compatibility even though they do not expose an effort control.
 */
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentModelPrefs {
  /** Provider model id, e.g. "sonnet", "gpt-5-codex", or a local model id. */
  model: string;
  reasoning: ReasoningEffort;
}

export interface AgentProfile extends AgentModelPrefs {
  id: string;
  name: string;
  cli: AgentCli;
  /** Skill names/paths made available to the agent CLI for this profile. */
  skills: string[];
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

/** Create/update payload — the server assigns id + timestamps. */
export type AgentProfileInput = Omit<
  AgentProfile,
  "id" | "createdAt" | "updatedAt"
>;

export const AGENT_CLIS: readonly AgentCli[] = [
  "claude",
  "codex",
  "ollama",
  "opencode",
];

/** A selectable model + the reasoning efforts it actually supports. */
export interface ModelInfo {
  /** Value passed to the CLI (a Claude alias like "opus", or a Codex slug). */
  id: string;
  label: string;
  efforts: readonly ReasoningEffort[];
  defaultEffort: ReasoningEffort;
  provider?: string;
  available?: boolean;
  availabilityReason?: string;
}

const CLAUDE_EFFORTS: readonly ReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

// Claude Code has no local model catalog, so we list the official aliases the
// `claude --model` help recommends — each always resolves to the latest of its
// family, so this never goes stale. Efforts map to the real `claude --effort`
// levels (low…max; xhigh is Claude Code's default).
export const CLAUDE_MODELS: readonly ModelInfo[] = [
  { id: "opus", label: "Opus (latest)", efforts: CLAUDE_EFFORTS, defaultEffort: "xhigh" },
  { id: "sonnet", label: "Sonnet (latest)", efforts: CLAUDE_EFFORTS, defaultEffort: "high" },
  { id: "fable", label: "Fable (latest)", efforts: CLAUDE_EFFORTS, defaultEffort: "xhigh" },
  { id: "haiku", label: "Haiku (latest)", efforts: CLAUDE_EFFORTS, defaultEffort: "medium" },
];

// Codex's real catalog is read live from ~/.codex/models_cache.json (see main
// `agent/models.ts`); this is only the offline fallback.
export const CODEX_FALLBACK_MODELS: readonly ModelInfo[] = [
  { id: "gpt-5.5", label: "GPT-5.5", efforts: ["low", "medium", "high", "xhigh"], defaultEffort: "medium" },
  { id: "gpt-5-codex", label: "GPT-5 Codex", efforts: ["low", "medium", "high", "xhigh"], defaultEffort: "medium" },
];

export const OLLAMA_FALLBACK_MODELS: readonly ModelInfo[] = [];

export const OPENCODE_FALLBACK_MODELS: readonly ModelInfo[] = [];

/** Picker fallback used until `models:list` resolves (or if it fails). */
export const FALLBACK_MODELS: Record<AgentCli, readonly ModelInfo[]> = {
  claude: CLAUDE_MODELS,
  codex: CODEX_FALLBACK_MODELS,
  ollama: OLLAMA_FALLBACK_MODELS,
  opencode: OPENCODE_FALLBACK_MODELS,
};
