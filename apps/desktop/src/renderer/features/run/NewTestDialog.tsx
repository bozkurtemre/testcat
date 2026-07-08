import type { AgentProfile, AppSettings } from "@testcat/shared";
import {
  CheckCircle2,
  FolderOpen,
  Loader2,
  Network,
  Play,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullscreenTopBar } from "@/features/shell/FullscreenTopBar";
import { Textarea } from "@/components/ui/textarea";

export interface NewTestDraft {
  name?: string;
  buildPath?: string;
  physicalBuildPath?: string | null;
  preferPhysicalDevices?: boolean;
  captureNetwork?: boolean;
  simulatorCount?: number;
  profileId?: string | null;
  scenario?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft?: NewTestDraft | null;
  onStarted: (
    runId: string,
    meta: {
      name: string;
      cli: string;
      profileName?: string;
      deviceBaselineUdids?: string[];
    },
  ) => void;
}

export function NewTestDialog({ open, onOpenChange, draft, onStarted }: Props) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [name, setName] = useState("");
  const [buildPath, setBuildPath] = useState("");
  const [physicalBuildPath, setPhysicalBuildPath] = useState("");
  const [preferPhysicalDevices, setPreferPhysicalDevices] = useState(false);
  const [captureNetwork, setCaptureNetwork] = useState(false);
  const [simulatorCount, setSimulatorCount] = useState(1);
  const [profileId, setProfileId] = useState("");
  const [scenario, setScenario] = useState("");
  const [starting, setStarting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    defaultEnhanceProfileId: null,
    explorationProfileId: null,
    credentialTemplate: null,
    physicalDeviceTeamId: null,
    physicalDeviceBundleId: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(draft?.name ?? "");
    setBuildPath(draft?.buildPath ?? "");
    setPhysicalBuildPath(draft?.physicalBuildPath ?? "");
    setPreferPhysicalDevices(draft?.preferPhysicalDevices ?? false);
    setCaptureNetwork(draft?.captureNetwork ?? false);
    setSimulatorCount(draft?.simulatorCount ?? 1);
    setScenario(draft?.scenario ?? "");
    setStarting(false);
    setEnhancing(false);
    window.testcat
      .profilesList()
      .then((p) => {
        setProfiles(p);
        const draftProfile = draft?.profileId
          ? p.find((profile) => profile.id === draft.profileId)
          : null;
        setProfileId(draftProfile?.id ?? p[0]?.id ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    window.testcat
      .settingsGet()
      .then((next) => setSettings(next))
      .catch(() =>
        setSettings({
          defaultEnhanceProfileId: null,
          explorationProfileId: null,
          credentialTemplate: null,
          physicalDeviceTeamId: null,
          physicalDeviceBundleId: null,
        }),
      );
  }, [draft, open]);

  const profile = profiles.find((p) => p.id === profileId);
  const enhanceProfileAvailable = Boolean(
    settings.defaultEnhanceProfileId &&
      profiles.some((p) => p.id === settings.defaultEnhanceProfileId),
  );
  const canEnhance = Boolean(
    scenario.trim() && enhanceProfileAvailable && !enhancing && !starting,
  );
  const canRun = Boolean(
    name.trim() && profileId && scenario.trim() && !starting && !enhancing,
  );

  const pick = async () => {
    const path = await window.testcat.pickBuild();
    if (path) setBuildPath(path);
  };

  const pickPhysical = async () => {
    const path = await window.testcat.pickBuild();
    if (path) setPhysicalBuildPath(path);
  };

  const run = async () => {
    if (!profile) return;
    setStarting(true);
    setError(null);
    try {
      const { runId, deviceBaselineUdids } = await window.testcat.runStart({
        name: name.trim(),
        buildPath: buildPath.trim(),
        physicalBuildPath: physicalBuildPath.trim() || null,
        preferPhysicalDevices,
        captureNetwork,
        simulatorCount,
        profileId,
        scenario: scenario.trim(),
      });
      onStarted(runId, {
        name: name.trim(),
        cli: profile.cli,
        profileName: profile.name,
        deviceBaselineUdids,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  const enhance = async () => {
    if (!canEnhance) return;
    setEnhancing(true);
    setError(null);
    try {
      const result = await window.testcat.scenarioEnhance({
        scenario: scenario.trim(),
      });
      setScenario(result.scenario);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnhancing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <FullscreenTopBar onClose={() => onOpenChange(false)} />
        <DialogHeader
          data-fullscreen-page-header
          className="ide-panel shrink-0 border-b border-border px-6 py-4"
        >
          <DialogTitle className="font-heading text-base">New test</DialogTitle>
          <DialogDescription className="text-xs">
            The selected agent profile drives assigned iOS devices to run your scenario.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-5 overflow-auto px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="ide-panel rounded-lg border border-border p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
              <div className="grid size-9 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                <TerminalSquare className="size-4" />
              </div>
              <div>
                <h2 className="font-heading text-sm font-semibold">Run configuration</h2>
                <p className="text-xs text-muted-foreground">Fields are snapshotted to the run history.</p>
              </div>
            </div>

            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="tname">Test name</Label>
                <Input
                  id="tname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sign-up flow"
                  autoComplete="off"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="build">Build (.app)</Label>
                <div className="flex gap-2">
                  <Input
                    id="build"
                    value={buildPath}
                    onChange={(e) => setBuildPath(e.target.value)}
                    placeholder="/path/to/MyApp.app"
                    autoComplete="off"
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={pick}>
                    <FolderOpen /> Browse
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="simulator-count">Simulators</Label>
                <Select
                  value={String(simulatorCount)}
                  onValueChange={(value) => setSimulatorCount(Number(value))}
                >
                  <SelectTrigger id="simulator-count" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count === 1
                          ? "1 simulator"
                          : `${count} simulators (multi-user scenario)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Reserve extra simulators for scenarios with multiple users
                  (e.g. User A shares, User B receives). Ollama Direct always
                  uses one.
                </p>
              </div>

              <div className="rounded-md border border-border bg-background/30 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={preferPhysicalDevices}
                    onChange={(event) =>
                      setPreferPhysicalDevices(event.currentTarget.checked)
                    }
                    className="mt-1 size-4 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      Prefer physical devices
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      Use connected iOS devices first, then simulator fallback if additional devices are needed.
                    </span>
                  </span>
                </label>
              </div>

              {preferPhysicalDevices && (
                <div className="grid gap-2">
                  <Label htmlFor="physical-build">
                    Physical build (.ipa or device .app) — optional
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="physical-build"
                      value={physicalBuildPath}
                      onChange={(e) => setPhysicalBuildPath(e.target.value)}
                      placeholder="/path/to/MyApp.ipa"
                      autoComplete="off"
                      className="font-mono text-xs"
                    />
                    <Button type="button" variant="outline" onClick={pickPhysical}>
                      <FolderOpen /> Browse
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave empty to test the app already installed on the device
                    (e.g. a TestFlight build) — the agent skips install and
                    launches it by the bundle id read from the simulator
                    build&apos;s Info.plist.
                  </p>
                </div>
              )}

              <div className="rounded-md border border-border bg-background/30 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={captureNetwork}
                    onChange={(event) =>
                      setCaptureNetwork(event.currentTarget.checked)
                    }
                    className="mt-1 size-4 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Network className="size-4 text-primary" />
                      Network capture
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      Route simulator app proxy traffic through Testcat for the live Network panel.
                    </span>
                  </span>
                </label>
              </div>

              <div className="grid gap-2">
                <Label>Agent profile</Label>
                {profiles.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background/35 px-3 py-3 text-xs text-muted-foreground">
                    No profiles yet — create one in Agent Profiles first.
                  </p>
                ) : (
                  <Select value={profileId} onValueChange={setProfileId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {p.cli}/{p.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="scn">Scenario</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void enhance()}
                    disabled={!canEnhance}
                    title={
                      enhanceProfileAvailable
                        ? "Rewrite this scenario in clear English"
                        : "Select a default enhance profile in Settings first"
                    }
                  >
                    {enhancing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    {enhancing ? "Enhancing…" : "Enhance scenario"}
                  </Button>
                </div>
                <Textarea
                  id="scn"
                  rows={14}
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  placeholder="Describe what to test, e.g. “Open the app, sign up with a new email, and verify the home screen loads.”"
                  className="min-h-[36vh] resize-y font-mono text-sm leading-relaxed"
                />
              </div>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          </div>

          <aside className="ide-panel flex flex-col rounded-lg border border-border p-5">
            <h2 className="font-heading text-sm font-semibold">Launch preview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The run opens as a parallel workspace tab.
            </p>
            <div className="mt-5 space-y-3">
              <PreviewLine label="Name" value={name || "Untitled test"} />
              <PreviewLine label="Build" value={buildPath || "No build selected"} mono />
              {preferPhysicalDevices && (
                <PreviewLine
                  label="Physical build"
                  value={physicalBuildPath || "No physical build selected"}
                  mono
                />
              )}
              <PreviewLine
                label="Agent"
                value={profile ? `${profile.name} · ${profile.cli}/${profile.model}` : "No profile selected"}
              />
              <PreviewLine
                label="Network"
                value={captureNetwork ? "Capture enabled" : "Capture off"}
              />
            </div>
            <div className="mt-6 space-y-3 border-t border-border pt-5">
              {[
                ["Agent profile", Boolean(profile)],
                ["Scenario prompt", Boolean(scenario.trim())],
                ["Build path", Boolean(buildPath.trim())],
                ...(preferPhysicalDevices && physicalBuildPath.trim()
                  ? [["Physical build", true]]
                  : []),
              ].map(([label, ok]) => (
                <div key={String(label)} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className={ok ? "size-4 text-primary" : "size-4 text-muted-foreground/45"} />
                  <span className="flex-1 text-muted-foreground">{label}</span>
                  <span className={ok ? "font-mono text-[11px] text-primary" : "font-mono text-[11px] text-muted-foreground"}>
                    {ok ? "ready" : "missing"}
                  </span>
                </div>
              ))}
            </div>
            <Button onClick={run} disabled={!canRun} className="mt-auto h-11">
              <Play /> {starting ? "Starting…" : "Run test"}
            </Button>
          </aside>
        </div>

        <DialogFooter className="ide-panel shrink-0 border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={starting}
          >
            Cancel
          </Button>
          <Button onClick={run} disabled={!canRun}>
            <Play /> {starting ? "Starting…" : "Run test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/35 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className={mono ? "mt-2 truncate font-mono text-xs" : "mt-2 truncate text-sm font-medium"}>
        {value}
      </p>
    </div>
  );
}
