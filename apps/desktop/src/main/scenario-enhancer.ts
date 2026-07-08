import { spawn } from "node:child_process";
import type {
  AgentProfile,
  ScenarioEnhanceResult,
  SystemPromptEnhanceResult,
} from "@testcat/shared";
import { ollamaBaseUrl } from "./ollama-codex";
import { getSettings } from "./settings-store";
import { store } from "./store/store";
import { createClaudeParser } from "./agent/parsers/claude";
import { createCodexParser } from "./agent/parsers/codex";
import { createOpencodeParser } from "./agent/parsers/opencode";

const ENHANCE_TIMEOUT_MS = 120_000;

const ENHANCER_SYSTEM = [
  "You rewrite Testcat iOS simulator test scenarios.",
  "Return only valid JSON with this exact shape: {\"scenario\":\"...\"}.",
  "Rewrite the scenario in clear, professional English.",
  "Preserve every concrete requirement, credential, account convention, payment detail, package id, device count, expected assertion, and blocker-handling rule.",
  "Do not invent app behavior, test data, credentials, or expected results.",
  "Make the result directly executable by an automated iOS simulator testing agent.",
].join("\n");

const SYSTEM_PROMPT_ENHANCER_SYSTEM = [
  "You rewrite Testcat agent profile system prompts.",
  "Return only valid JSON with this exact shape: {\"systemPrompt\":\"...\"}.",
  "Rewrite the prompt in clear, professional English as direct instructions to an automated iOS simulator testing agent.",
  "Preserve every concrete rule, credential, account convention, package id, payment detail, simulator/subagent instruction, autonomy rule, and blocker-handling rule.",
  "Do not invent app behavior, credentials, test data, tools, or expected results.",
  "Keep the result concise, imperative, and suitable for use as an agent system prompt.",
].join("\n");

function enhancerUserPrompt(profile: AgentProfile, scenario: string): string {
  return [
    "Agent profile context. Use this only to preserve domain-specific intent; do not copy irrelevant profile boilerplate into the scenario.",
    profile.systemPrompt.trim() || "(none)",
    "",
    "Original scenario:",
    scenario,
    "",
    "Enhanced English scenario JSON:",
  ].join("\n");
}

function systemPromptUserPrompt(systemPrompt: string): string {
  return [
    "Original agent profile system prompt:",
    systemPrompt,
    "",
    "Enhanced English system prompt JSON:",
  ].join("\n");
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function parseEnhancedScenarioResponse(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch {
    throw new Error("Enhancer response was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Enhancer response must be a JSON object.");
  }
  const scenario = (parsed as Record<string, unknown>).scenario;
  if (typeof scenario !== "string" || !scenario.trim()) {
    throw new Error("Enhancer response missing scenario.");
  }
  return scenario.trim();
}

export function parseEnhancedSystemPromptResponse(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch {
    throw new Error("Enhancer response was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Enhancer response must be a JSON object.");
  }
  const systemPrompt = (parsed as Record<string, unknown>).systemPrompt;
  if (typeof systemPrompt !== "string" || !systemPrompt.trim()) {
    throw new Error("Enhancer response missing systemPrompt.");
  }
  return systemPrompt.trim();
}

export async function enhanceScenario(
  scenario: string,
): Promise<ScenarioEnhanceResult> {
  if (!scenario.trim()) throw new Error("Scenario is empty.");
  const settings = await getSettings();
  if (!settings.defaultEnhanceProfileId) {
    throw new Error("No default enhance profile selected in Settings.");
  }
  const profile = await store.profilesGet(settings.defaultEnhanceProfileId);
  if (!profile) throw new Error("Default enhance profile was not found.");

  const output = await callEnhancer(
    profile,
    ENHANCER_SYSTEM,
    enhancerUserPrompt(profile, scenario.trim()),
  );
  return {
    scenario: parseEnhancedScenarioResponse(output),
    profileId: profile.id,
    profileName: profile.name,
  };
}

export async function enhanceSystemPrompt(
  systemPrompt: string,
): Promise<SystemPromptEnhanceResult> {
  if (!systemPrompt.trim()) throw new Error("System prompt is empty.");
  const settings = await getSettings();
  if (!settings.defaultEnhanceProfileId) {
    throw new Error("No default enhance profile selected in Settings.");
  }
  const profile = await store.profilesGet(settings.defaultEnhanceProfileId);
  if (!profile) throw new Error("Default enhance profile was not found.");

  const output = await callEnhancer(
    profile,
    SYSTEM_PROMPT_ENHANCER_SYSTEM,
    systemPromptUserPrompt(systemPrompt.trim()),
  );
  return {
    systemPrompt: parseEnhancedSystemPromptResponse(output),
    profileId: profile.id,
    profileName: profile.name,
  };
}

async function callEnhancer(
  profile: AgentProfile,
  instructions: string,
  userPrompt: string,
): Promise<string> {
  if (profile.cli === "ollama") {
    return callOllama(profile, instructions, userPrompt);
  }
  if (profile.cli === "claude") {
    return callClaude(profile, instructions, userPrompt);
  }
  if (profile.cli === "opencode") {
    return callOpencode(profile, instructions, userPrompt);
  }
  return callCodex(profile, instructions, userPrompt);
}

async function callOllama(
  profile: AgentProfile,
  instructions: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: profile.model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: userPrompt },
      ],
      options: { temperature: 0.1, num_predict: 2048 },
    }),
    signal: AbortSignal.timeout(ENHANCE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as Record<string, unknown>;
  const message = body.message;
  if (!message || typeof message !== "object") {
    throw new Error("Ollama response missing message.");
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Ollama response missing content.");
  }
  return content;
}

function callClaude(
  profile: AgentProfile,
  instructions: string,
  userPrompt: string,
): Promise<string> {
  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    profile.model,
    "--effort",
    profile.reasoning,
    "--permission-mode",
    "bypassPermissions",
    "--append-system-prompt",
    instructions,
  ];
  return runParsedCli("claude", args, userPrompt, "claude");
}

function callCodex(
  profile: AgentProfile,
  instructions: string,
  userPrompt: string,
): Promise<string> {
  const input = `${instructions}\n\n${userPrompt}`;
  const args = [
    "exec",
    "--json",
    "-m",
    profile.model,
    "-c",
    `model_reasoning_effort=${profile.reasoning}`,
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    "-C",
    process.cwd(),
  ];
  return runParsedCli("codex", args, input, "codex");
}

function callOpencode(
  profile: AgentProfile,
  instructions: string,
  userPrompt: string,
): Promise<string> {
  const input = `${instructions}\n\n${userPrompt}`;
  const args = [
    "run",
    "--format",
    "json",
    "--pure",
    "-m",
    profile.model,
    "--dir",
    process.cwd(),
  ];
  return runParsedCli("opencode", args, input, "opencode");
}

function runParsedCli(
  cmd: string,
  args: string[],
  input: string,
  parserKind: "claude" | "codex" | "opencode",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser =
      parserKind === "claude"
        ? createClaudeParser(() => {})
        : parserKind === "opencode"
          ? createOpencodeParser(() => {})
          : createCodexParser(() => {});
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      env: process.env,
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${cmd} timed out while enhancing prompt.`));
    }, ENHANCE_TIMEOUT_MS);
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => parser.push(chunk));
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      parser.flush();
      const result = parser.getResult();
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${cmd} exited with code ${code}`));
        return;
      }
      if (!result?.trim()) {
        reject(new Error(`${cmd} did not return an enhanced prompt.`));
        return;
      }
      resolve(result);
    });
    child.stdin?.write(input);
    child.stdin?.end();
  });
}
