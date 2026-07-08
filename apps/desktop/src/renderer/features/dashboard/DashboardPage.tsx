import type { Device, TestRun, TestStatus } from "@testcat/shared";
import {
  Activity,
  ChevronRight,
  FlaskConical,
  Play,
  RefreshCw,
  Search,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import logo from "@/assets/testcat-dark.svg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RunStatusBadge } from "./status";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

function duration(ms?: number | null): string {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

const badStatuses: TestStatus[] = ["failed", "error", "cancelled"];
const SEARCH_RESULT_LIMIT = 8;

export function DashboardPage({
  onNewTest,
  onOpenRun,
}: {
  onNewTest: () => void;
  onOpenRun: (run: TestRun) => void;
}) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const nextRuns = await window.testcat.runsList();
      setRuns(nextRuns);
      setDevices(await window.testcat.devicesList().catch(() => []));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(true), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const stats = useMemo(() => {
    const finished = runs.filter((r) => r.status !== "running" && r.status !== "queued");
    const passed = finished.filter((r) => r.status === "passed").length;
    const failed = runs.filter((r) => badStatuses.includes(r.status)).length;
    const active = runs.filter((r) => r.status === "running" || r.status === "queued").length;
    const durations = finished
      .map((r) => r.durationMs)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    const median = durations.length
      ? durations[Math.floor((durations.length - 1) / 2)]
      : null;

    return {
      passRate: finished.length ? `${Math.round((passed / finished.length) * 100)}%` : "—",
      active,
      failed,
      median: duration(median),
    };
  }, [runs]);

  const recentRuns = runs.slice(0, 5);
  const activeSimulators = useMemo(
    () =>
      devices
        .filter((device) => device.kind !== "physical" && device.isBooted)
        .sort((a, b) => Number(Boolean(b.usage)) - Number(Boolean(a.usage))),
    [devices],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    return normalizedSearchQuery
      ? runs.filter((run) =>
          [
            run.name,
            run.profileName,
            run.cli,
            run.model,
            run.status,
            run.buildPath,
            run.scenario,
            run.result ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearchQuery),
        )
      : runs;
  }, [normalizedSearchQuery, runs]);
  const searchResults = searchMatches.slice(0, SEARCH_RESULT_LIMIT);
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      openSearch();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  return (
    <div data-page-scroll className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-5 py-5">
        <section data-page-reveal className="ide-panel ide-inset overflow-hidden rounded-lg border border-border">
          <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
            <div className="relative min-h-52 overflow-hidden p-6">
              <div className="ide-grid-bg absolute inset-0 opacity-35" />
              <div className="absolute -top-24 right-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative flex max-w-5xl flex-col gap-5">
                <div className="flex items-center gap-3">
                  <img src={logo} alt="" className="size-9 rounded-lg" />
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                      testcat workbench
                    </p>
                    <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                      What do you want to test?
                    </h1>
                  </div>
                </div>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Pick an agent profile, point it at a simulator build, and keep the run visible
                  as a first-class workspace tab while the agent drives the device.
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button size="lg" onClick={onNewTest}>
                    <Play /> New test
                  </Button>
                  <button
                    type="button"
                    onClick={openSearch}
                    className="flex h-10 min-w-72 items-center gap-2 rounded-md border border-input bg-background/55 px-3 text-left text-sm text-muted-foreground transition hover:border-[#383d40] hover:text-foreground"
                  >
                    <Search className="size-4" />
                    Search run history
                    <kbd className="ml-auto rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      /
                    </kbd>
                  </button>
                </div>
              </div>
            </div>
            <div className="border-t border-border bg-background/40 p-5 lg:border-t-0 lg:border-l">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Pass rate" value={stats.passRate} tone="good" />
                <Stat label="Median" value={stats.median} />
                <Stat label="Active" value={String(stats.active)} tone="live" />
                <Stat label="Failed" value={String(stats.failed)} tone={stats.failed ? "bad" : "good"} />
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div data-page-reveal className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm font-medium text-destructive">Couldn’t read the local database.</p>
            <p className="mt-0.5 font-mono text-xs text-destructive/75">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
              <RefreshCw /> Retry
            </Button>
          </div>
        ) : (
          <section className="grid-flow-dense grid gap-4 xl:grid-cols-12 xl:auto-rows-[132px]">
            <Panel className="xl:col-span-6 xl:row-span-2">
              <div className="flex h-full flex-col">
                <PanelHeader
                  icon={TerminalSquare}
                  title="Run command"
                  action={
                    <Button variant="outline" size="sm" onClick={onNewTest}>
                      <Play /> Start
                    </Button>
                  }
                />
                <div className="mt-4 grid flex-1 gap-3 sm:grid-cols-3">
                  <CommandStep label="Profile" value="Claude / Sonnet" />
                  <CommandStep label="Build" value="MyApp.app" />
                  <CommandStep label="Scenario" value="Happy path" />
                </div>
                <div className="tc-scroll-preview mt-4 overflow-hidden rounded-md border border-border bg-background/55">
                  <div className="flex items-center border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    testcat run --profile ios-ui --build MyApp.app
                  </div>
                  <div className="grid grid-cols-[1fr_150px] gap-3 p-3">
                    <div className="space-y-2">
                      <div className="h-2.5 w-5/6 rounded bg-primary/35" />
                      <div className="h-2.5 w-2/3 rounded bg-muted" />
                      <div className="h-2.5 w-4/5 rounded bg-muted" />
                    </div>
                    <div className="rounded border border-primary/20 bg-[#18352d]/70 p-2">
                      <div className="mx-auto h-20 w-10 rounded-[14px] border border-primary/30 bg-background" />
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel className="xl:col-span-6 xl:row-span-2">
              <PanelHeader icon={Activity} title="Active simulators" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {loading ? (
                  <div className="sm:col-span-2">
                    <PanelSkeleton rows={3} />
                  </div>
                ) : activeSimulators.length ? (
                  activeSimulators.slice(0, 6).map((device) => (
                    <ActiveSimulatorTile
                      key={device.udid}
                      device={device}
                      run={runs.find((run) => run.id === device.usage?.runId)}
                      onOpenRun={onOpenRun}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-background/25 px-3 py-8 text-center sm:col-span-2">
                    <p className="text-sm text-muted-foreground">No booted simulators</p>
                  </div>
                )}
              </div>
            </Panel>

            <Panel className="min-h-[340px] xl:col-span-12 xl:row-span-2">
              <div className="flex h-full min-h-0 flex-col">
                <PanelHeader
                  icon={FlaskConical}
                  title={`Recent runs${!loading && recentRuns.length ? ` · ${recentRuns.length}` : ""}`}
                  action={
                    <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                      <RefreshCw /> Refresh
                    </Button>
                  }
                />
                <div
                  data-recent-runs-table
                  className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border"
                >
                  <div className="grid shrink-0 grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(112px,0.7fr)_minmax(80px,0.55fr)_minmax(104px,0.8fr)_40px] border-b border-border bg-background/45 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                    <span className="min-w-0">Test name</span>
                    <span className="min-w-0">Agent</span>
                    <span className="min-w-0">Status</span>
                    <span className="min-w-0">Duration</span>
                    <span className="min-w-0">Started</span>
                    <span />
                  </div>
                  {loading ? (
                    <div className="p-3">
                      <PanelSkeleton rows={5} />
                    </div>
                  ) : recentRuns.length === 0 ? (
                    <div className="grid flex-1 place-items-center px-3 py-8 text-center text-sm text-muted-foreground">
                      No runs yet. Start the first test from the command header.
                    </div>
                  ) : (
                    <div
                      data-recent-runs-body
                      className="min-h-0 flex-1 divide-y divide-border overflow-y-auto"
                    >
                      {recentRuns.map((run) => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => onOpenRun(run)}
                          className="grid w-full grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(112px,0.7fr)_minmax(80px,0.55fr)_minmax(104px,0.8fr)_40px] items-center px-3 py-2.5 text-left text-sm transition hover:bg-accent/35"
                        >
                          <span className="min-w-0 truncate font-medium">{run.name}</span>
                          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                            {run.cli}/{run.model}
                          </span>
                          <span className="min-w-0 overflow-hidden">
                            <RunStatusBadge
                              run={run}
                              showDuration={false}
                              className="max-w-full"
                            />
                          </span>
                          <span className="min-w-0 truncate text-muted-foreground">
                            {duration(run.durationMs)}
                          </span>
                          <span className="min-w-0 truncate text-muted-foreground">
                            {ago(run.createdAt)}
                          </span>
                          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </section>
        )}
      </div>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="font-heading text-base">Search run history</DialogTitle>
            <DialogDescription className="text-xs">
              Find completed and live runs by name, profile, model, build, scenario, or result.
            </DialogDescription>
          </DialogHeader>
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search name, scenario, profile, model"
                className="h-10 pl-9"
              />
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading ? (
              <div className="p-2">
                <PanelSkeleton rows={4} />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                No matching run history.
              </div>
            ) : (
              <div className="space-y-1">
                {searchResults.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      onOpenRun(run);
                    }}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition hover:border-primary/30 hover:bg-[#18352d]/35"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{run.name}</span>
                      <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                        {run.profileName} · {run.cli}/{run.model}
                      </span>
                    </span>
                    <span className="flex min-w-28 flex-col items-end gap-1">
                      <RunStatusBadge run={run} showDuration={false} className="max-w-28" />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {ago(run.createdAt)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {!loading && searchMatches.length > SEARCH_RESULT_LIMIT ? (
            <div className="border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
              Showing {searchResults.length} of {searchMatches.length}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "live";
}) {
  return (
    <div className="rounded-md border border-border bg-card/70 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-xl font-semibold",
          tone === "good" && "text-primary",
          tone === "bad" && "text-destructive",
          tone === "live" && "text-[#ffd47c]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ActiveSimulatorTile({
  device,
  run,
  onOpenRun,
}: {
  device: Device;
  run?: TestRun;
  onOpenRun: (run: TestRun) => void;
}) {
  const inUse = Boolean(device.usage);
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            inUse ? "bg-[#ffd47c]" : "bg-primary",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {device.name}
        </span>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]",
            inUse
              ? "border-[#ffd47c]/35 bg-[#3a2d13]/50 text-[#ffd47c]"
              : "border-primary/25 bg-primary/10 text-primary",
          )}
        >
          {inUse ? "in-use" : "free"}
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
        {device.runtime} · {device.udid}
      </p>
      {device.usage ? (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {device.usage.runName}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Available for next run</p>
      )}
    </>
  );

  if (run) {
    return (
      <button
        type="button"
        onClick={() => onOpenRun(run)}
        className="group w-full rounded-md border border-border bg-background/35 p-3 text-left transition hover:border-primary/40 hover:bg-[#18352d]/35"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background/35 p-3">
      {content}
    </div>
  );
}

function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-page-reveal className={cn("ide-panel ide-inset rounded-lg border border-border p-4", className)}>
      {children}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Activity;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid size-8 place-items-center rounded-md border border-border bg-background/55 text-primary">
        <Icon className="size-4" />
      </div>
      <h2 className="min-w-0 flex-1 truncate font-heading text-sm font-semibold tracking-tight">
        {title}
      </h2>
      {action}
    </div>
  );
}

function CommandStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/35 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-muted/65" />
      ))}
    </div>
  );
}
