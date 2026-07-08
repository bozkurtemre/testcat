import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type AgentCli,
  CLAUDE_MODELS,
  CODEX_FALLBACK_MODELS,
  OLLAMA_FALLBACK_MODELS,
  OPENCODE_FALLBACK_MODELS,
  type ModelInfo,
  type ReasoningEffort,
} from "@testcat/shared";
import { listOllamaModels } from "../ollama-codex";

const EFFORTS: readonly ReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
const OLLAMA_EFFORTS: readonly ReasoningEffort[] = ["medium"];
const OPENCODE_EFFORTS: readonly ReasoningEffort[] = ["medium"];
const isEffort = (s: unknown): s is ReasoningEffort =>
  typeof s === "string" && (EFFORTS as readonly string[]).includes(s);

interface CodexModel {
  slug: string;
  display_name?: string;
  visibility?: string;
  default_reasoning_level?: string;
  supported_reasoning_levels?: { effort: string }[];
}

// Codex maintains a server-fetched model catalog at ~/.codex/models_cache.json
// (slug, display name, supported reasoning levels, visibility). Reading it is how
// the picker shows the *actually current* Codex models rather than a stale guess.
function readCodexModels(): ModelInfo[] | null {
  try {
    const raw = readFileSync(
      join(homedir(), ".codex", "models_cache.json"),
      "utf8",
    );
    const models = (JSON.parse(raw) as { models?: CodexModel[] }).models ?? [];
    const out: ModelInfo[] = [];
    for (const m of models) {
      if (m.visibility !== "list") continue; // skip hidden (e.g. auto-review)
      const efforts = (m.supported_reasoning_levels ?? [])
        .map((e) => e.effort)
        .filter(isEffort);
      out.push({
        id: m.slug,
        label: m.display_name ?? m.slug,
        efforts: efforts.length ? efforts : ["low", "medium", "high", "xhigh"],
        defaultEffort: isEffort(m.default_reasoning_level)
          ? m.default_reasoning_level
          : "medium",
      });
    }
    return out.length ? out : null;
  } catch {
    return null; // codex not installed / never run — fall back
  }
}

function labelForOllamaModel(name: string): string {
  return name;
}

function execFileText(
  cmd: string,
  args: string[],
  timeout = 12_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.toString());
    });
  });
}

export function parseOpencodeModelsOutput(output: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("}")) continue;
    if (trimmed.includes(" ") || !trimmed.includes("/")) continue;
    if (!/^[a-z0-9][a-z0-9._-]*\/\S+$/i.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function opencodeProvider(id: string): string {
  return id.slice(0, id.indexOf("/"));
}

function opencodeProviderModel(id: string): string {
  return id.slice(id.indexOf("/") + 1);
}

export function buildOpencodeModelInfos(
  opencodeModelIds: readonly string[],
  localOllamaModelNames: readonly string[] | null,
): ModelInfo[] {
  const out: ModelInfo[] = [];
  const seen = new Set<string>();
  const opencodeOllamaModels = new Set<string>();
  const localOllamaModels = localOllamaModelNames
    ? new Set(localOllamaModelNames)
    : null;

  for (const id of opencodeModelIds) {
    const provider = opencodeProvider(id);
    const providerModel = opencodeProviderModel(id);
    if (provider === "ollama") opencodeOllamaModels.add(providerModel);

    const info: ModelInfo = {
      id,
      label: id,
      provider,
      efforts: OPENCODE_EFFORTS,
      defaultEffort: "medium",
    };
    if (provider === "ollama") {
      if (!localOllamaModels) {
        info.available = false;
        info.availabilityReason =
          "Local Ollama daemon is not reachable, so Testcat cannot verify this opencode Ollama model.";
      } else if (!localOllamaModels.has(providerModel)) {
        info.available = false;
        info.availabilityReason =
          "Opencode lists this Ollama model, but the local Ollama daemon does not currently expose that tag.";
      }
    }
    seen.add(id);
    out.push(info);
  }

  if (localOllamaModels) {
    for (const name of [...localOllamaModels].sort()) {
      const id = `ollama/${name}`;
      if (opencodeOllamaModels.has(name) || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label: `${id} (not in opencode)`,
        provider: "ollama",
        efforts: OPENCODE_EFFORTS,
        defaultEffort: "medium",
        available: false,
        availabilityReason:
          "Local Ollama exposes this tag, but opencode does not list it. Add it to opencode's provider config before using it through opencode.",
      });
    }
  }

  return out;
}

async function readOllamaModels(): Promise<ModelInfo[]> {
  try {
    const models = await listOllamaModels();
    return models
      .filter((model) =>
        model.capabilities.length
          ? model.capabilities.includes("completion")
          : true,
      )
      .map((model) => ({
        id: model.name,
        label: labelForOllamaModel(model.name),
        efforts: OLLAMA_EFFORTS,
        defaultEffort: "medium" as const,
      }));
  } catch {
    return [...OLLAMA_FALLBACK_MODELS];
  }
}

async function readOpencodeModels(): Promise<ModelInfo[]> {
  try {
    const [raw, ollamaModels] = await Promise.all([
      execFileText("opencode", ["models"]),
      listOllamaModels().catch(() => null),
    ]);
    const localNames = ollamaModels?.map((model) => model.name) ?? null;
    const out = buildOpencodeModelInfos(
      parseOpencodeModelsOutput(raw),
      localNames,
    );
    return out.length ? out : [...OPENCODE_FALLBACK_MODELS];
  } catch {
    return [...OPENCODE_FALLBACK_MODELS];
  }
}

export async function listModels(): Promise<Record<AgentCli, ModelInfo[]>> {
  const codexModels = readCodexModels() ?? [...CODEX_FALLBACK_MODELS];
  const [ollamaModels, opencodeModels] = await Promise.all([
    readOllamaModels(),
    readOpencodeModels(),
  ]);
  return {
    claude: [...CLAUDE_MODELS],
    codex: codexModels,
    ollama: ollamaModels,
    opencode: opencodeModels,
  };
}
