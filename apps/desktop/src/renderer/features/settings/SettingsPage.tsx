import type {
  AgentProfile,
  AppSettings,
  Device,
  KillRunningTestsResult,
  OllamaModelSummary,
  PhysicalDevicePrepareResult,
  SimulatorKillResult,
} from "@testcat/shared";
import {
  Bot,
  FilePenLine,
  Loader2,
  MonitorOff,
  RefreshCw,
  Settings2,
  Smartphone,
  Square,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ActionState<T> = {
  loading: boolean;
  result: T | null;
  error: string | null;
};

const idle = <T,>(): ActionState<T> => ({
  loading: false,
  result: null,
  error: null,
});

const NO_ENHANCE_PROFILE = "__none__";
const NO_EXPLORATION_PROFILE = "__none__";

export function SettingsPage() {
  const [simulators, setSimulators] =
    useState<ActionState<SimulatorKillResult>>(idle);
  const [tests, setTests] = useState<ActionState<KillRunningTestsResult>>(idle);
  const [ollamaModels, setOllamaModels] =
    useState<ActionState<OllamaModelSummary[]>>(idle);
  const [physicalDevices, setPhysicalDevices] =
    useState<ActionState<Device[]>>(idle);
  const [physicalPrepare, setPhysicalPrepare] =
    useState<ActionState<PhysicalDevicePrepareResult>>(idle);
  const [selectedPhysicalUdid, setSelectedPhysicalUdid] = useState("");
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    defaultEnhanceProfileId: null,
    explorationProfileId: null,
    credentialTemplate: null,
    physicalDeviceTeamId: null,
    physicalDeviceBundleId: null,
  });
  const [credentialTemplateText, setCredentialTemplateText] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () =>
      ollamaModels.result?.find((model) => model.name === selectedOllamaModel) ??
      null,
    [ollamaModels.result, selectedOllamaModel],
  );

  const selectedEnhanceProfileValue =
    settings.defaultEnhanceProfileId &&
    profiles.some((profile) => profile.id === settings.defaultEnhanceProfileId)
      ? settings.defaultEnhanceProfileId
      : NO_ENHANCE_PROFILE;
  const selectedExplorationProfileValue =
    settings.explorationProfileId &&
    profiles.some((profile) => profile.id === settings.explorationProfileId)
      ? settings.explorationProfileId
      : NO_EXPLORATION_PROFILE;

  const loadOllamaModels = async () => {
    setOllamaModels({ loading: true, result: null, error: null });
    try {
      const result = await window.testcat.ollamaModelsList();
      setOllamaModels({ loading: false, result, error: null });
      setSelectedOllamaModel((current) =>
        current && result.some((model) => model.name === current)
          ? current
          : (result[0]?.name ?? ""),
      );
    } catch (error) {
      setOllamaModels({
        loading: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  useEffect(() => {
    void loadOllamaModels();
    void loadSettings();
    void loadPhysicalDevices();
  }, []);

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const [nextSettings, nextProfiles] = await Promise.all([
        window.testcat.settingsGet(),
        window.testcat.profilesList(),
      ]);
      setSettings(nextSettings);
      setCredentialTemplateText(
        nextSettings.credentialTemplate
          ? JSON.stringify(nextSettings.credentialTemplate, null, 2)
          : "",
      );
      setProfiles(nextProfiles);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveDefaultEnhanceProfile = async (value: string) => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const next = await window.testcat.settingsUpdate({
        defaultEnhanceProfileId:
          value === NO_ENHANCE_PROFILE ? null : value,
      });
      setSettings(next);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveExplorationProfile = async (value: string) => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const next = await window.testcat.settingsUpdate({
        explorationProfileId: value === NO_EXPLORATION_PROFILE ? null : value,
      });
      setSettings(next);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveCredentialTemplate = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const trimmed = credentialTemplateText.trim();
      let template: Record<string, string> | null = null;
      if (trimmed) {
        const parsed: unknown = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Credential template must be a JSON object of slot → value strings.");
        }
        template = {};
        for (const [slot, value] of Object.entries(parsed)) {
          if (typeof value !== "string") {
            throw new Error(`Credential template value for "${slot}" must be a string.`);
          }
          template[slot] = value;
        }
      }
      const next = await window.testcat.settingsUpdate({
        credentialTemplate: template,
      });
      setSettings(next);
      setCredentialTemplateText(
        next.credentialTemplate
          ? JSON.stringify(next.credentialTemplate, null, 2)
          : "",
      );
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingsSaving(false);
    }
  };

  const savePhysicalSettings = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const next = await window.testcat.settingsUpdate({
        physicalDeviceTeamId: settings.physicalDeviceTeamId,
        physicalDeviceBundleId: settings.physicalDeviceBundleId,
      });
      setSettings(next);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingsSaving(false);
    }
  };

  const loadPhysicalDevices = async () => {
    setPhysicalDevices({ loading: true, result: null, error: null });
    try {
      const devices = (await window.testcat.devicesList()).filter(
        (device) => device.kind === "physical",
      );
      setPhysicalDevices({ loading: false, result: devices, error: null });
      setSelectedPhysicalUdid((current) =>
        current && devices.some((device) => device.udid === current)
          ? current
          : (devices[0]?.udid ?? ""),
      );
    } catch (error) {
      setPhysicalDevices({
        loading: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const prepareSelectedPhysicalDevice = async () => {
    if (!selectedPhysicalUdid) return;
    setPhysicalPrepare({ loading: true, result: null, error: null });
    try {
      const result = await window.testcat.physicalDevicesPrepare(
        selectedPhysicalUdid,
      );
      setPhysicalPrepare({ loading: false, result, error: null });
    } catch (error) {
      setPhysicalPrepare({
        loading: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const killSimulators = async () => {
    setSimulators({ loading: true, result: null, error: null });
    try {
      const result = await window.testcat.simulatorsKillAll();
      setSimulators({ loading: false, result, error: null });
    } catch (error) {
      setSimulators({
        loading: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const killRunningTests = async () => {
    setTests({ loading: true, result: null, error: null });
    try {
      const result = await window.testcat.runsKillRunning();
      setTests({ loading: false, result, error: null });
    } catch (error) {
      setTests({
        loading: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div data-page-scroll className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6">
        <header data-page-reveal className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
            <Settings2 className="size-4" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold tracking-tight">
              Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Local tools, agent CLI configuration, and simulator utilities.
            </p>
          </div>
        </header>

        <section data-page-reveal className="ide-panel rounded-lg border border-border bg-card/45">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="font-heading text-sm font-semibold">
                Agent CLI
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Local agent runtime and model integration settings.
              </p>
            </div>
            <Badge variant="outline">local</Badge>
          </div>

          <div className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="flex min-w-0 gap-3">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="min-w-0 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium">
                        Ollama Direct Models
                      </h3>
                      <Badge variant="accent">ollama</Badge>
                    </div>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      Ollama Direct talks to your local Ollama daemon without
                      routing through Codex, so local GGUF models avoid Codex
                      template and tool-format issues.
                    </p>
                  </div>

                  <div className="grid min-w-0 gap-2 sm:max-w-md">
                    <Label>Ollama model</Label>
                    {ollamaModels.loading ? (
                      <p className="flex items-center gap-2 rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Loading Ollama models…
                      </p>
                    ) : ollamaModels.error ? (
                      <ErrorLine message={ollamaModels.error} />
                    ) : ollamaModels.result?.length ? (
                      <Select
                        value={selectedOllamaModel}
                        onValueChange={setSelectedOllamaModel}
                      >
                        <SelectTrigger
                          className="w-full min-w-0"
                          title={selectedOllamaModel}
                        >
                          <SelectValue>
                            <span className="block min-w-0 truncate">
                              {selectedOllamaModel}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ollamaModels.result.map((model) => (
                            <SelectItem key={model.name} value={model.name}>
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 truncate font-mono text-xs">
                                  {model.name}
                                </span>
                                {model.remote && (
                                  <span className="text-[10px] text-muted-foreground">
                                    cloud
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                        No Ollama models found.
                      </p>
                    )}
                  </div>

                  {selectedModel && <OllamaModelMeta model={selectedModel} />}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOllamaModels()}
                  disabled={ollamaModels.loading}
                >
                  <RefreshCw className={ollamaModels.loading ? "animate-spin" : ""} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section data-page-reveal className="ide-panel rounded-lg border border-border bg-card/45">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="font-heading text-sm font-semibold">
                Physical Device Helper
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Configure the bundled testcat-device runner for connected iOS devices.
              </p>
            </div>
            <Badge variant="outline">testcat-device</Badge>
          </div>

          <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="flex min-w-0 gap-3">
              <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                <Smartphone className="size-4" />
              </div>
              <div className="min-w-0 space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Runner signing</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Physical iOS control uses Testcat's vendored XCTest runner.
                    Set your Apple team id, then prepare the runner for a connected device.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Apple team id</Label>
                    <Input
                      value={settings.physicalDeviceTeamId ?? ""}
                      onChange={(event) => {
                        const physicalDeviceTeamId =
                          event.target.value.trim() || null;
                        setSettings((current) => ({
                          ...current,
                          physicalDeviceTeamId,
                        }));
                      }}
                      placeholder="ABCDE12345"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Runner bundle id</Label>
                    <Input
                      value={settings.physicalDeviceBundleId ?? ""}
                      onChange={(event) => {
                        const physicalDeviceBundleId =
                          event.target.value.trim() || null;
                        setSettings((current) => ({
                          ...current,
                          physicalDeviceBundleId,
                        }));
                      }}
                      placeholder="io.testcat.device.runner"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:max-w-xl">
                  <Label>Connected physical device</Label>
                  {physicalDevices.loading ? (
                    <p className="flex items-center gap-2 rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading physical devices…
                    </p>
                  ) : physicalDevices.error ? (
                    <ErrorLine message={physicalDevices.error} />
                  ) : physicalDevices.result?.length ? (
                    <Select
                      value={selectedPhysicalUdid}
                      onValueChange={setSelectedPhysicalUdid}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {physicalDevices.result.map((device) => (
                          <SelectItem key={device.udid} value={device.udid}>
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              <span className="min-w-0 truncate">{device.name}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {device.runtime}
                              </span>
                              {!device.isBooted && (
                                <span className="text-[10px] text-destructive">
                                  unavailable
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                      No paired iPhone or iPad found through devicectl.
                    </p>
                  )}
                </div>

                {physicalPrepare.result && (
                  <ResultLine>{physicalPrepare.result.output}</ResultLine>
                )}
                {physicalPrepare.error && <ErrorLine message={physicalPrepare.error} />}
                {settingsError && <ErrorLine message={settingsError} />}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadPhysicalDevices()}
                disabled={physicalDevices.loading}
              >
                <RefreshCw className={physicalDevices.loading ? "animate-spin" : ""} />
                Refresh devices
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void savePhysicalSettings()}
                disabled={settingsSaving}
              >
                {settingsSaving && <Loader2 className="animate-spin" />}
                Save signing
              </Button>
              <Button
                size="sm"
                onClick={() => void prepareSelectedPhysicalDevice()}
                disabled={!selectedPhysicalUdid || physicalPrepare.loading}
              >
                {physicalPrepare.loading && <Loader2 className="animate-spin" />}
                Prepare runner
              </Button>
            </div>
          </div>
        </section>

        <section data-page-reveal className="ide-panel rounded-lg border border-border bg-card/45">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="font-heading text-sm font-semibold">
                Prompt enhancement
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Select the profile used to rewrite scenarios and profile system prompts in English.
              </p>
            </div>
            <Badge variant="outline">default</Badge>
          </div>

          <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="flex min-w-0 gap-3">
              <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                <FilePenLine className="size-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium">Default enhance profile</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  The selected profile's runtime and model are used only for prompt
                  rewriting in New Test and Agent Profiles. It does not change the
                  agent profile selected for the actual test run.
                </p>

                <div className="mt-3 grid min-w-0 gap-2 sm:max-w-xl">
                  <Label>Enhance profile</Label>
                  {settingsLoading ? (
                    <p className="flex items-center gap-2 rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading profiles…
                    </p>
                  ) : profiles.length ? (
                    <Select
                      value={selectedEnhanceProfileValue}
                      onValueChange={(value) =>
                        void saveDefaultEnhanceProfile(value)
                      }
                      disabled={settingsSaving}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ENHANCE_PROFILE}>
                          No default enhancer
                        </SelectItem>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              <span className="min-w-0 truncate">{profile.name}</span>
                              <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                                {profile.cli}/{profile.model}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                      No agent profiles found.
                    </p>
                  )}
                </div>

                <div className="mt-4 grid min-w-0 gap-2 sm:max-w-xl">
                  <Label>Exploration agent</Label>
                  <p className="text-xs text-muted-foreground">
                    A strong agent (Codex or Claude) that explores a build once
                    before Ollama runs, caching a navigation map + login flow
                    so the local model can skip the auth gate. Runs once per build.
                  </p>
                  {settingsLoading ? (
                    <p className="flex items-center gap-2 rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading profiles…
                    </p>
                  ) : profiles.length ? (
                    <Select
                      value={selectedExplorationProfileValue}
                      onValueChange={(value) => void saveExplorationProfile(value)}
                      disabled={settingsSaving}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_EXPLORATION_PROFILE}>
                          Auto (prefer Codex, then Claude)
                        </SelectItem>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              <span className="min-w-0 truncate">{profile.name}</span>
                              <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                                {profile.cli}/{profile.model}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                      No agent profiles found.
                    </p>
                  )}
                </div>

                <div className="mt-4 grid min-w-0 gap-2 sm:max-w-xl">
                  <Label htmlFor="credential-template">Login credential template</Label>
                  <p className="text-xs text-muted-foreground">
                    JSON of slot → value used to fill the recorded login flow at
                    replay time. <code className="font-mono">{"{testId}"}</code>{" "}
                    becomes the run id's first 8 chars and{" "}
                    <code className="font-mono">{"{simIndex}"}</code> the 1-based
                    simulator index, so each run logs in with a fresh account.
                  </p>
                  <Textarea
                    id="credential-template"
                    value={credentialTemplateText}
                    onChange={(event) => setCredentialTemplateText(event.target.value)}
                    placeholder={'{\n  "email": "{testId}-sim-{simIndex}@example.com",\n  "otp": "111111"\n}'}
                    spellCheck={false}
                    rows={4}
                    className="min-h-20 font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void saveCredentialTemplate()}
                    disabled={settingsLoading || settingsSaving}
                    className="justify-self-start"
                  >
                    {settingsSaving && <Loader2 className="animate-spin" />}
                    Save template
                  </Button>
                </div>

                {settingsError && <ErrorLine message={settingsError} />}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadSettings()}
              disabled={settingsLoading || settingsSaving}
              className="justify-self-start lg:justify-self-end"
            >
              <RefreshCw className={settingsLoading ? "animate-spin" : ""} />
              Refresh profiles
            </Button>
          </div>
        </section>

        <section data-page-reveal className="ide-panel rounded-lg border border-border bg-card/45">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="font-heading text-sm font-semibold">
                Simulator
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cleanup actions for local simulator and agent test processes.
              </p>
            </div>
            <Badge variant="outline">local</Badge>
          </div>

          <div className="divide-y divide-border">
            <HelperAction
              icon={MonitorOff}
              title="Kill all simulators"
              description="Lists currently booted simulators and shuts each one down through testcat-sim."
              buttonLabel="Kill all simulators"
              loadingLabel="Killing…"
              loading={simulators.loading}
              onClick={() => void killSimulators()}
            >
              <SimulatorResult state={simulators} />
            </HelperAction>

            <HelperAction
              icon={Square}
              title="Kill running tests"
              description="Cancels all running or queued test runs known by this desktop session and the local database."
              buttonLabel="Kill running tests"
              loadingLabel="Killing…"
              loading={tests.loading}
              onClick={() => void killRunningTests()}
            >
              <RunningTestsResult state={tests} />
            </HelperAction>
          </div>
        </section>
      </div>
    </div>
  );
}

function HelperAction({
  icon: Icon,
  title,
  description,
  buttonLabel,
  loadingLabel,
  loading,
  onClick,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonLabel: string;
  loadingLabel: string;
  loading: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background/45 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          {children}
        </div>
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={onClick}
        disabled={loading}
        className="justify-self-start lg:justify-self-end"
      >
        {loading && <Loader2 className="animate-spin" />}
        {loading ? loadingLabel : buttonLabel}
      </Button>
    </div>
  );
}

function formatBytes(value: number | null): string | null {
  if (!value) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function OllamaModelMeta({ model }: { model: OllamaModelSummary }) {
  const detail = [
    model.details.parameterSize,
    model.details.quantizationLevel,
    formatBytes(model.sizeBytes),
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5">
      {detail.map((item) => (
        <Badge key={item} variant="outline">
          {item}
        </Badge>
      ))}
      {model.capabilities.map((capability) => (
        <Badge key={capability} variant="outline">
          {capability}
        </Badge>
      ))}
      {model.remote && <Badge variant="outline">cloud</Badge>}
    </div>
  );
}

function SimulatorResult({
  state,
}: {
  state: ActionState<SimulatorKillResult>;
}) {
  if (state.error) return <ErrorLine message={state.error} />;
  if (!state.result) return null;
  const { requested, killed, failed } = state.result;
  return (
    <ResultLine>
      {requested === 0
        ? "No booted simulators found."
        : `Requested ${requested}; shut down ${killed.length}.`}
      {failed.length > 0 && ` ${failed.length} failed.`}
    </ResultLine>
  );
}

function RunningTestsResult({
  state,
}: {
  state: ActionState<KillRunningTestsResult>;
}) {
  if (state.error) return <ErrorLine message={state.error} />;
  if (!state.result) return null;
  const { requested, cancelled, failed } = state.result;
  return (
    <ResultLine>
      {requested === 0
        ? "No running tests found."
        : `Requested ${requested}; cancelled ${cancelled.length}.`}
      {failed.length > 0 && ` ${failed.length} failed.`}
    </ResultLine>
  );
}

function ResultLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">
      {children}
    </p>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
      {message}
    </p>
  );
}
