import { execFile } from "node:child_process";
import type { OllamaModelSummary } from "@testcat/shared";

type JsonRecord = Record<string, unknown>;

interface OllamaApiModel {
  name?: unknown;
  model?: unknown;
  modified_at?: unknown;
  size?: unknown;
  digest?: unknown;
  remote_model?: unknown;
  remote_host?: unknown;
  details?: unknown;
  capabilities?: unknown;
}

const OLLAMA_TIMEOUT_MS = 60_000;

export function ollamaBaseUrl(): string {
  const raw = process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `http://${raw.replace(/\/+$/, "")}`;
}

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function normalizeApiModel(model: OllamaApiModel): OllamaModelSummary | null {
  const name = stringOrNull(model.name) ?? stringOrNull(model.model);
  if (!name) return null;

  const details =
    model.details && typeof model.details === "object"
      ? (model.details as JsonRecord)
      : {};

  return {
    name,
    model: stringOrNull(model.model) ?? name,
    modifiedAt: stringOrNull(model.modified_at),
    sizeBytes: numberOrNull(model.size),
    digest: stringOrNull(model.digest),
    details: {
      format: stringOrNull(details.format),
      family: stringOrNull(details.family),
      parameterSize: stringOrNull(details.parameter_size),
      quantizationLevel: stringOrNull(details.quantization_level),
      contextLength: numberOrNull(details.context_length),
    },
    capabilities: stringArray(model.capabilities),
    remote: Boolean(model.remote_model || model.remote_host),
  };
}

function parseHumanSize(value: string | undefined): number | null {
  if (!value || value === "-") return null;
  const match = value.trim().match(/^([\d.]+)\s*([KMGT]?B)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toUpperCase();
  const multiplier =
    unit === "TB"
      ? 1024 ** 4
      : unit === "GB"
        ? 1024 ** 3
        : unit === "MB"
          ? 1024 ** 2
          : unit === "KB"
            ? 1024
            : 1;
  return Math.round(amount * multiplier);
}

function parseOllamaList(stdout: string): OllamaModelSummary[] {
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): OllamaModelSummary | null => {
      const parts = line.split(/\s{2,}/);
      const [name, digest, size, modifiedAt] = parts;
      if (!name) return null;
      return {
        name,
        model: name,
        modifiedAt: modifiedAt ?? null,
        sizeBytes: parseHumanSize(size),
        digest: digest ?? null,
        details: {
          format: null,
          family: null,
          parameterSize: null,
          quantizationLevel: null,
          contextLength: null,
        },
        capabilities: [],
        remote: size === "-",
      } satisfies OllamaModelSummary;
    })
    .filter((model): model is OllamaModelSummary => Boolean(model));
}

function execOllama(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "ollama",
      args,
      { timeout: OLLAMA_TIMEOUT_MS },
      (error, stdout, stderr) => {
        const out = stdout.toString().trim();
        const err = stderr.toString().trim();
        if (error) {
          reject(new Error(err || out || error.message));
          return;
        }
        resolve(out);
      },
    );
  });
}

export async function listOllamaModels(): Promise<OllamaModelSummary[]> {
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`);
    if (!res.ok) throw new Error(`Ollama API returned ${res.status}`);
    const body = (await res.json()) as { models?: OllamaApiModel[] };
    return (body.models ?? [])
      .map(normalizeApiModel)
      .filter((model): model is OllamaModelSummary => Boolean(model));
  } catch {
    const stdout = await execOllama(["list"]);
    return parseOllamaList(stdout);
  }
}

export async function isOllamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
