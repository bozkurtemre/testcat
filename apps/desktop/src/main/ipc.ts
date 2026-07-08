import {
  type AgentProfileInput,
  IpcChannel,
  type RunMediaCaptureInput,
  type RunMediaDeleteInput,
  type RunRequest,
} from "@testcat/shared";
import { dialog, ipcMain } from "electron";
import { listModels } from "./agent/models";
import { inspectAppBundle } from "./app-inspect";
import { cancelRun, cancelRunningRuns, startRun } from "./agent/run-controller";
import { killAllSimulators } from "./devices/simulator-helper";
import { preparePhysicalDevice } from "./devices/physical-helper";
import { streamManager } from "./devices/stream-manager";
import {
  captureRunMedia,
  deleteRunMedia,
  deleteRunMediaFolder,
  listRunMedia,
} from "./run-media";
import { getCliVersions, getSetupStatus, installSetupTarget } from "./setup";
import { listOllamaModels } from "./ollama-codex";
import { getSettings, updateSettings } from "./settings-store";
import { enhanceScenario, enhanceSystemPrompt } from "./scenario-enhancer";
import { networkInspector } from "./network-inspector";
import { store } from "./store/store";

export function registerIpc(): void {
  // Run lifecycle (M2): spawn the agent CLI and stream parsed events back.
  ipcMain.handle(IpcChannel.RunStart, async (event, req: RunRequest) =>
    startRun(req, event.sender),
  );
  ipcMain.handle(IpcChannel.RunCancel, async (_e, runId: string) =>
    cancelRun(runId),
  );
  ipcMain.handle(IpcChannel.NetworkEvents, async (_e, runId: string) =>
    networkInspector.snapshot(runId),
  );

  // Native file picker for the simulator .app build.
  ipcMain.handle(IpcChannel.DialogPickBuild, async () => {
    const res = await dialog.showOpenDialog({
      title: "Select an app build",
      properties: ["openFile", "openDirectory", "dontAddToRecent"],
      filters: [{ name: "App bundle or IPA", extensions: ["app", "ipa"] }],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });
  ipcMain.handle(IpcChannel.AppInspect, async (_event, path: string) =>
    inspectAppBundle(path),
  );

  // Live device grid (M3): testcat-sim list + per-sim MJPEG stream → renderer.
  ipcMain.handle(IpcChannel.DevicesList, async () => streamManager.list());
  ipcMain.handle(IpcChannel.DevicesWatch, async (event) =>
    streamManager.watch(event.sender),
  );
  ipcMain.handle(IpcChannel.DevicesUnwatch, async () => streamManager.unwatch());
  ipcMain.handle(IpcChannel.DevicesServeStatus, async () => ({
    url: "",
    running: false,
  }));
  ipcMain.handle(IpcChannel.SimulatorsKillAll, async () => killAllSimulators());
  ipcMain.handle(IpcChannel.PhysicalDevicesPrepare, async (_event, udid: string) =>
    preparePhysicalDevice(udid),
  );

  // Profiles and run history are persisted by the local Electron main store.
  ipcMain.handle(IpcChannel.ProfilesList, async () => store.profilesList());
  ipcMain.handle(IpcChannel.ProfilesGet, async (_e, id: string) =>
    store.profilesGet(id),
  );
  ipcMain.handle(
    IpcChannel.ProfilesCreate,
    async (_e, input: AgentProfileInput) => store.profilesCreate(input),
  );
  ipcMain.handle(
    IpcChannel.ProfilesUpdate,
    async (_e, id: string, input: AgentProfileInput) =>
      store.profilesUpdate(id, input),
  );
  ipcMain.handle(IpcChannel.ProfilesDelete, async (_e, id: string) =>
    store.profilesDelete(id),
  );

  // Real, current models per CLI.
  ipcMain.handle(IpcChannel.ModelsList, async () => listModels());
  ipcMain.handle(IpcChannel.OllamaModelsList, async () => listOllamaModels());

  ipcMain.handle(IpcChannel.RunsList, async () => store.runsList());
  ipcMain.handle(IpcChannel.RunsGet, async (_e, id: string) =>
    store.runsGet(id),
  );
  ipcMain.handle(IpcChannel.RunsEvents, async (_e, id: string) =>
    store.runsEvents(id),
  );
  ipcMain.handle(
    IpcChannel.RunMediaCapture,
    async (_e, input: RunMediaCaptureInput) => captureRunMedia(input),
  );
  ipcMain.handle(IpcChannel.RunMediaList, async (_e, runId: string) =>
    listRunMedia(runId),
  );
  ipcMain.handle(
    IpcChannel.RunMediaDelete,
    async (_e, input: RunMediaDeleteInput) => deleteRunMedia(input),
  );
  ipcMain.handle(IpcChannel.RunsDelete, async (_e, id: string) => {
    await store.runsDelete(id);
    await deleteRunMediaFolder(id).catch(() => undefined);
  });
  ipcMain.handle(IpcChannel.RunsKillRunning, async () => cancelRunningRuns());

  ipcMain.handle(IpcChannel.SettingsGet, async () => getSettings());
  ipcMain.handle(IpcChannel.SettingsUpdate, async (_e, patch) =>
    updateSettings(patch),
  );
  ipcMain.handle(IpcChannel.ScenarioEnhance, async (_e, input) =>
    enhanceScenario(input.scenario),
  );
  ipcMain.handle(IpcChannel.SystemPromptEnhance, async (_e, input) =>
    enhanceSystemPrompt(input.systemPrompt),
  );

  // First-launch / Help setup checklist (CLIs + skill + sim + database detected).
  ipcMain.handle(IpcChannel.Setup, async () => getSetupStatus());
  // One-click installs for unchecked checklist items.
  ipcMain.handle(IpcChannel.SetupInstall, async (_e, target) =>
    installSetupTarget(target),
  );
  // Agent CLI versions for the profile dialog's CLI info line.
  ipcMain.handle(IpcChannel.CliVersions, async () => getCliVersions());
}
