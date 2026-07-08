import type { AgentCli, ReasoningEffort } from "./agent-profile";

export interface TestScenario {
  id: string;
  name: string;
  /** Path to the simulator-built .app bundle. */
  buildPath: string;
  /** Optional physical-device signed app/ipa path used when physical devices are preferred. */
  physicalBuildPath: string | null;
  devicePreference: DevicePreference;
  profileId: string;
  /** The directives the agent must test. */
  prompt: string;
  createdAt: string;
}

export type TestScenarioInput = Omit<TestScenario, "id" | "createdAt">;

export type DeviceKind = "simulator" | "physical";

export type DevicePreference = "simulator" | "preferPhysical";

export type TestStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "error"
  | "cancelled";

/** A simulator or physical device the agent used during a run. */
export interface RunDevice {
  udid: string;
  name: string;
  runtime: string;
  kind?: DeviceKind;
  provider?: "testcat-sim" | "testcat-device";
  state?: string;
  isAvailable?: boolean;
  availabilityReason?: string | null;
}

export interface TestRun {
  id: string;
  scenarioId: string | null;
  /** Original agent profile id. Kept even if the profile is later deleted. */
  profileId: string | null;
  name: string;
  buildPath: string;
  physicalBuildPath: string | null;
  devicePreference: DevicePreference;
  /**
   * Snapshots captured at run time so editing or deleting the profile/scenario
   * later never corrupts historical run detail.
   */
  scenario: string;
  cli: AgentCli;
  model: string;
  reasoning: ReasoningEffort;
  /** Agent profile snapshot captured at run time for exact re-runs. */
  profileName: string;
  profileSkills: string[];
  profileSystemPrompt: string;
  devices: RunDevice[];
  status: TestStatus;
  /** The agent's final verdict / summary. */
  result: string | null;
  /** Deterministic prompt guide generated from the normalized events of a passed run. */
  successGuide: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/** Payload to create a run row at start (snapshots the profile + scenario). */
export interface TestRunCreate {
  id: string;
  scenarioId?: string | null;
  profileId?: string | null;
  name: string;
  buildPath: string;
  physicalBuildPath?: string | null;
  devicePreference?: DevicePreference;
  scenario: string;
  cli: AgentCli;
  model: string;
  reasoning: ReasoningEffort;
  profileName: string;
  profileSkills: string[];
  profileSystemPrompt: string;
}

/** Partial update on finish: verdict, duration, and (optionally) booted devices. */
export interface TestRunPatch {
  status: TestStatus;
  result: string | null;
  durationMs?: number;
  devices?: RunDevice[];
  successGuide?: string | null;
}
