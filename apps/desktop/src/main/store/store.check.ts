// Durable local store check. Run:
// pnpm --filter @testcat/desktop exec tsx src/main/store/store.check.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "./store";
import { openStoreDatabase } from "./db";

const dir = mkdtempSync(join(tmpdir(), "testcat-store-check-"));
const database = openStoreDatabase(join(dir, "testcat.sqlite"));
const store = createStore(database);

async function main(): Promise<void> {
  const profile = await store.profilesCreate({
    name: "Codex smoke",
    cli: "codex",
    model: "gpt-5-codex",
    reasoning: "medium",
    skills: ["testcat-ios"],
    systemPrompt: "Run deterministic iOS tests.",
  });
  assert.equal((await store.profilesList()).length, 1);
  assert.equal((await store.profilesGet(profile.id))?.name, "Codex smoke");

  const updated = await store.profilesUpdate(profile.id, {
    ...profile,
    name: "Updated profile",
  });
  assert.equal(updated.name, "Updated profile");
  await store.profilesDelete("missing-profile");

  await assert.rejects(
    () =>
      store.profilesCreate({
        name: "Bad",
        cli: "bad" as never,
        model: "model",
        reasoning: "medium",
        skills: [],
        systemPrompt: "",
      }),
    /Unsupported agent cli/,
  );

  const run = await store.runsCreate({
    id: "11111111-1111-4111-8111-111111111111",
    profileId: profile.id,
    name: "Checkout",
    buildPath: "/tmp/App.app",
    physicalBuildPath: "/tmp/App.ipa",
    devicePreference: "preferPhysical",
    scenario: "Open app.",
    cli: "codex",
    model: "gpt-5-codex",
    reasoning: "medium",
    profileName: "Updated profile",
    profileSkills: ["testcat-ios"],
    profileSystemPrompt: "Run deterministic iOS tests.",
  });
  assert.equal(run.status, "running");
  assert.equal(run.devicePreference, "preferPhysical");
  assert.equal((await store.runsList())[0]?.id, run.id);
  assert.equal((await store.runsGet(run.id)).physicalBuildPath, "/tmp/App.ipa");

  await store.runsAddEvents(run.id, [
    { type: "text_delta", text: "hello" },
    { type: "tool_use", name: "shell", family: "exec", input: "echo ok" },
  ]);
  assert.deepEqual(
    (await store.runsEvents(run.id)).map((event) => event.type),
    ["text_delta", "tool_use"],
  );

  const patched = await store.runsPatch(run.id, {
    status: "passed",
    result: "Done",
    durationMs: 123,
    successGuide: "Use the same flow.",
  });
  assert.equal(patched.status, "passed");
  assert.equal(patched.result, "Done");
  assert.equal(patched.finishedAt !== null, true);

  const stale = await store.runsCreate({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Stale",
    buildPath: "/tmp/App.app",
    scenario: "Open app.",
    cli: "claude",
    model: "sonnet",
    reasoning: "medium",
    profileName: "Claude",
    profileSkills: [],
    profileSystemPrompt: "",
  });
  assert.equal(stale.status, "running");
  assert.deepEqual(await store.runsInterruptStale(), { interrupted: 1 });
  assert.equal((await store.runsGet(stale.id)).status, "error");

  await assert.rejects(
    () =>
      store.runsCreate({
        id: "33333333-3333-4333-8333-333333333333",
        name: "Bad preference",
        buildPath: "/tmp/App.app",
        devicePreference: "physical" as never,
        scenario: "Open app.",
        cli: "codex",
        model: "gpt-5-codex",
        reasoning: "medium",
        profileName: "Codex",
        profileSkills: [],
        profileSystemPrompt: "",
      }),
    /Unsupported device preference/,
  );
  await assert.rejects(
    () =>
      store.runsPatch(run.id, {
        status: "stuck" as never,
        result: null,
      }),
    /Unsupported run status/,
  );

  await store.runsDelete(run.id);
  assert.deepEqual(await store.runsEvents(run.id), []);
  await assert.rejects(() => store.runsGet(run.id), /Run not found/);

  // App-map cache: miss → null, put → read back (login flow JSON + slots roundtrip),
  // second put on the same build key upserts in place.
  assert.equal(await store.appMapGet("build-xyz"), null);
  const stored = await store.appMapPut({
    buildKey: "build-xyz",
    appMap: "Home has tabs A/B/C.",
    loginFlow: { steps: [{ command: "type", args: ["type", "--text", "{email}"] }] },
    expectedSlots: ["email"],
    model: "gpt-5.5",
  });
  assert.equal(stored.appMap, "Home has tabs A/B/C.");
  assert.deepEqual(stored.expectedSlots, ["email"]);
  const fetched = await store.appMapGet("build-xyz");
  assert.equal(fetched?.loginFlow?.steps[0]?.args[2], "{email}");
  assert.equal(fetched?.model, "gpt-5.5");
  const reput = await store.appMapPut({
    buildKey: "build-xyz",
    appMap: "Home rebuilt: tabs A/B.",
    loginFlow: null,
    expectedSlots: [],
    model: "gpt-5.5",
  });
  assert.equal(reput.appMap, "Home rebuilt: tabs A/B.");
  assert.equal(reput.loginFlow, null);
  assert.equal((await store.appMapGet("build-xyz"))?.appMap, "Home rebuilt: tabs A/B.");

  console.log("store check: OK");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    database.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });
