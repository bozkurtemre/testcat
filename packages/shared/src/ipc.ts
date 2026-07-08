import type { AgentEvent } from "./agent-event";
import type {
  AgentCli,
  AgentProfile,
  AgentProfileInput,
  ModelInfo,
} from "./agent-profile";
import type { LoginFlow } from "./app-map";
import type { DeviceKind, TestRun, TestStatus } from "./test";

/** Canonical IPC channel names. Renderer and main both import these. */
export const IpcChannel = {
  RunStart: "run:start",
  RunCancel: "run:cancel",
  RunEvent: "run:event",
  RunDone: "run:done",
  NetworkEvent: "network:event",
  NetworkEvents: "network:events",
  DevicesList: "devices:list",
  DevicesServeStatus: "devices:serve-status",
  DevicesWatch: "devices:watch",
  DevicesUnwatch: "devices:unwatch",
  DeviceFrame: "devices:frame",
  SimulatorsKillAll: "simulators:kill-all",
  PhysicalDevicesPrepare: "physical-devices:prepare",
  DialogPickBuild: "dialog:pick-build",
  AppInspect: "app:inspect",
  ProfilesList: "profiles:list",
  ProfilesGet: "profiles:get",
  ProfilesCreate: "profiles:create",
  ProfilesUpdate: "profiles:update",
  ProfilesDelete: "profiles:delete",
  ModelsList: "models:list",
  OllamaModelsList: "ollama:models-list",
  RunsList: "runs:list",
  RunsGet: "runs:get",
  RunsEvents: "runs:events",
  RunMediaCapture: "run-media:capture",
  RunMediaList: "run-media:list",
  RunMediaDelete: "run-media:delete",
  RunsDelete: "runs:delete",
  RunsKillRunning: "runs:kill-running",
  SettingsGet: "settings:get",
  SettingsUpdate: "settings:update",
  ScenarioEnhance: "scenario:enhance",
  SystemPromptEnhance: "system-prompt:enhance",
  Setup: "setup:status",
  SetupInstall: "setup:install",
  CliVersions: "cli:versions",
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface RunRequest {
  name: string;
  buildPath: string;
  physicalBuildPath?: string | null;
  /**
   * Main-process resolved bundle id used when no physical build is provided:
   * the app is already installed on the device (e.g. a TestFlight build), so
   * the agent skips `install` and launches by bundle id.
   */
  physicalBundleId?: string;
  preferPhysicalDevices?: boolean;
  /** Current profile id from the profile picker. */
  profileId?: string;
  /** Snapshot used for re-running history even if the original profile changed. */
  profileSnapshot?: AgentProfileInput;
  /**
   * Per-run login credentials, keyed by the slot names the build's recorded
   * login flow references (e.g. `{ email, otp }`). The flow is stable per build;
   * the account varies per run, so values live here, never in the cached flow.
   */
  credentials?: Record<string, string>;
  /**
   * Main-process resolved credential template (from Settings). The direct
   * runner expands `{testId}`/`{simIndex}` per device to build `credentials`
   * when none were provided explicitly.
   */
  credentialTemplate?: Record<string, string>;
  /**
   * How many simulators to reserve for this run (1-4, default 1) — for
   * multi-user scenarios (e.g. User A on sim 1, User B on sim 2). Applies to
   * child-process agents (claude/codex/opencode); the Ollama direct runner
   * always drives a single simulator.
   */
  simulatorCount?: number;
  /** Passed source run whose generated success guide should be attached to this re-run. */
  lastSuccessRunId?: string;
  /** Main-process resolved guide. Renderer callers should set lastSuccessRunId instead. */
  lastSuccessGuide?: string;
  /** Main-process assigned simulators. Renderer callers should not set this. */
  assignedSimulators?: Device[];
  /** Main-process simulator warm-up result. Renderer callers should not set this. */
  warmup?: RunWarmup;
  /** Main-process resolved per-build app map text, injected as a navigation hint. */
  appMap?: string;
  /** Main-process resolved login replay template for this build (filled with `credentials`). */
  loginFlow?: LoginFlow;
  /** Start a lightweight per-run HTTP proxy and inject simulator app proxy env. */
  captureNetwork?: boolean;
  /** Main-process resolved proxy URL. Renderer callers should set captureNetwork instead. */
  networkProxyUrl?: string;
  scenario: string;
}

export interface RunStartResult {
  runId: string;
  /**
   * Simulators already booted before this run's agent process was spawned.
   * The live grid hides these unless the current run later produces frames
   * from one of them.
   */
  deviceBaselineUdids?: string[];
}

/** main -> renderer on RunEvent */
export interface RunEventMessage {
  runId: string;
  event: AgentEvent;
}

/** main -> renderer on RunDone */
export interface RunDoneMessage {
  runId: string;
  status: TestStatus;
  result: string | null;
  durationMs: number;
  /** ISO timestamp for when the run reached its terminal state. */
  timestamp?: string;
}

export type NetworkActivityPhase = "started" | "completed" | "failed";
export type NetworkActivityKind = "http" | "tunnel" | "websocket";

export interface NetworkActivity {
  id: string;
  runId: string;
  phase: NetworkActivityPhase;
  kind: NetworkActivityKind;
  method: string;
  url: string;
  host: string;
  path: string;
  statusCode: number | null;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  requestBytes: number;
  responseBytes: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBodyPreview?: string;
  responseBodyPreview?: string;
  error?: string;
}

/** main -> renderer on NetworkEvent */
export interface NetworkEventMessage {
  runId: string;
  event: NetworkActivity;
}

export interface NetworkRoutingInfo {
  mode: "simulator-env";
  status: "active" | "fallback";
  reason?: string;
}

export interface NetworkEventsSnapshot {
  runId: string;
  enabled: boolean;
  proxyUrl: string | null;
  routing?: NetworkRoutingInfo;
  events: NetworkActivity[];
}

/** A simulator discovered via `baguette list --json`. */
export interface Device {
  udid: string;
  id?: string;
  name: string;
  state: string;
  runtime: string;
  isBooted: boolean;
  kind?: DeviceKind;
  provider?: "testcat-sim" | "testcat-device";
  isAvailable?: boolean;
  availabilityReason?: string | null;
  model?: string | null;
  usage?: DeviceUsage | null;
}

export interface DeviceUsage {
  inUse: boolean;
  runId: string;
  runName: string;
  profileName: string;
  startedAt: string;
}

export interface RunWarmup {
  ok: boolean;
  device: Device;
  summary: string;
  layout?: string;
  ui?: string;
  error?: string;
}

export interface ServeStatus {
  url: string;
  running: boolean;
}

export interface AppBundleInfo {
  path: string;
  exists: boolean;
  name: string | null;
  displayName: string | null;
  bundleIdentifier: string | null;
  version: string | null;
  build: string | null;
  executable: string | null;
  sizeBytes: number | null;
  error?: string;
}

export interface SimulatorKillResult {
  requested: number;
  killed: Device[];
  failed: Array<{ device: Device; error: string }>;
}

export interface PhysicalDevicePrepareResult {
  ok: boolean;
  output: string;
}

export interface KillRunningTestsResult {
  requested: number;
  cancelled: string[];
  failed: Array<{ runId: string; error: string }>;
}

export interface AppSettings {
  /** Agent profile used by New Test's scenario rewrite/enhance action. */
  defaultEnhanceProfileId: string | null;
  /**
   * Strong agent profile (e.g. a Codex or Claude profile) that explores a build
   * once before weak-model (Ollama) runs, producing the cached app map +
   * login flow. Null → fall back to auto-picking a strong profile, or skip if none.
   */
  explorationProfileId: string | null;
  /**
   * Per-slot credential templates used to fill the recorded login flow at
   * replay time, e.g. `{"email":"{testId}-sim-{simIndex}@corp.com","otp":"111111"}`.
   * `{testId}` → run id's first 8 chars, `{simIndex}` → 1-based device index,
   * so each run logs in with a fresh account while the flow stays stable.
   */
  credentialTemplate: Record<string, string> | null;
  /** Apple team id used to sign the vendored physical-device XCTest runner. */
  physicalDeviceTeamId: string | null;
  physicalDeviceBundleId: string | null;
}

export type AppSettingsPatch = Partial<AppSettings>;

export interface ScenarioEnhanceInput {
  scenario: string;
}

export interface ScenarioEnhanceResult {
  scenario: string;
  profileId: string;
  profileName: string;
}

export interface SystemPromptEnhanceInput {
  systemPrompt: string;
}

export interface SystemPromptEnhanceResult {
  systemPrompt: string;
  profileId: string;
  profileName: string;
}

export interface RunMediaAsset {
  id: string;
  runId: string;
  type: "screenshot";
  filename: string;
  path: string;
  dataUrl: string;
  createdAt: string;
  sizeBytes: number;
  device: {
    udid: string;
    name: string | null;
    runtime: string | null;
    kind?: DeviceKind;
  };
}

export interface RunMediaCaptureInput {
  runId: string;
  udid: string;
  deviceName?: string;
  runtime?: string;
  kind?: DeviceKind;
}

export interface RunMediaDeleteInput {
  runId: string;
  mediaId: string;
}

export interface OllamaModelSummary {
  name: string;
  model: string;
  modifiedAt: string | null;
  sizeBytes: number | null;
  digest: string | null;
  details: {
    format: string | null;
    family: string | null;
    parameterSize: string | null;
    quantizationLevel: string | null;
    contextLength: number | null;
  };
  capabilities: string[];
  remote: boolean;
}

/** First-launch / Help setup checklist state (detected in main). */
export interface SetupStatus {
  /** testcat-sim resolvable (repo build or on PATH). */
  testcatSim: boolean;
  /** testcat-device wrapper/runtime resolvable. */
  testcatDevice: boolean;
  /** `claude` CLI on PATH. */
  claude: boolean;
  /** `codex` CLI on PATH. */
  codex: boolean;
  /** `opencode` CLI on PATH. */
  opencode: boolean;
  /** Ollama daemon reachable through the local HTTP API. */
  ollama: boolean;
  /** testcat-ios skill copied into a skills dir. */
  skill: boolean;
  /** testcat-agent QA identity copied into an agents dir (claude/codex). */
  testcatAgent: boolean;
  /** Local SQLite database opened and migrated by Electron main. */
  database: boolean;
  profiles: number;
  runs: number;
  physicalDevices: number;
}

/** One-click install targets behind the setup checklist buttons. */
export type SetupInstallTarget =
  | "claude"
  | "codex"
  | "opencode"
  | "ollama"
  | "agent-assets";

export interface SetupInstallResult {
  ok: boolean;
  message: string;
}

/** main -> renderer on DeviceFrame: one JPEG frame from a booted simulator. */
export interface DeviceFrameMessage {
  udid: string;
  name: string;
  kind?: DeviceKind;
  /** data:image/jpeg;base64,… */
  dataUrl: string;
}

/** The typed surface exposed on `window.testcat` by the preload bridge. */
export interface TestcatApi {
  runStart(req: RunRequest): Promise<RunStartResult>;
  runCancel(runId: string): Promise<void>;
  pickBuild(): Promise<string | null>;
  appInspect(path: string): Promise<AppBundleInfo>;
  onRunEvent(cb: (msg: RunEventMessage) => void): () => void;
  onRunDone(cb: (msg: RunDoneMessage) => void): () => void;
  onNetworkEvent(cb: (msg: NetworkEventMessage) => void): () => void;
  networkEvents(runId: string): Promise<NetworkEventsSnapshot>;
  devicesList(): Promise<Device[]>;
  devicesServeStatus(): Promise<ServeStatus>;
  devicesWatch(): Promise<void>;
  devicesUnwatch(): Promise<void>;
  onDeviceFrame(cb: (msg: DeviceFrameMessage) => void): () => void;
  simulatorsKillAll(): Promise<SimulatorKillResult>;
  physicalDevicesPrepare(udid: string): Promise<PhysicalDevicePrepareResult>;
  profilesList(): Promise<AgentProfile[]>;
  profilesGet(id: string): Promise<AgentProfile | null>;
  profilesCreate(input: AgentProfileInput): Promise<AgentProfile>;
  profilesUpdate(id: string, input: AgentProfileInput): Promise<AgentProfile>;
  profilesDelete(id: string): Promise<void>;
  /** Real, current models per CLI. */
  modelsList(): Promise<Record<AgentCli, ModelInfo[]>>;
  /** Ollama models currently available through the local Ollama daemon. */
  ollamaModelsList(): Promise<OllamaModelSummary[]>;
  runsList(): Promise<TestRun[]>;
  runsGet(id: string): Promise<TestRun>;
  runsEvents(id: string): Promise<AgentEvent[]>;
  runMediaCapture(input: RunMediaCaptureInput): Promise<RunMediaAsset>;
  runMediaList(runId: string): Promise<RunMediaAsset[]>;
  runMediaDelete(input: RunMediaDeleteInput): Promise<void>;
  runsDelete(id: string): Promise<void>;
  runsKillRunning(): Promise<KillRunningTestsResult>;
  settingsGet(): Promise<AppSettings>;
  settingsUpdate(patch: AppSettingsPatch): Promise<AppSettings>;
  scenarioEnhance(input: ScenarioEnhanceInput): Promise<ScenarioEnhanceResult>;
  systemPromptEnhance(
    input: SystemPromptEnhanceInput,
  ): Promise<SystemPromptEnhanceResult>;
  setupStatus(): Promise<SetupStatus>;
  /** Run the background install for one setup-checklist item. */
  setupInstall(target: SetupInstallTarget): Promise<SetupInstallResult>;
  /** `--version` of each CLI; direct local providers report daemon reachability. */
  cliVersions(): Promise<Record<AgentCli, string | null>>;
}
