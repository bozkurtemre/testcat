// Durable model discovery check. Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/models.check.ts
import assert from "node:assert/strict";
import {
  buildOpencodeModelInfos,
  parseOpencodeModelsOutput,
} from "./models";

const parsed = parseOpencodeModelsOutput(`
opencode/mimo-v2.5-free
ollama/gemma4:e4b
{
  "id": "gemma4:e4b"
}
ollama/hf.co/unsloth/GLM-4.7-Flash-GGUF:Q4_K_M
openai/gpt-5.5
`);

assert.deepEqual(parsed, [
  "opencode/mimo-v2.5-free",
  "ollama/gemma4:e4b",
  "ollama/hf.co/unsloth/GLM-4.7-Flash-GGUF:Q4_K_M",
  "openai/gpt-5.5",
]);

const infos = buildOpencodeModelInfos(parsed, [
  "gemma4:e4b-mlx",
  "hf.co/unsloth/GLM-4.7-Flash-GGUF:Q4_K_M",
]);

const catalogMismatch = infos.find((model) => model.id === "ollama/gemma4:e4b");
assert.equal(catalogMismatch?.available, false);
assert.match(
  catalogMismatch?.availabilityReason ?? "",
  /does not currently expose/i,
);

const localOnly = infos.find((model) => model.id === "ollama/gemma4:e4b-mlx");
assert.equal(localOnly?.available, false);
assert.match(localOnly?.availabilityReason ?? "", /does not list/i);

const matchingOllama = infos.find(
  (model) =>
    model.id === "ollama/hf.co/unsloth/GLM-4.7-Flash-GGUF:Q4_K_M",
);
assert.notEqual(matchingOllama?.available, false);

const nonOllama = infos.find((model) => model.id === "opencode/mimo-v2.5-free");
assert.notEqual(nonOllama?.available, false);
assert.equal(nonOllama?.provider, "opencode");

console.log("models check: OK");
