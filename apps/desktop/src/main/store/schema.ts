import { randomUUID } from "node:crypto";
import type { LoginFlow, RunDevice } from "@testcat/shared";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = () => new Date();

export const agentProfiles = sqliteTable("agent_profiles", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  name: text("name").notNull(),
  cli: text("cli").notNull(),
  model: text("model").notNull(),
  reasoning: text("reasoning").notNull(),
  skills: text("skills", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  systemPrompt: text("system_prompt").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now),
});

export const testScenarios = sqliteTable("test_scenarios", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  name: text("name").notNull(),
  buildPath: text("build_path").notNull(),
  physicalBuildPath: text("physical_build_path"),
  devicePreference: text("device_preference").notNull().default("simulator"),
  profileId: text("profile_id").references(() => agentProfiles.id, {
    onDelete: "set null",
  }),
  prompt: text("prompt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now),
});

export const testRuns = sqliteTable("test_runs", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  scenarioId: text("scenario_id").references(() => testScenarios.id, {
    onDelete: "set null",
  }),
  profileId: text("profile_id"),
  name: text("name").notNull(),
  buildPath: text("build_path").notNull(),
  physicalBuildPath: text("physical_build_path"),
  devicePreference: text("device_preference").notNull().default("simulator"),
  scenario: text("scenario").notNull(),
  cli: text("cli").notNull(),
  model: text("model").notNull(),
  reasoning: text("reasoning").notNull(),
  profileName: text("profile_name").notNull().default(""),
  profileSkills: text("profile_skills", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  profileSystemPrompt: text("profile_system_prompt").notNull().default(""),
  devices: text("devices", { mode: "json" })
    .$type<RunDevice[]>()
    .notNull()
    .default([]),
  status: text("status").notNull().default("queued"),
  result: text("result"),
  successGuide: text("success_guide"),
  durationMs: integer("duration_ms"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now),
});

// Per-build exploration cache. One row per build identity; reused across all
// runs/scenarios of that build so the strong-model exploration is paid once.
export const appMaps = sqliteTable("app_maps", {
  buildKey: text("build_key").primaryKey(),
  appMap: text("app_map").notNull().default(""),
  loginFlow: text("login_flow", { mode: "json" }).$type<LoginFlow | null>(),
  expectedSlots: text("expected_slots", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  model: text("model").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now),
});

export const testRunEvents = sqliteTable("test_run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id")
    .notNull()
    .references(() => testRuns.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  at: integer("at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});
