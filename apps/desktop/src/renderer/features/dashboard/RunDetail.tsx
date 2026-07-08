import type {
  AgentEvent,
  AgentProfile,
  AppBundleInfo,
  RunDoneMessage,
  RunMediaAsset,
  TestRun,
} from "@testcat/shared";
import {
  Activity,
  ArrowLeft,
  Box,
  Clock3,
  Copy,
  Cpu,
  CreditCard,
  FileCode2,
  ImageIcon,
  Package,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Square,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NewTestDraft as Draft } from "@/features/run/NewTestDialog";
import { ChatPane } from "@/features/run/ChatPane";
import { cn } from "@/lib/utils";
import { summarizeRunDevices } from "./device-insights";
import { RunStatusBadge } from "./status";

interface Props {
  runId: string;
  onBack: () => void;
  onDeleted: () => void;
  onConfigureRerun: (draft: Draft) => void;
  onRerunStarted: (
    runId: string,
    meta: {
      name: string;
      cli: string;
      profileName?: string;
      deviceBaselineUdids?: string[];
    },
  ) => void;
}

type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usageEvents: number;
  estimatedCostUsd: number | null;
  pricingLabel: string;
};

type EventSummary = {
  text: number;
  thinking: number;
  toolUse: number;
  toolResult: number;
  errors: number;
  usage: number;
  status: number;
};

const TERMINAL_STATUSES = new Set(["passed", "failed", "error", "cancelled"]);

const TOKEN_PRICES_PER_MILLION: Record<
  string,
  { input: number; output: number; label: string }
> = {
  opus: { input: 15, output: 75, label: "Claude Opus rough public-rate estimate" },
  sonnet: { input: 3, output: 15, label: "Claude Sonnet rough public-rate estimate" },
  haiku: { input: 0.8, output: 4, label: "Claude Haiku rough public-rate estimate" },
  "gpt-5-codex": { input: 1.25, output: 10, label: "Codex rough estimate" },
  "gpt-5.5": { input: 1.25, output: 10, label: "Codex rough estimate" },
};

const isActive = (run: TestRun) => run.status === "running" || run.status === "queued";

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString() : "-";

const formatDateMs = (ms?: number | null) =>
  ms == null ? "-" : new Date(ms).toLocaleString();

const formatDuration = (ms?: number | null) => {
  if (ms == null) return "-";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatBytes = (bytes?: number | null) => {
  if (bytes == null) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};

const formatMoney = (value: number | null) =>
  value == null
    ? "-"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: value < 0.01 ? 4 : 2,
        maximumFractionDigits: value < 0.01 ? 4 : 2,
      }).format(value);

const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);

const profileNotFound = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("404") || message.includes("not_found");
};

function priceFor(model: string, cli: TestRun["cli"]) {
  if (cli === "ollama") return { input: 0, output: 0, label: "Ollama Direct local model" };
  if (cli === "opencode" && model.startsWith("ollama/")) {
    return { input: 0, output: 0, label: "opencode via local Ollama model" };
  }
  const normalized = model.toLowerCase();
  for (const [needle, price] of Object.entries(TOKEN_PRICES_PER_MILLION)) {
    if (normalized.includes(needle)) return price;
  }
  if (cli === "claude" && normalized.includes("opus")) return TOKEN_PRICES_PER_MILLION.opus;
  if (cli === "claude" && normalized.includes("sonnet")) return TOKEN_PRICES_PER_MILLION.sonnet;
  if (cli === "claude" && normalized.includes("haiku")) return TOKEN_PRICES_PER_MILLION.haiku;
  return null;
}

function summarizeUsage(events: AgentEvent[], run: TestRun | null): UsageSummary {
  const usageEvents = events.filter((event) => event.type === "usage");
  const inputTokens = usageEvents.reduce((sum, event) => sum + event.inputTokens, 0);
  const outputTokens = usageEvents.reduce((sum, event) => sum + event.outputTokens, 0);
  const price = run ? priceFor(run.model, run.cli) : null;
  const estimatedCostUsd = price
    ? (inputTokens / 1_000_000) * price.input +
      (outputTokens / 1_000_000) * price.output
    : null;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    usageEvents: usageEvents.length,
    estimatedCostUsd,
    pricingLabel: price?.label ?? "No local pricing heuristic for this model",
  };
}

function summarizeEvents(events: AgentEvent[]): EventSummary {
  return events.reduce<EventSummary>(
    (summary, event) => {
      if (event.type === "text_delta") summary.text += 1;
      else if (event.type === "thinking_delta") summary.thinking += 1;
      else if (event.type === "tool_use") summary.toolUse += 1;
      else if (event.type === "tool_result") {
        summary.toolResult += 1;
        if (!event.ok) summary.errors += 1;
      } else if (event.type === "usage") summary.usage += 1;
      else if (event.type === "status") summary.status += 1;
      return summary;
    },
    { text: 0, thinking: 0, toolUse: 0, toolResult: 0, errors: 0, usage: 0, status: 0 },
  );
}

/** Past or in-flight run detail: insights, configuration, actions, and replay. */
export function RunDetail({
  runId,
  onBack,
  onDeleted,
  onConfigureRerun,
  onRerunStarted,
}: Props) {
  const [run, setRun] = useState<TestRun | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [media, setMedia] = useState<RunMediaAsset[]>([]);
  const [appInfo, setAppInfo] = useState<AppBundleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [missingProfileOpen, setMissingProfileOpen] = useState(false);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [replacementProfileId, setReplacementProfileId] = useState("");
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementStarting, setReplacementStarting] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<RunMediaAsset | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, e] = await Promise.all([
        window.testcat.runsGet(runId),
        window.testcat.runsEvents(runId),
      ]);
      setRun(r);
      setEvents(e);
      setMediaError(null);
      setMedia(await window.testcat.runMediaList(runId));
      setAppInfo(
        r.buildPath ? await window.testcat.appInspect(r.buildPath) : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!run || !isActive(run)) return undefined;
    const interval = window.setInterval(() => {
      void refresh();
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [refresh, run]);

  const done: RunDoneMessage | null = run
    ? {
        runId: run.id,
        status: run.status,
        result: run.result,
        durationMs: run.durationMs ?? 0,
        timestamp: run.finishedAt ?? undefined,
      }
    : null;

  const usage = useMemo(() => summarizeUsage(events, run), [events, run]);
  const eventSummary = useMemo(() => summarizeEvents(events), [events]);
  const deviceInsights = useMemo(
    () => (run ? summarizeRunDevices(run, events) : []),
    [events, run],
  );
  const elapsedMs = run
    ? run.durationMs ??
      (run.startedAt && isActive(run)
        ? Date.now() - new Date(run.startedAt).getTime()
        : null)
    : null;

  const loadReplacementProfiles = async () => {
    setMissingProfileOpen(true);
    setReplacementLoading(true);
    setReplacementError(null);
    try {
      const nextProfiles = await window.testcat.profilesList();
      setProfiles(nextProfiles);
      setReplacementProfileId(nextProfiles[0]?.id ?? "");
    } catch (err) {
      setReplacementError(err instanceof Error ? err.message : String(err));
      setProfiles([]);
      setReplacementProfileId("");
    } finally {
      setReplacementLoading(false);
    }
  };

  const stop = async () => {
    if (!run) return;
    setStopping(true);
    try {
      await window.testcat.runCancel(run.id);
      await refresh();
    } finally {
      setStopping(false);
    }
  };

  const startRerun = async (profileId: string) => {
    if (!run) return;
    const { runId: nextRunId, deviceBaselineUdids } = await window.testcat.runStart({
      name: run.name,
      buildPath: run.buildPath,
      physicalBuildPath: run.physicalBuildPath,
      preferPhysicalDevices: run.devicePreference === "preferPhysical",
      scenario: run.scenario,
      profileId,
      lastSuccessRunId: run.id,
    });
    const selectedProfile = profiles.find((profile) => profile.id === profileId);
    onRerunStarted(nextRunId, {
      name: run.name,
      cli: selectedProfile?.cli ?? run.cli,
      profileName: selectedProfile?.name ?? run.profileName,
      deviceBaselineUdids,
    });
  };

  const rerun = async () => {
    if (!run) return;
    setRerunning(true);
    setRerunError(null);
    try {
      if (!run.profileId) {
        await loadReplacementProfiles();
        return;
      }

      try {
        await window.testcat.profilesGet(run.profileId);
      } catch (err) {
        if (profileNotFound(err)) {
          await loadReplacementProfiles();
          return;
        }
        throw err;
      }

      const profileSnapshot = {
        name: run.profileName || `${run.cli}/${run.model}`,
        cli: run.cli,
        model: run.model,
        reasoning: run.reasoning,
        skills: run.profileSkills ?? [],
        systemPrompt: run.profileSystemPrompt ?? "",
      };
      const { runId: nextRunId, deviceBaselineUdids } =
        await window.testcat.runStart({
          name: run.name,
          buildPath: run.buildPath,
          physicalBuildPath: run.physicalBuildPath,
          preferPhysicalDevices: run.devicePreference === "preferPhysical",
          scenario: run.scenario,
          profileId: run.profileId,
          profileSnapshot,
          lastSuccessRunId: run.id,
        });
      onRerunStarted(nextRunId, {
        name: run.name,
        cli: run.cli,
        profileName: run.profileName,
        deviceBaselineUdids,
      });
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRerunning(false);
    }
  };

  const configureRerun = () => {
    if (!run) return;
    onConfigureRerun({
      name: run.name,
      buildPath: run.buildPath,
      physicalBuildPath: run.physicalBuildPath,
      preferPhysicalDevices: run.devicePreference === "preferPhysical",
      profileId: run.profileId,
      scenario: run.scenario,
    });
  };

  const rerunWithReplacement = async () => {
    if (!replacementProfileId) return;
    setReplacementStarting(true);
    setReplacementError(null);
    try {
      await startRerun(replacementProfileId);
      setMissingProfileOpen(false);
    } catch (err) {
      setReplacementError(err instanceof Error ? err.message : String(err));
    } finally {
      setReplacementStarting(false);
    }
  };

  const deleteRun = async () => {
    if (!run) return;
    setDeleting(true);
    try {
      if (isActive(run)) await window.testcat.runCancel(run.id).catch(() => undefined);
      await window.testcat.runsDelete(run.id);
      setDeleteOpen(false);
      onDeleted();
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const deleteMedia = async (asset: RunMediaAsset) => {
    setDeletingMediaId(asset.id);
    setMediaError(null);
    try {
      await window.testcat.runMediaDelete({ runId: runId, mediaId: asset.id });
      setMedia((prev) => prev.filter((item) => item.id !== asset.id));
      setPreviewMedia((current) => (current?.id === asset.id ? null : current));
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingMediaId(null);
    }
  };

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading run…</p>;
  }

  if (error || !run) {
    return (
      <div className="m-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="text-sm font-medium text-destructive">
          Couldn’t load this run.
        </p>
        <p className="mt-0.5 font-mono text-xs text-destructive/70">
          {error ?? "Run not found."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 active:translate-y-px"
          onClick={() => void refresh()}
        >
          <RefreshCw /> Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <header data-page-reveal className="ide-panel flex items-center gap-3 border-b border-border px-4 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-sm font-semibold tracking-tight">
              {run.name || "Test run"}
            </h1>
            <span className="font-mono text-[11px] text-muted-foreground">
              {run.cli}/{run.model} · {formatDate(run.createdAt)}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isActive(run) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void stop()}
                disabled={stopping}
              >
                <Square className="size-3.5" /> {stopping ? "Stopping…" : "Stop"}
              </Button>
            )}
            <RunStatusBadge run={run} />
          </div>
        </header>

        <div data-page-scroll className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-4 px-5 py-5">
            <section data-page-reveal className="ide-panel ide-inset rounded-lg border border-border">
              <div className="flex flex-wrap items-start gap-4 border-b border-border p-4">
                <div className="grid size-10 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                  <Activity className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading text-lg font-semibold tracking-tight">
                    Run insights
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    A single place for run health, configuration, app bundle metadata, agent usage, and replayed output.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refresh()}>
                  <RefreshCw /> Refresh
                </Button>
              </div>

              <div className="grid gap-px bg-border md:grid-cols-4">
                <InsightMetric label="Duration" value={formatDuration(elapsedMs)} icon={Clock3} />
                <InsightMetric label="Total tokens" value={compact(usage.totalTokens)} icon={Cpu} />
                <InsightMetric label="Estimated cost" value={formatMoney(usage.estimatedCostUsd)} icon={CreditCard} />
                <InsightMetric label="Tool calls" value={String(eventSummary.toolUse)} icon={FileCode2} tone={eventSummary.errors ? "bad" : "default"} />
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
              <div className="flex min-w-0 flex-col gap-4">
                <section className="grid gap-4 lg:grid-cols-2">
                  <Panel title="Configuration" icon={Settings2}>
                    <div className="grid gap-3">
                      <InfoLine label="Run id" value={run.id} mono copyable />
                      <InfoLine label="Name" value={run.name} />
                      <InfoLine label="Profile" value={run.profileName || "Snapshot only"} />
                      <InfoLine label="Profile id" value={run.profileId ?? "Missing / deleted"} mono />
                      <InfoLine label="Build path" value={run.buildPath || "No build path"} mono copyable />
                      <InfoLine label="Created" value={formatDate(run.createdAt)} />
                      <InfoLine label="Started" value={formatDate(run.startedAt)} />
                      <InfoLine label="Finished" value={formatDate(run.finishedAt)} />
                    </div>
                  </Panel>

                  <Panel title="App bundle" icon={Package}>
                    <div className="grid gap-3">
                      <InfoLine label="App name" value={appInfo?.displayName ?? appInfo?.name ?? "-"} />
                      <InfoLine label="Bundle id" value={appInfo?.bundleIdentifier ?? "-"} mono />
                      <InfoLine label="Version" value={appInfo?.version ?? "-"} />
                      <InfoLine label="Build" value={appInfo?.build ?? "-"} />
                      <InfoLine label="Executable" value={appInfo?.executable ?? "-"} mono />
                      <InfoLine label="Bundle size" value={formatBytes(appInfo?.sizeBytes)} />
                      {appInfo?.error && (
                        <p className="rounded-md border border-chart-5/25 bg-chart-5/10 px-3 py-2 text-xs text-chart-5">
                          {appInfo.error}
                        </p>
                      )}
                    </div>
                  </Panel>
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <Panel title="Agent usage" icon={Cpu}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoLine label="CLI" value={run.cli} mono />
                      <InfoLine label="Model" value={run.model} mono />
                      <InfoLine label="Reasoning" value={run.reasoning} mono />
                      <InfoLine label="Usage events" value={String(usage.usageEvents)} mono />
                      <InfoLine label="Input tokens" value={usage.inputTokens.toLocaleString()} mono />
                      <InfoLine label="Output tokens" value={usage.outputTokens.toLocaleString()} mono />
                      <InfoLine label="Total tokens" value={usage.totalTokens.toLocaleString()} mono />
                      <InfoLine label="Cost estimate" value={formatMoney(usage.estimatedCostUsd)} mono />
                    </div>
                    <p className="mt-3 rounded-md border border-border bg-background/35 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {usage.pricingLabel}. This is an estimate from token usage events, not a billing source of truth.
                    </p>
                  </Panel>

                  <Panel title="Event breakdown" icon={Box}>
                    <div className="grid grid-cols-2 gap-2">
                      <Breakdown label="Text" value={eventSummary.text} />
                      <Breakdown label="Thinking" value={eventSummary.thinking} />
                      <Breakdown label="Tool use" value={eventSummary.toolUse} />
                      <Breakdown label="Tool result" value={eventSummary.toolResult} />
                      <Breakdown label="Errors" value={eventSummary.errors} tone={eventSummary.errors ? "bad" : "default"} />
                      <Breakdown label="Status" value={eventSummary.status} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {(run.profileSkills ?? []).length ? (
                        run.profileSkills.map((skill) => (
                          <Badge key={skill} variant="outline" className="font-mono">
                            {skill}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No skills snapshotted.</span>
                      )}
                    </div>
                  </Panel>
                </section>

                <Panel title="Scenario prompt" icon={FileCode2}>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(run.scenario)}
                      className="absolute top-2 right-2 grid size-7 place-items-center rounded border border-border/70 bg-background/80 text-muted-foreground shadow-sm transition hover:border-primary/35 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Copy scenario prompt"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background/45 p-3 pr-12 text-xs leading-relaxed text-foreground/85">
                      {run.scenario || "-"}
                    </pre>
                  </div>
                </Panel>

                <Panel title="Agent output replay" icon={Activity}>
                  <div className="flex h-[560px] min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background/30">
                    <ChatPane events={events} done={done} />
                  </div>
                </Panel>
              </div>

              <aside className="flex min-w-0 flex-col gap-4">
                <Panel title="Actions" icon={RotateCcw}>
                  <div className="grid gap-2">
                    <Button onClick={() => void rerun()} disabled={rerunning}>
                      <Play /> {rerunning ? "Starting…" : "Re-run"}
                    </Button>
                    <Button variant="outline" onClick={configureRerun}>
                      <Settings2 /> Configure and re-run
                    </Button>
                    {isActive(run) && (
                      <Button variant="outline" onClick={() => void stop()} disabled={stopping}>
                        <Square /> {stopping ? "Stopping…" : "Stop run"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 /> Delete run
                    </Button>
                  </div>
                  {rerunError && (
                    <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
                      {rerunError}
                    </p>
                  )}
                </Panel>

                <Panel title="Result" icon={Activity}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <RunStatusBadge run={run} />
                    </div>
                    <p className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background/45 p-3 text-xs leading-relaxed text-foreground/85">
                      {run.result || (TERMINAL_STATUSES.has(run.status) ? "No result captured." : "Run is still in progress.")}
                    </p>
                  </div>
                </Panel>

                <Panel title="Test media" icon={ImageIcon}>
                  {mediaError && (
                    <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
                      {mediaError}
                    </p>
                  )}
                  {media.length ? (
                    <div className="grid grid-cols-2 gap-2">
                      {media.map((asset) => (
                        <div
                          key={asset.id}
                          className="relative overflow-hidden rounded-md border border-border bg-background/35"
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewMedia(asset)}
                            className="group block w-full text-left focus:outline-none focus:ring-2 focus:ring-primary/60"
                          >
                            <span className="block bg-black">
                              <img
                                src={asset.dataUrl}
                                alt={`${asset.device.name ?? "Simulator"} screenshot`}
                                className="block aspect-[9/19.5] w-full object-contain transition duration-150 group-hover:scale-[1.02]"
                              />
                            </span>
                            <span className="grid gap-0.5 px-2 py-1.5">
                              <span
                                className="truncate text-[11px] font-medium"
                                title={`${asset.device.name ?? "Simulator"} (${asset.device.udid})`}
                              >
                                {asset.device.name ?? "Simulator"}
                              </span>
                              <span className="truncate font-mono text-[9px] text-muted-foreground">
                                {formatDate(asset.createdAt)}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteMedia(asset)}
                            disabled={deletingMediaId === asset.id}
                            aria-label="Delete media"
                            className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded border border-destructive/30 bg-background/85 text-destructive shadow-sm transition hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No screenshots captured for this run.
                    </p>
                  )}
                </Panel>

                <Panel title="Devices" icon={Package}>
                  {deviceInsights.length ? (
                    <div className="grid min-w-0 gap-2">
                      {deviceInsights.map((device) => (
                        <div
                          key={device.udid}
                          className="min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-background/35 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className="truncate text-sm font-medium"
                                title={`${device.name} (${device.udid})`}
                              >
                                {device.name}
                              </p>
                              <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                                {device.udid}
                              </p>
                            </div>
                            <Badge
                              variant={device.bootedDuringRun ? "accent" : "outline"}
                              className="shrink-0"
                            >
                              {device.bootedDuringRun ? "opened" : "used"}
                            </Badge>
                          </div>

                          <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                            <DeviceStat label="Runtime" value={device.runtime || "-"} />
                            <DeviceStat
                              label={device.bootedDuringRun ? "Open" : "Observed"}
                              value={
                                device.activeMs == null
                                  ? "-"
                                  : `${formatDuration(device.activeMs)}${
                                      device.timing === "estimated" ? " approx" : ""
                                    }`
                              }
                            />
                            <DeviceStat
                              label="First seen"
                              value={formatDateMs(device.firstSeenAtMs)}
                            />
                            <DeviceStat
                              label="Last activity"
                              value={formatDateMs(device.lastSeenAtMs)}
                            />
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {device.bootedDuringRun && (
                              <Badge variant="outline">boot</Badge>
                            )}
                            {device.installedDuringRun && (
                              <Badge variant="outline">install</Badge>
                            )}
                            {device.launchedDuringRun && (
                              <Badge variant="outline">launch</Badge>
                            )}
                            {device.terminatedDuringRun && (
                              <Badge variant="outline">terminate</Badge>
                            )}
                            <Badge variant="outline">
                              {device.commandCount} command
                              {device.commandCount === 1 ? "" : "s"}
                            </Badge>
                            {device.timing === "estimated" && (
                              <Badge variant="outline">estimated timing</Badge>
                            )}
                          </div>

                          {device.commands.length > 0 && (
                            <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
                              {device.commands.join(" -> ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No simulator usage was detected for this run.
                    </p>
                  )}
                </Panel>
              </aside>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(previewMedia)}
        onOpenChange={(open) => {
          if (!open) setPreviewMedia(null);
        }}
      >
        <DialogContent
          fullScreen
          showCloseButton={false}
          className="bg-background/95 p-0"
        >
          {previewMedia && (
            <>
              <DialogHeader className="shrink-0 border-b border-border bg-card/80 px-5 py-4 text-left">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <DialogTitle className="truncate font-heading text-base">
                      {previewMedia.device.name ?? "Simulator"} screenshot
                    </DialogTitle>
                    <DialogDescription className="truncate font-mono text-[11px]">
                      {formatDate(previewMedia.createdAt)} ·{" "}
                      {formatBytes(previewMedia.sizeBytes)} ·{" "}
                      {previewMedia.device.udid}
                    </DialogDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void deleteMedia(previewMedia)}
                      disabled={deletingMediaId === previewMedia.id}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 /> Delete
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setPreviewMedia(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </DialogHeader>
              <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-black p-4">
                <img
                  src={previewMedia.dataUrl}
                  alt={`${previewMedia.device.name ?? "Simulator"} screenshot full preview`}
                  className="max-h-full max-w-full rounded-md border border-white/10 object-contain shadow-2xl"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete run</DialogTitle>
            <DialogDescription>
              This deletes the run and its stored event replay. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteRun()}
              disabled={deleting}
            >
              <Trash2 /> {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={missingProfileOpen} onOpenChange={setMissingProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Missing agent profile</DialogTitle>
            <DialogDescription>
              The original agent profile for this run no longer exists. Select another existing profile to re-run the same test scenario.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {run.profileId && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Original profile id
                </p>
                <p className="mt-1 truncate font-mono text-xs">{run.profileId}</p>
              </div>
            )}

            {replacementLoading ? (
              <p className="text-sm text-muted-foreground">Loading agent profiles…</p>
            ) : profiles.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Replacement profile</p>
                <Select value={replacementProfileId} onValueChange={setReplacementProfileId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name} · {profile.cli}/{profile.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-background/35 px-3 py-3 text-sm text-muted-foreground">
                No agent profiles are available. Create one in Agent Profiles, then try re-run again.
              </p>
            )}

            {replacementError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
                {replacementError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMissingProfileOpen(false)} disabled={replacementStarting}>
              Cancel
            </Button>
            <Button onClick={() => void rerunWithReplacement()} disabled={replacementLoading || replacementStarting || !replacementProfileId}>
              <Play /> {replacementStarting ? "Starting…" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section data-page-reveal className="ide-panel rounded-lg border border-border bg-card/45 p-4">
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
        <div className="grid size-7 place-items-center rounded-md border border-border bg-background/45 text-primary">
          <Icon className="size-3.5" />
        </div>
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DeviceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-border bg-background/40 px-2 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-xs text-foreground/85" title={value}>
        {value}
      </p>
    </div>
  );
}

function InsightMetric({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "bad";
}) {
  return (
    <div className="bg-card/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <Icon className={cn("size-4", tone === "bad" ? "text-destructive" : "text-primary")} />
      </div>
      <p className="mt-3 font-mono text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function InfoLine({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const copy = () => void navigator.clipboard?.writeText(value);
  return (
    <div className="min-w-0 rounded-md border border-border bg-background/35 px-3 py-2">
      <div className="flex items-center gap-2">
        <p className="flex-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {copyable && value && value !== "-" && (
          <button type="button" onClick={copy} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Copy ${label}`}>
            <Copy className="size-3" />
          </button>
        )}
      </div>
      <p className={cn("mt-1.5 truncate text-sm text-foreground/85", mono && "font-mono text-xs")}>{value || "-"}</p>
    </div>
  );
}

function Breakdown({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "bad";
}) {
  return (
    <div className="rounded-md border border-border bg-background/35 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", tone === "bad" && "text-destructive")}>{value}</p>
    </div>
  );
}
