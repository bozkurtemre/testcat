import type {
  AgentEvent,
  AgentProfile,
  AgentProfileInput,
  AppMapInput,
  AppMapRecord,
  DevicePreference,
  TestRun,
  TestRunCreate,
  TestRunPatch,
  TestStatus,
} from "@testcat/shared";
import { AGENT_CLIS } from "@testcat/shared";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getStoreDatabase, type StoreDatabase } from "./db";
import { agentProfiles, appMaps, testRunEvents, testRuns } from "./schema";

type ProfileRow = typeof agentProfiles.$inferSelect;
type RunRow = typeof testRuns.$inferSelect;
type AppMapRow = typeof appMaps.$inferSelect;

const TERMINAL_STATUSES = ["passed", "failed", "error", "cancelled"] as const;
const ALL_STATUSES = ["queued", "running", ...TERMINAL_STATUSES] as const;
const DEVICE_PREFERENCES = ["simulator", "preferPhysical"] as const;

export interface TestcatStore {
  profilesList(): Promise<AgentProfile[]>;
  profilesGet(id: string): Promise<AgentProfile | null>;
  profilesCreate(input: AgentProfileInput): Promise<AgentProfile>;
  profilesUpdate(id: string, input: AgentProfileInput): Promise<AgentProfile>;
  profilesDelete(id: string): Promise<void>;
  runsList(): Promise<TestRun[]>;
  runsGet(id: string): Promise<TestRun>;
  runsDelete(id: string): Promise<void>;
  runsCreate(input: TestRunCreate): Promise<TestRun>;
  runsPatch(id: string, patch: TestRunPatch): Promise<TestRun>;
  runsAddEvents(
    id: string,
    events: AgentEvent[],
  ): Promise<{ inserted: number }>;
  runsEvents(id: string): Promise<AgentEvent[]>;
  runsInterruptStale(): Promise<{ interrupted: number }>;
  /** Cached per-build exploration artifact, or null if the build was never explored. */
  appMapGet(buildKey: string): Promise<AppMapRecord | null>;
  /** Insert or replace the cached exploration artifact for a build. */
  appMapPut(input: AppMapInput): Promise<AppMapRecord>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (!isNonEmptyString(value)) throw new Error(`${field} is required.`);
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of strings.`);
  }
}

function assertAgentCli(value: unknown): void {
  if (!AGENT_CLIS.includes(value as never)) {
    throw new Error(`Unsupported agent cli: ${String(value)}`);
  }
}

function assertDevicePreference(value: unknown): asserts value is DevicePreference {
  if (!DEVICE_PREFERENCES.includes(value as never)) {
    throw new Error(`Unsupported device preference: ${String(value)}`);
  }
}

function assertRunStatus(value: unknown): asserts value is TestStatus {
  if (!ALL_STATUSES.includes(value as never)) {
    throw new Error(`Unsupported run status: ${String(value)}`);
  }
}

function validateProfileInput(input: AgentProfileInput): void {
  assertNonEmptyString(input.name, "name");
  assertAgentCli(input.cli);
  assertNonEmptyString(input.model, "model");
  assertNonEmptyString(input.reasoning, "reasoning");
  assertStringArray(input.skills ?? [], "skills");
  if (typeof (input.systemPrompt ?? "") !== "string") {
    throw new Error("systemPrompt must be a string.");
  }
}

function validateRunCreate(input: TestRunCreate): void {
  assertNonEmptyString(input.id, "id");
  assertNonEmptyString(input.name, "name");
  assertNonEmptyString(input.buildPath, "buildPath");
  assertNonEmptyString(input.scenario, "scenario");
  assertAgentCli(input.cli);
  assertNonEmptyString(input.model, "model");
  assertNonEmptyString(input.reasoning, "reasoning");
  assertNonEmptyString(input.profileName, "profileName");
  assertStringArray(input.profileSkills, "profileSkills");
  if (typeof input.profileSystemPrompt !== "string") {
    throw new Error("profileSystemPrompt must be a string.");
  }
  if (input.devicePreference !== undefined) {
    assertDevicePreference(input.devicePreference);
  }
}

function validateRunPatch(patch: TestRunPatch): void {
  assertRunStatus(patch.status);
  if (patch.result !== null && typeof patch.result !== "string") {
    throw new Error("result must be a string or null.");
  }
  if (
    patch.durationMs !== undefined &&
    (!Number.isInteger(patch.durationMs) || patch.durationMs < 0)
  ) {
    throw new Error("durationMs must be a non-negative integer.");
  }
  if (patch.devices !== undefined && !Array.isArray(patch.devices)) {
    throw new Error("devices must be an array.");
  }
}

function toIso(value: Date | number | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return new Date(value).toISOString();
}

function toProfile(row: ProfileRow): AgentProfile {
  return {
    id: row.id,
    name: row.name,
    cli: row.cli as AgentProfile["cli"],
    model: row.model,
    reasoning: row.reasoning as AgentProfile["reasoning"],
    skills: row.skills,
    systemPrompt: row.systemPrompt,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function toRun(row: RunRow): TestRun {
  const devicePreference = row.devicePreference;
  assertDevicePreference(devicePreference);
  const status = row.status;
  assertRunStatus(status);
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    profileId: row.profileId,
    name: row.name,
    buildPath: row.buildPath,
    physicalBuildPath: row.physicalBuildPath,
    devicePreference,
    scenario: row.scenario,
    cli: row.cli as TestRun["cli"],
    model: row.model,
    reasoning: row.reasoning as TestRun["reasoning"],
    profileName: row.profileName,
    profileSkills: row.profileSkills,
    profileSystemPrompt: row.profileSystemPrompt,
    devices: row.devices,
    status,
    result: row.result,
    successGuide: row.successGuide,
    durationMs: row.durationMs,
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
  };
}

function toAppMap(row: AppMapRow): AppMapRecord {
  return {
    buildKey: row.buildKey,
    appMap: row.appMap,
    loginFlow: row.loginFlow ?? null,
    expectedSlots: row.expectedSlots,
    model: row.model,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
  };
}

export function createStore(database: StoreDatabase): TestcatStore {
  const { db } = database;
  return {
    async profilesList() {
      return (await db.select().from(agentProfiles).orderBy(agentProfiles.createdAt)).map(
        toProfile,
      );
    },

    async profilesGet(id) {
      const [row] = await db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, id));
      return row ? toProfile(row) : null;
    },

    async profilesCreate(input) {
      validateProfileInput(input);
      const [row] = await db
        .insert(agentProfiles)
        .values({
          name: input.name,
          cli: input.cli,
          model: input.model,
          reasoning: input.reasoning,
          skills: input.skills ?? [],
          systemPrompt: input.systemPrompt ?? "",
        })
        .returning();
      if (!row) throw new Error("Failed to create profile.");
      return toProfile(row);
    },

    async profilesUpdate(id, input) {
      validateProfileInput(input);
      const [row] = await db
        .update(agentProfiles)
        .set({
          name: input.name,
          cli: input.cli,
          model: input.model,
          reasoning: input.reasoning,
          skills: input.skills ?? [],
          systemPrompt: input.systemPrompt ?? "",
          updatedAt: new Date(),
        })
        .where(eq(agentProfiles.id, id))
        .returning();
      if (!row) throw new Error(`Profile not found: ${id}`);
      return toProfile(row);
    },

    async profilesDelete(id) {
      await db.delete(agentProfiles).where(eq(agentProfiles.id, id));
    },

    async runsList() {
      return (await db.select().from(testRuns).orderBy(desc(testRuns.createdAt))).map(
        toRun,
      );
    },

    async runsGet(id) {
      const [row] = await db.select().from(testRuns).where(eq(testRuns.id, id));
      if (!row) throw new Error(`Run not found: ${id}`);
      return toRun(row);
    },

    async runsDelete(id) {
      const [row] = await db
        .delete(testRuns)
        .where(eq(testRuns.id, id))
        .returning({ id: testRuns.id });
      if (!row) throw new Error(`Run not found: ${id}`);
    },

    async runsCreate(input) {
      validateRunCreate(input);
      const [row] = await db
        .insert(testRuns)
        .values({
          id: input.id,
          scenarioId: input.scenarioId ?? null,
          profileId: input.profileId ?? null,
          name: input.name,
          buildPath: input.buildPath,
          physicalBuildPath: input.physicalBuildPath ?? null,
          devicePreference: input.devicePreference ?? "simulator",
          scenario: input.scenario,
          cli: input.cli,
          model: input.model,
          reasoning: input.reasoning,
          profileName: input.profileName,
          profileSkills: input.profileSkills,
          profileSystemPrompt: input.profileSystemPrompt,
          status: "running",
          startedAt: new Date(),
        })
        .returning();
      if (!row) throw new Error("Failed to create run.");
      return toRun(row);
    },

    async runsPatch(id, patch) {
      validateRunPatch(patch);
      const terminal = TERMINAL_STATUSES.includes(patch.status as never);
      const [row] = await db
        .update(testRuns)
        .set({
          status: patch.status,
          result: patch.result,
          ...(patch.durationMs !== undefined
            ? { durationMs: patch.durationMs }
            : {}),
          ...(patch.devices !== undefined ? { devices: patch.devices } : {}),
          ...(patch.successGuide !== undefined
            ? { successGuide: patch.successGuide }
            : {}),
          ...(terminal ? { finishedAt: new Date() } : {}),
        })
        .where(eq(testRuns.id, id))
        .returning();
      if (!row) throw new Error(`Run not found: ${id}`);
      return toRun(row);
    },

    async runsAddEvents(id, events) {
      if (events.length === 0) return { inserted: 0 };
      const rows = events.map((event, seq) => ({
        runId: id,
        seq,
        type: event.type,
        payload: event,
      }));
      for (let i = 0; i < rows.length; i += 1000) {
        await db.insert(testRunEvents).values(rows.slice(i, i + 1000));
      }
      return { inserted: rows.length };
    },

    async runsEvents(id) {
      const rows = await db
        .select({ payload: testRunEvents.payload })
        .from(testRunEvents)
        .where(eq(testRunEvents.runId, id))
        .orderBy(asc(testRunEvents.seq));
      return rows.map((row) => row.payload as AgentEvent);
    },

    async runsInterruptStale() {
      const rows = await db
        .update(testRuns)
        .set({
          status: "error",
          result: "Interrupted - the app was closed during this run.",
          finishedAt: new Date(),
        })
        .where(inArray(testRuns.status, ["running", "queued"]))
        .returning({ id: testRuns.id });
      return { interrupted: rows.length };
    },

    async appMapGet(buildKey) {
      const [row] = await db
        .select()
        .from(appMaps)
        .where(eq(appMaps.buildKey, buildKey));
      return row ? toAppMap(row) : null;
    },

    async appMapPut(input) {
      assertNonEmptyString(input.buildKey, "buildKey");
      const set = {
        appMap: input.appMap ?? "",
        loginFlow: input.loginFlow ?? null,
        expectedSlots: input.expectedSlots ?? [],
        model: input.model ?? "",
        createdAt: new Date(),
      };
      const [row] = await db
        .insert(appMaps)
        .values({ buildKey: input.buildKey, ...set })
        .onConflictDoUpdate({ target: appMaps.buildKey, set })
        .returning();
      if (!row) throw new Error("Failed to upsert app map.");
      return toAppMap(row);
    },
  };
}

let defaultStore: TestcatStore | null = null;

function getDefaultStore(): TestcatStore {
  defaultStore ??= createStore(getStoreDatabase());
  return defaultStore;
}

export const store: TestcatStore = {
  profilesList: (...args) => getDefaultStore().profilesList(...args),
  profilesGet: (...args) => getDefaultStore().profilesGet(...args),
  profilesCreate: (...args) => getDefaultStore().profilesCreate(...args),
  profilesUpdate: (...args) => getDefaultStore().profilesUpdate(...args),
  profilesDelete: (...args) => getDefaultStore().profilesDelete(...args),
  runsList: (...args) => getDefaultStore().runsList(...args),
  runsGet: (...args) => getDefaultStore().runsGet(...args),
  runsDelete: (...args) => getDefaultStore().runsDelete(...args),
  runsCreate: (...args) => getDefaultStore().runsCreate(...args),
  runsPatch: (...args) => getDefaultStore().runsPatch(...args),
  runsAddEvents: (...args) => getDefaultStore().runsAddEvents(...args),
  runsEvents: (...args) => getDefaultStore().runsEvents(...args),
  runsInterruptStale: (...args) =>
    getDefaultStore().runsInterruptStale(...args),
  appMapGet: (...args) => getDefaultStore().appMapGet(...args),
  appMapPut: (...args) => getDefaultStore().appMapPut(...args),
};
