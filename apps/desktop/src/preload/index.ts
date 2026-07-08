import { contextBridge, ipcRenderer } from "electron";
import {
  type DeviceFrameMessage,
  IpcChannel,
  type NetworkEventMessage,
  type RunDoneMessage,
  type RunEventMessage,
  type TestcatApi,
} from "@testcat/shared";

const api: TestcatApi = {
  runStart: (req) => ipcRenderer.invoke(IpcChannel.RunStart, req),
  runCancel: (runId) => ipcRenderer.invoke(IpcChannel.RunCancel, runId),
  pickBuild: () => ipcRenderer.invoke(IpcChannel.DialogPickBuild),
  appInspect: (path) => ipcRenderer.invoke(IpcChannel.AppInspect, path),
  onRunEvent: (cb) => {
    const listener = (_e: unknown, msg: RunEventMessage) => cb(msg);
    ipcRenderer.on(IpcChannel.RunEvent, listener);
    return () => ipcRenderer.removeListener(IpcChannel.RunEvent, listener);
  },
  onRunDone: (cb) => {
    const listener = (_e: unknown, msg: RunDoneMessage) => cb(msg);
    ipcRenderer.on(IpcChannel.RunDone, listener);
    return () => ipcRenderer.removeListener(IpcChannel.RunDone, listener);
  },
  onNetworkEvent: (cb) => {
    const listener = (_e: unknown, msg: NetworkEventMessage) => cb(msg);
    ipcRenderer.on(IpcChannel.NetworkEvent, listener);
    return () => ipcRenderer.removeListener(IpcChannel.NetworkEvent, listener);
  },
  networkEvents: (runId) => ipcRenderer.invoke(IpcChannel.NetworkEvents, runId),
  devicesList: () => ipcRenderer.invoke(IpcChannel.DevicesList),
  devicesServeStatus: () => ipcRenderer.invoke(IpcChannel.DevicesServeStatus),
  devicesWatch: () => ipcRenderer.invoke(IpcChannel.DevicesWatch),
  devicesUnwatch: () => ipcRenderer.invoke(IpcChannel.DevicesUnwatch),
  onDeviceFrame: (cb) => {
    const listener = (_e: unknown, msg: DeviceFrameMessage) => cb(msg);
    ipcRenderer.on(IpcChannel.DeviceFrame, listener);
    return () => ipcRenderer.removeListener(IpcChannel.DeviceFrame, listener);
  },
  simulatorsKillAll: () => ipcRenderer.invoke(IpcChannel.SimulatorsKillAll),
  physicalDevicesPrepare: (udid) =>
    ipcRenderer.invoke(IpcChannel.PhysicalDevicesPrepare, udid),
  profilesList: () => ipcRenderer.invoke(IpcChannel.ProfilesList),
  profilesGet: (id) => ipcRenderer.invoke(IpcChannel.ProfilesGet, id),
  profilesCreate: (input) => ipcRenderer.invoke(IpcChannel.ProfilesCreate, input),
  profilesUpdate: (id, input) =>
    ipcRenderer.invoke(IpcChannel.ProfilesUpdate, id, input),
  profilesDelete: (id) => ipcRenderer.invoke(IpcChannel.ProfilesDelete, id),
  modelsList: () => ipcRenderer.invoke(IpcChannel.ModelsList),
  ollamaModelsList: () => ipcRenderer.invoke(IpcChannel.OllamaModelsList),
  runsList: () => ipcRenderer.invoke(IpcChannel.RunsList),
  runsGet: (id) => ipcRenderer.invoke(IpcChannel.RunsGet, id),
  runsEvents: (id) => ipcRenderer.invoke(IpcChannel.RunsEvents, id),
  runMediaCapture: (input) =>
    ipcRenderer.invoke(IpcChannel.RunMediaCapture, input),
  runMediaList: (runId) => ipcRenderer.invoke(IpcChannel.RunMediaList, runId),
  runMediaDelete: (input) =>
    ipcRenderer.invoke(IpcChannel.RunMediaDelete, input),
  runsDelete: (id) => ipcRenderer.invoke(IpcChannel.RunsDelete, id),
  runsKillRunning: () => ipcRenderer.invoke(IpcChannel.RunsKillRunning),
  settingsGet: () => ipcRenderer.invoke(IpcChannel.SettingsGet),
  settingsUpdate: (patch) =>
    ipcRenderer.invoke(IpcChannel.SettingsUpdate, patch),
  scenarioEnhance: (input) =>
    ipcRenderer.invoke(IpcChannel.ScenarioEnhance, input),
  systemPromptEnhance: (input) =>
    ipcRenderer.invoke(IpcChannel.SystemPromptEnhance, input),
  setupStatus: () => ipcRenderer.invoke(IpcChannel.Setup),
  setupInstall: (target) => ipcRenderer.invoke(IpcChannel.SetupInstall, target),
  cliVersions: () => ipcRenderer.invoke(IpcChannel.CliVersions),
};

contextBridge.exposeInMainWorld("testcat", api);
