import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  type AgentEvent,
  type Device,
  IpcChannel,
  type KillRunningTestsResult,
  type LoginFlow,
  type RunRequest,
  type RunStartResult,
  type TestStatus,
} from "@testcat/shared";
import type { WebContents } from "electron";
import { inspectAppBundle } from "../app-inspect";
import { envWithDeviceBinsOnPath } from "../devices/device-binary";
import {
  clearDeviceUsage,
  deviceUsageForUdid,
  deviceUsageSnapshot,
  extractUdidsFromUnknown,
  releaseDeviceUsageForRun,
  reserveDeviceUsage,
  selectSimulatorsForRun,
} from "../devices/device-usage";
import {
  physicalDeviceEnv,
  preparePhysicalDevice,
} from "../devices/physical-helper";
import { streamManager } from "../devices/stream-manager";
import { networkInspector } from "../network-inspector";
import { getSettings } from "../settings-store";
import { store } from "../store/store";
import { listModels } from "./models";
import { createClaudeParser } from "./parsers/claude";
import { createCodexParser } from "./parsers/codex";
import { createOpencodeParser } from "./parsers/opencode";
import { startOllamaDirectRun } from "./ollama-direct";
import { buildKeyForApp } from "./build-key";
import { resolveExplorerProfile, runExploration } from "./explore";
import { determineRunVerdict } from "./run-verdict";
import { buildSpawn, isTestcatIosSkill } from "./spawn";
import { buildLastSuccessRunGuide } from "./success-guide";
import { warmUpSimulatorRun } from "./warmup";

interface ActiveRun {
  cancel(signal?: NodeJS.Signals): void;
}

const active = new Map<string, ActiveRun>();
const cancelled = new Set<string>();
const OPENCODE_MAX_CONTINUATIONS = 6;

function usesManagedDevice(profile: NonNullable<RunRequest["profileSnapshot"]>): boolean {
  return profile.cli === "ollama" || profile.skills.some(isTestcatIosSkill);
}

function usesChildProcessWarmup(
  profile: NonNullable<RunRequest["profileSnapshot"]>,
  req: RunRequest,
): boolean {
  if (profile.cli === "ollama") return false;
  if (req.preferPhysicalDevices) return false;
  return profile.skills.some(isTestcatIosSkill);
}

async function assertRunnableProfileModel(
  profile: NonNullable<RunRequest["profileSnapshot"]>,
): Promise<void> {
  if (profile.cli !== "opencode") return;
  const models = (await listModels()).opencode;
  const match = models.find((model) => model.id === profile.model);
  if (!match) {
    throw new Error(
      `opencode model ${profile.model} is not listed by \`opencode models\`.`,
    );
  }
  if (match.available === false) {
    throw new Error(
      match.availabilityReason ??
        `opencode model ${profile.model} is not currently runnable.`,
    );
  }
}

function createParser(
  cli: NonNullable<RunRequest["profileSnapshot"]>["cli"],
  emit: (event: AgentEvent) => void,
) {
  if (cli === "claude") return createClaudeParser(emit);
  if (cli === "opencode") return createOpencodeParser(emit);
  return createCodexParser(emit);
}

function shouldContinueOpencodeRun(
  cli: NonNullable<RunRequest["profileSnapshot"]>["cli"],
  requiresTestcatIosExecution: boolean,
  exitCode: number | null,
  result: string | null,
  sessionId: string | null | undefined,
): boolean {
  if (cli !== "opencode") return false;
  if (!requiresTestcatIosExecution) return false;
  if (exitCode !== 0) return false;
  if (!sessionId) return false;
  return /completion marker|stopped without producing final text|shell tool calls/i.test(
    result ?? "",
  );
}

function opencodeContinuationPrompt(attempt: number): string {
  return [
    `Continuation attempt ${attempt}: the previous opencode process stopped before the required Testcat completion marker.`,
    "Continue the same test run now. Do not write a plan, summary, markdown, or narrative before acting.",
    "Your first visible event in this continuation must be a bash/shell tool call.",
    "If the last action only listed devices, choose a device and continue the lifecycle sequence.",
    "If the last action interacted with the app, verify with `testcat-sim describe-ui --udid <UDID>` or `testcat-sim screenshot --udid <UDID> --output /tmp/testcat-proof.jpg`.",
    "Do not stop until a `testcat-sim complete ...` or `testcat-device complete ...` command has succeeded.",
    "If you cannot continue, call `complete --status failed --summary \"<specific blocker>\"` instead of exiting silently.",
  ].join("\n");
}

// Look up the cached per-build exploration artifact (produced once per build).
// Keyed by build identity so a rebuild of the same path misses and re-explores.
async function resolveAppMap(
  req: RunRequest,
): Promise<{ appMap: string; loginFlow: LoginFlow | null } | undefined> {
  if (req.appMap || !req.buildPath) return undefined;
  try {
    const record = await store.appMapGet(buildKeyForApp(req.buildPath));
    if (!record) return undefined;
    return { appMap: record.appMap, loginFlow: record.loginFlow };
  } catch (error) {
    console.error("[run] app map unavailable", error);
    return undefined;
  }
}

async function resolveLastSuccessGuide(req: RunRequest): Promise<string | undefined> {
  if (!req.lastSuccessRunId) return undefined;
  try {
    const sourceRun = await store.runsGet(req.lastSuccessRunId);
    if (sourceRun.status !== "passed") return undefined;
    if (sourceRun.successGuide?.trim()) return sourceRun.successGuide;
    const sourceEvents = await store.runsEvents(sourceRun.id);
    return buildLastSuccessRunGuide({ run: sourceRun, events: sourceEvents });
  } catch (error) {
    console.error("[run] last success guide unavailable", error);
    return undefined;
  }
}

// Merge consecutive text/thinking deltas so we persist messages, not keystrokes
// (PRD: coalesce text_delta before writing test_run_events). Replay rebuilds the
// same chat blocks from the merged stream.
function coalesce(events: AgentEvent[]): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (
      (e.type === "text_delta" || e.type === "thinking_delta") &&
      last?.type === e.type
    ) {
      out[out.length - 1] = { type: e.type, text: last.text + e.text };
    } else {
      out.push(e);
    }
  }
  return out;
}

// Persistence is best-effort: local database issues must not break the live
// run stream/grid while the agent is still active.
async function persistFinish(
  runId: string,
  status: TestStatus,
  result: string | null,
  durationMs: number,
  events: AgentEvent[],
  req: RunRequest,
  profile: NonNullable<RunRequest["profileSnapshot"]>,
): Promise<void> {
  try {
    const persistedEvents = coalesce(events);
    const successGuide =
      status === "passed"
        ? buildLastSuccessRunGuide({
            run: {
              id: runId,
              name: req.name,
              buildPath: req.buildPath,
              physicalBuildPath: req.physicalBuildPath ?? null,
              devicePreference: req.preferPhysicalDevices
                ? "preferPhysical"
                : "simulator",
              scenario: req.scenario,
              cli: profile.cli,
              model: profile.model,
              profileName: profile.name,
              devices: [],
              result,
              durationMs,
              finishedAt: new Date().toISOString(),
            },
            events: persistedEvents,
          })
        : undefined;
    await store.runsPatch(runId, {
      status,
      result,
      durationMs,
      ...(successGuide ? { successGuide } : {}),
    });
    await store.runsAddEvents(runId, persistedEvents);
  } catch (e) {
    console.error("[run] persist finish failed", e);
  }
}

export async function startRun(
  req: RunRequest,
  wc: WebContents,
): Promise<RunStartResult> {
  const storedProfile =
    req.profileSnapshot ??
    (req.profileId ? await store.profilesGet(req.profileId) : null);
  if (!storedProfile) throw new Error("Agent profile not found");
  // testcat-ios is the default control skill of every run — profiles don't
  // need to list it. Injected at run time only; stored profiles stay as-is.
  const profile = storedProfile.skills.some(isTestcatIosSkill)
    ? storedProfile
    : { ...storedProfile, skills: ["testcat-ios", ...storedProfile.skills] };
  await assertRunnableProfileModel(profile);
  const lastSuccessGuide = await resolveLastSuccessGuide(req);
  let cachedMap = await resolveAppMap(req);

  const runId = randomUUID();
  const settings = await getSettings();
  if (req.preferPhysicalDevices && !settings.physicalDeviceTeamId?.trim()) {
    throw new Error(
      "Physical device runs require an Apple team id. Set Settings > Physical Device Helper > Apple team id, then retry.",
    );
  }
  const devicePreference = req.preferPhysicalDevices
    ? "preferPhysical"
    : "simulator";
  const requiresManagedDevice = usesManagedDevice(profile);
  const startedAt = Date.now();
  const usageClaim = {
    runId,
    runName: req.name,
    profileName: profile.name,
    startedAt: new Date(startedAt).toISOString(),
  };
  let assignedSimulators: Device[] = [];
  let simulatorShortfall: string | null = null;
  let deviceBaselineUdids: string[] | undefined;
  try {
    const devices = await streamManager.list();
    deviceBaselineUdids = devices
      .filter((device) => device.isBooted)
      .map((device) => device.udid);
    if (requiresManagedDevice) {
      // Multi-user scenarios can reserve up to 4 sims; the direct runner only
      // drives one device loop, so it always stays at 1.
      const requestedSimulators =
        profile.cli === "ollama"
          ? 1
          : Math.min(4, Math.max(1, Math.round(req.simulatorCount ?? 1)));
      const selected = selectSimulatorsForRun(devices, requestedSimulators);
      if (!selected.length && devicePreference === "simulator") {
        throw new Error(
          "No free simulator is available. Wait for the active run to finish or boot/create another simulator.",
        );
      }
      for (const sim of selected) reserveDeviceUsage(sim.udid, usageClaim);
      assignedSimulators = selected.map((sim) => ({
        ...sim,
        usage: { ...usageClaim, inUse: true },
      }));
      if (selected.length && selected.length < requestedSimulators) {
        simulatorShortfall = `Requested ${requestedSimulators} simulators but only ${selected.length} free simulator(s) exist — continuing with ${selected.length}. Create more simulators in Xcode for full parallel coverage.`;
      }
    }
  } catch (e) {
    if (requiresManagedDevice && devicePreference === "simulator") throw e;
    console.error("[run] device baseline failed", e);
  }
  const buffer: AgentEvent[] = [];
  const emit = (event: AgentEvent) => {
    const stamped = event.timestamp
      ? event
      : ({ ...event, timestamp: new Date().toISOString() } as AgentEvent);
    if (stamped.type === "tool_use") {
      for (const udid of extractUdidsFromUnknown(stamped.input)) {
        const usage = deviceUsageForUdid(udid);
        if (!usage || usage.runId === runId) reserveDeviceUsage(udid, usageClaim);
      }
    }
    buffer.push(stamped);
    if (!wc.isDestroyed()) wc.send(IpcChannel.RunEvent, { runId, event: stamped });
  };
  emit({ type: "status", phase: "starting" });

  let networkEnv: Record<string, string> = {};
  let networkProxyUrl: string | undefined;
  if (req.captureNetwork) {
    try {
      const network = await networkInspector.start(runId, wc);
      networkEnv = networkInspector.envForProxy(network.proxyUrl);
      networkProxyUrl = network.proxyUrl;
      emit({
        type: "text_delta",
        text: `Network capture proxy started at ${network.proxyUrl}; Testcat will inject it into simulator app launches only.\n`,
      });
    } catch (error) {
      console.error("[run] network inspector unavailable", error);
    }
  }

  // Create the row up-front so the finish PATCH/events always have a target.
  try {
    await store.runsCreate({
      id: runId,
      profileId: req.profileId ?? null,
      name: req.name,
      buildPath: req.buildPath,
      physicalBuildPath: req.physicalBuildPath ?? null,
      devicePreference,
      scenario: req.scenario,
      cli: profile.cli,
      model: profile.model,
      reasoning: profile.reasoning,
      profileName: profile.name,
      profileSkills: profile.skills,
      profileSystemPrompt: profile.systemPrompt,
    });
  } catch (e) {
    console.error("[run] persist start failed", e);
  }

  const finalize = async (status: TestStatus, result: string | null) => {
    const durationMs = Date.now() - startedAt;
    await networkInspector.stop(runId);
    if (!wc.isDestroyed()) {
      wc.send(IpcChannel.RunDone, { runId, status, result, durationMs });
    }
    void persistFinish(runId, status, result, durationMs, buffer, req, profile);
    releaseDeviceUsageForRun(runId);
    if (req.preferPhysicalDevices) {
      // The device automation session (xcodebuild/XCUITest + agent-device
      // daemon) outlives the agent process and keeps "Automation Running" on
      // the phone. ponytail: one physical run at a time → pattern kill is safe.
      execFile("pkill", ["-9", "-f", "xcodebuild test-without-building"], () => {});
      execFile("pkill", ["-9", "-f", "agent-device/dist/src/internal/daemon"], () => {});
    }
  };

  // Run exploration + warm-up + the agent AFTER returning runId, so the New Test
  // dialog hands off to the run view immediately instead of blocking on
  // "Starting…" for the whole (multi-minute) exploration. Events stream live.
  void (async () => {
  if (simulatorShortfall) emit({ type: "text_delta", text: `${simulatorShortfall}\n` });

  // Physical preference: build/sign/install the XCTest runner up front so the
  // agent never trips over a missing or expired (free-team, ~7 days)
  // provisioning profile mid-run. Cached builds make this a few seconds.
  if (req.preferPhysicalDevices) {
    const physical = (await streamManager.list().catch(() => [])).filter(
      (device) => device.kind === "physical" && device.isBooted,
    );
    if (physical[0]) {
      emit({ type: "status", phase: "acting" });
      emit({
        type: "text_delta",
        text: `Preparing the physical-device runner on ${physical[0].name}…\n`,
      });
      const prep = await preparePhysicalDevice(physical[0].udid);
      emit({
        type: "text_delta",
        text: prep.ok
          ? "Physical-device runner ready.\n\n"
          : `Physical-device runner prepare failed — the agent may fall back to a simulator.\n${prep.output.slice(-400)}\n\n`,
      });
    } else {
      emit({
        type: "text_delta",
        text: "Physical devices preferred, but none is connected — the agent will fall back to a simulator.\n\n",
      });
    }
  }
  // Part B: explore the build once with a strong model before a weak-model run
  // when there is no cached map yet. The map + login flow it records let the
  // weak model skip the auth gate it gets stuck on. Cache-keyed → once per build.
  if (!cachedMap && assignedSimulators[0] && profile.cli === "ollama") {
    const profiles = await store.profilesList().catch(() => []);
    const explorer =
      (settings.explorationProfileId
        ? profiles.find((p) => p.id === settings.explorationProfileId)
        : undefined) ?? resolveExplorerProfile(profiles);
    if (explorer) {
      emit({ type: "status", phase: "acting" });
      emit({
        type: "text_delta",
        text: `No map for this build yet — exploring once with ${explorer.name} (${explorer.cli}/${explorer.model}) before the test.\n`,
      });
      try {
        const artifact = await runExploration({
          base: explorer,
          buildPath: req.buildPath,
          sim: assignedSimulators[0],
          emit,
          env: envWithDeviceBinsOnPath({
            ...physicalDeviceEnv(process.env, settings),
            ...networkEnv,
            TESTCAT_RUN_ID: runId,
            TESTCAT_RUN_COMPLETE_TOKEN: randomUUID(),
            TESTCAT_ASSIGNED_SIMULATORS_JSON: JSON.stringify(assignedSimulators),
          }),
          onChild: (child) =>
            active.set(runId, {
              cancel: (signal = "SIGTERM") => child.kill(signal),
            }),
        });
        if (artifact) {
          await store.appMapPut({
            buildKey: buildKeyForApp(req.buildPath),
            appMap: artifact.appMap,
            loginFlow: artifact.loginFlow,
            expectedSlots: artifact.expectedSlots,
            model: explorer.model,
          });
          cachedMap = { appMap: artifact.appMap, loginFlow: artifact.loginFlow };
          emit({
            type: "text_delta",
            text: `Exploration cached for this build: navigation map${artifact.loginFlow ? ` + login flow (slots: ${artifact.expectedSlots.join(", ") || "none"})` : " (no login flow recorded)"}.\n\n`,
          });
        } else {
          emit({
            type: "text_delta",
            text: "Exploration produced no usable map; continuing without one.\n\n",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit({
          type: "text_delta",
          text: `Exploration failed (${message}); continuing without a map.\n\n`,
        });
      } finally {
        active.delete(runId);
      }
    }
  }

  // If the user cancelled during exploration, stop before starting the test.
  if (cancelled.delete(runId)) {
    await finalize("cancelled", "Cancelled during run preparation.");
    return;
  }

  let warmup = undefined as RunRequest["warmup"];
  if (usesChildProcessWarmup(profile, req) && assignedSimulators[0]) {
    emit({ type: "status", phase: "acting" });
    try {
      emit({
        type: "text_delta",
        text: `Warm-up started on ${assignedSimulators[0].name} (${assignedSimulators[0].udid}).\n`,
      });
      warmup = await warmUpSimulatorRun({
        req,
        device: assignedSimulators[0],
        emit,
        env: envWithDeviceBinsOnPath({
          ...physicalDeviceEnv(process.env, settings),
          ...networkEnv,
          TESTCAT_RUN_ID: runId,
        }),
      });
      emit({
        type: "text_delta",
        text: `Warm-up summary:\n- ${warmup.summary}\n\n`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warmup = {
        ok: false,
        device: assignedSimulators[0],
        summary: "Warm-up failed; the agent should continue with the normal Testcat lifecycle.",
        error: message,
      };
      emit({
        type: "text_delta",
        text: `Warm-up summary:\n- Failed: ${message}\n- Continue with the normal Testcat lifecycle on the reserved simulator if possible.\n\n`,
      });
    }
  }

  const physicalBundleId =
    req.preferPhysicalDevices && !req.physicalBuildPath && req.buildPath
      ? ((await inspectAppBundle(req.buildPath).catch(() => null))
          ?.bundleIdentifier ?? undefined)
      : undefined;

  const agentReq: RunRequest = {
    ...req,
    ...(lastSuccessGuide ? { lastSuccessGuide } : {}),
    ...(cachedMap?.appMap ? { appMap: cachedMap.appMap } : {}),
    ...(cachedMap?.loginFlow ? { loginFlow: cachedMap.loginFlow } : {}),
    ...(settings.credentialTemplate
      ? { credentialTemplate: settings.credentialTemplate }
      : {}),
    // No separate physical build → the device's installed app (e.g. TestFlight)
    // is the target; give the agent its bundle id (from the simulator build's
    // Info.plist — settings.physicalDeviceBundleId is the RUNNER's signing id,
    // not the app under test).
    ...(physicalBundleId ? { physicalBundleId } : {}),
    ...(assignedSimulators.length ? { assignedSimulators } : {}),
    ...(warmup ? { warmup } : {}),
    ...(networkProxyUrl ? { networkProxyUrl } : {}),
  };

  const completeToken = randomUUID();
  const assignedPhysicalDevices =
    devicePreference === "preferPhysical"
      ? (await streamManager.list().catch(() => [])).filter(
          (device) => device.kind === "physical" && device.isBooted,
        )
      : [];
  const runEnv = envWithDeviceBinsOnPath({
    ...physicalDeviceEnv(process.env, settings),
    ...networkEnv,
    TESTCAT_RUN_ID: runId,
    TESTCAT_RUN_COMPLETE_TOKEN: completeToken,
    TESTCAT_ASSIGNED_SIMULATORS_JSON: JSON.stringify(assignedSimulators),
    TESTCAT_WARMUP_JSON: JSON.stringify(warmup ?? null),
    TESTCAT_IN_USE_DEVICES_JSON: JSON.stringify(deviceUsageSnapshot()),
    TESTCAT_ASSIGNED_DEVICES_JSON: JSON.stringify(assignedPhysicalDevices),
  });

  if (profile.cli === "ollama") {
    let runner: ReturnType<typeof startOllamaDirectRun>;
    try {
      runner = startOllamaDirectRun({
        req: agentReq,
        profile,
        runId,
        completeToken,
        emit,
        env: runEnv,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finalize("error", `Failed to start ${profile.cli} runner: ${message}`);
      return { runId, deviceBaselineUdids };
    }
    active.set(runId, runner);
    void runner.finished.then(async (result) => {
      active.delete(runId);
      if (cancelled.delete(runId)) {
        await finalize("cancelled", result.result ?? "Cancelled by user");
        return;
      }
      await finalize(result.status, result.result);
    });
    return { runId, deviceBaselineUdids };
  }

  let spawnSpec: ReturnType<typeof buildSpawn>;
  try {
    spawnSpec = buildSpawn(profile, agentReq);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalize("error", `Failed to build ${profile.cli} spawn: ${message}`);
    return { runId, deviceBaselineUdids };
  }
  const { cmd, args, cwd, env, input } = spawnSpec;
  const requiresTestcatIosExecution = profile.skills.some(isTestcatIosSkill);
  const parser = createParser(profile.cli, emit);
  let finished = false;
  let continuationAttempts = 0;
  let stderr = "";

  const finishOnce = (status: TestStatus, result: string | null) => {
    if (finished) return;
    finished = true;
    active.delete(runId);
    void finalize(status, result);
  };

  const launchChild = (childArgs: string[], childInput: string) => {
    let child: ChildProcess;
    try {
      child = spawn(cmd, childArgs, {
        cwd,
        env: { ...runEnv, ...env },
      });
    } catch (e) {
      finishOnce("error", `Failed to launch ${cmd}: ${String(e)}`);
      return;
    }
    active.set(runId, {
      cancel(signal = "SIGTERM") {
        child.kill(signal);
      },
    });

    // Feed the prompt via stdin (see SpawnSpec.input).
    child.stdin?.write(childInput);
    child.stdin?.end();

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => parser.push(d));

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (d: string) => {
      stderr += d;
    });

    child.on("error", (e) => {
      finishOnce("error", `${cmd} failed: ${e.message}`);
    });

    child.on("close", (code) => {
      parser.flush();
      active.delete(runId);
      if (finished) return;
      if (cancelled.delete(runId)) {
        finishOnce("cancelled", parser.getResult() ?? "Cancelled by user");
        return;
      }
      const verdict = determineRunVerdict({
        cmd,
        events: buffer,
        expectedCompleteToken: completeToken,
        expectedRunId: runId,
        exitCode: code,
        parserResult: parser.getResult(),
        requiresTestcatIosExecution,
        stderr,
      });
      const sessionId = parser.getSessionId?.();
      if (
        sessionId &&
        continuationAttempts < OPENCODE_MAX_CONTINUATIONS &&
        shouldContinueOpencodeRun(
          profile.cli,
          requiresTestcatIosExecution,
          code,
          verdict.result,
          sessionId,
        )
      ) {
        continuationAttempts += 1;
        emit({
          type: "status",
          phase: "acting",
        });
        launchChild(
          [...args, "--session", sessionId],
          opencodeContinuationPrompt(continuationAttempts),
        );
        return;
      }
      finishOnce(verdict.status, verdict.result);
    });
  };

  launchChild(args, input);
  })().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await finalize("error", `Run setup failed: ${message}`);
  });

  return { runId, deviceBaselineUdids };
}

export async function cancelRun(runId: string): Promise<void> {
  const handle = active.get(runId);
  if (handle) {
    cancelled.add(runId); // close handler maps this to a "cancelled" verdict
    handle.cancel("SIGTERM");
    active.delete(runId);
    await networkInspector.stop(runId);
    releaseDeviceUsageForRun(runId);
    return;
  }
  // No live child (owning session died, or already gone). Reconcile the stored
  // row so the UI stops showing a stuck "running".
  try {
    await store.runsPatch(runId, { status: "cancelled", result: "Stopped." });
  } catch (e) {
    console.error("[run] cancel-orphan failed", e);
  }
  await networkInspector.stop(runId);
  releaseDeviceUsageForRun(runId);
}

export async function cancelRunningRuns(): Promise<KillRunningTestsResult> {
  const ids = new Set(active.keys());
  const failed: KillRunningTestsResult["failed"] = [];

  try {
    const runs = await store.runsList();
    for (const run of runs) {
      if (run.status === "running" || run.status === "queued") ids.add(run.id);
    }
  } catch (error) {
    console.error("[run] list running failed", error);
  }

  const requested = ids.size;
  const cancelled: string[] = [];
  for (const runId of ids) {
    try {
      await cancelRun(runId);
      cancelled.push(runId);
    } catch (error) {
      failed.push({
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { requested, cancelled, failed };
}

// Kill every in-flight child (called on app quit so the agent CLI doesn't
// keep running headless after the window closes).
export async function killActiveRuns(): Promise<void> {
  const runIds = [...active.keys()];
  for (const handle of active.values()) handle.cancel("SIGKILL");
  active.clear();
  clearDeviceUsage();
  await Promise.all(runIds.map((runId) => networkInspector.stop(runId)));
}
