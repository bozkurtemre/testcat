import type { AgentCli, TestRun, TestStatus } from "@testcat/shared";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Filter,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RunStatusBadge } from "./status";

type StatusFilter =
  | "all"
  | "active"
  | "problem"
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "error"
  | "cancelled";
type CliFilter = "all" | AgentCli;
type RangeFilter = "all" | "24h" | "7d" | "30d";
type SortMode = "newest" | "oldest" | "duration-desc" | "duration-asc" | "name";
type StartedRun = {
  runId: string;
  name: string;
  cli: AgentCli;
  profileName?: string;
  deviceBaselineUdids?: string[];
};

const problemStatuses: TestStatus[] = ["failed", "error", "cancelled"];
const PAGE_SIZE = 10;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), "hour");
  return rtf.format(-Math.round(seconds / 86400), "day");
}

function duration(ms?: number | null): string {
  if (ms == null) return "-";
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function rangeCutoff(range: RangeFilter): number | null {
  if (range === "24h") return Date.now() - 24 * 60 * 60 * 1000;
  if (range === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (range === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function matchesStatus(run: TestRun, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "active") return run.status === "running" || run.status === "queued";
  if (status === "problem") return problemStatuses.includes(run.status);
  return run.status === status;
}

export function RunHistoryPage({
  pageIndex,
  onPageIndexChange,
  onOpenRun,
  onRunsStarted,
  onRunsDeleted,
}: {
  pageIndex: number;
  onPageIndexChange: (pageIndex: number) => void;
  onOpenRun: (run: TestRun) => void;
  onRunsStarted: (runs: StartedRun[]) => void;
  onRunsDeleted: (runIds: string[]) => void;
}) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [cli, setCli] = useState<CliFilter>("all");
  const [range, setRange] = useState<RangeFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const filtersReadyRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(await window.testcat.runsList());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredRuns = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = rangeCutoff(range);
    const visible = runs.filter((run) => {
      if (!matchesStatus(run, status)) return false;
      if (cli !== "all" && run.cli !== cli) return false;
      if (cutoff && new Date(run.createdAt).getTime() < cutoff) return false;
      if (!q) return true;
      return [
        run.name,
        run.buildPath,
        run.scenario,
        run.cli,
        run.model,
        run.profileName,
        run.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });

    return [...visible].sort((a, b) => {
      if (sort === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sort === "duration-desc") {
        return (b.durationMs ?? -1) - (a.durationMs ?? -1);
      }
      if (sort === "duration-asc") {
        return (a.durationMs ?? Number.MAX_SAFE_INTEGER) - (b.durationMs ?? Number.MAX_SAFE_INTEGER);
      }
      if (sort === "name") return a.name.localeCompare(b.name);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [cli, query, range, runs, sort, status]);

  const stats = useMemo(() => {
    const finished = runs.filter((run) => run.status !== "running" && run.status !== "queued");
    const passed = finished.filter((run) => run.status === "passed").length;
    return {
      total: runs.length,
      visible: filteredRuns.length,
      active: runs.filter((run) => run.status === "running" || run.status === "queued").length,
      problems: runs.filter((run) => problemStatuses.includes(run.status)).length,
      passRate: finished.length ? `${Math.round((passed / finished.length) * 100)}%` : "-",
    };
  }, [filteredRuns.length, runs]);

  const hasFilters =
    query || status !== "all" || cli !== "all" || range !== "all" || sort !== "newest";
  const pageCount = Math.max(1, Math.ceil(filteredRuns.length / PAGE_SIZE));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = filteredRuns.length ? currentPageIndex * PAGE_SIZE : 0;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filteredRuns.length);
  const pagedRuns = filteredRuns.slice(pageStart, pageEnd);
  const selectedRuns = useMemo(
    () => filteredRuns.filter((run) => selectedIds.has(run.id)),
    [filteredRuns, selectedIds],
  );
  const selectedCount = selectedRuns.length;
  const allVisibleSelected =
    pagedRuns.length > 0 && pagedRuns.every((run) => selectedIds.has(run.id));
  const someVisibleSelected =
    !allVisibleSelected && pagedRuns.some((run) => selectedIds.has(run.id));
  const bulkBusy = bulkDeleting || bulkRunning;

  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setCli("all");
    setRange("all");
    setSort("newest");
  };

  useEffect(() => {
    if (!filtersReadyRef.current) {
      filtersReadyRef.current = true;
      return;
    }
    onPageIndexChange(0);
  }, [cli, onPageIndexChange, query, range, sort, status]);

  useEffect(() => {
    if (!loading && pageIndex > pageCount - 1) onPageIndexChange(pageCount - 1);
  }, [loading, onPageIndexChange, pageCount, pageIndex]);

  useEffect(() => {
    const visibleIds = new Set(filteredRuns.map((run) => run.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRuns]);

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const toggleRunSelection = (runId: string, checked: boolean) => {
    setBulkError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(runId);
      else next.delete(runId);
      return next;
    });
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setBulkError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const run of pagedRuns) {
        if (checked) next.add(run.id);
        else next.delete(run.id);
      }
      return next;
    });
  };

  const activateRunRow = (run: TestRun) => {
    if (selectedIds.size > 0) {
      if (bulkBusy) return;
      toggleRunSelection(run.id, !selectedIds.has(run.id));
      return;
    }
    onOpenRun(run);
  };

  const startSelectedRuns = async () => {
    if (!selectedRuns.length) return;
    setBulkRunning(true);
    setBulkError(null);
    try {
      const started: StartedRun[] = [];
      for (const run of selectedRuns) {
        const { runId, deviceBaselineUdids } = await window.testcat.runStart({
          name: run.name,
          buildPath: run.buildPath,
          physicalBuildPath: run.physicalBuildPath,
          preferPhysicalDevices: run.devicePreference === "preferPhysical",
          scenario: run.scenario,
          profileId: run.profileId ?? undefined,
          lastSuccessRunId: run.id,
          profileSnapshot: {
            name: run.profileName || `${run.cli}/${run.model}`,
            cli: run.cli,
            model: run.model,
            reasoning: run.reasoning,
            skills: run.profileSkills,
            systemPrompt: run.profileSystemPrompt,
          },
        });
        started.push({
          runId,
          name: run.name,
          cli: run.cli,
          profileName: run.profileName,
          deviceBaselineUdids,
        });
      }
      clearSelection();
      await refresh();
      setBulkRunning(false);
      onRunsStarted(started);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
      setBulkRunning(false);
    }
  };

  const deleteSelectedRuns = async () => {
    if (!selectedRuns.length) return;
    setBulkDeleting(true);
    setBulkError(null);
    try {
      const deletedIds: string[] = [];
      for (const run of selectedRuns) {
        if (run.status === "running" || run.status === "queued") {
          await window.testcat.runCancel(run.id).catch(() => undefined);
        }
        await window.testcat.runsDelete(run.id);
        deletedIds.push(run.id);
      }
      setDeleteOpen(false);
      clearSelection();
      await refresh();
      onRunsDeleted(deletedIds);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div data-page-scroll className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-5 py-5">
        <section data-page-reveal className="ide-panel ide-inset rounded-lg border border-border">
          <div className="flex flex-wrap items-start gap-4 border-b border-border p-4">
            <div className="grid size-10 place-items-center rounded-md border border-border bg-background/55 text-primary">
              <CalendarClock className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-xl font-semibold tracking-tight">
                Recent runs
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Inspect every test run with search, status filters, and sortable history.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw className={cn(loading && "animate-spin")} /> Refresh
            </Button>
          </div>

          <div className="grid gap-2 border-b border-border bg-background/25 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_170px_150px_150px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, build, scenario, model"
                className="pl-9"
              />
            </div>

            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="problem">Failed / error</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cli} onValueChange={(value) => setCli(value as CliFilter)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All CLIs</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="codex">Codex</SelectItem>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="opencode">opencode</SelectItem>
              </SelectContent>
            </Select>

            <Select value={range} onValueChange={(value) => setRange(value as RangeFilter)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="duration-desc">Duration high</SelectItem>
                <SelectItem value="duration-asc">Duration low</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="justify-start xl:justify-center"
            >
              <X /> Clear
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-5">
            <Stat label="Visible" value={`${stats.visible}/${stats.total}`} />
            <Stat label="Active" value={String(stats.active)} tone="live" />
            <Stat label="Problems" value={String(stats.problems)} tone={stats.problems ? "bad" : "good"} />
            <Stat label="Pass rate" value={stats.passRate} tone="good" />
            <Stat label="Sort" value={sortLabel(sort)} />
          </div>
        </section>

        <section data-page-reveal className="ide-panel ide-inset flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Filter className="size-4 text-primary" />
            <h2 className="min-w-0 flex-1 font-heading text-sm font-semibold">
              Run table
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedCount > 0 ? (
                <>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {selectedCount} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void startSelectedRuns()}
                    disabled={bulkBusy}
                  >
                    <Play /> {bulkRunning ? "Starting" : "Run selected"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                    disabled={bulkBusy}
                    className="border-destructive/30 text-destructive hover:border-destructive/45 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 /> Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    disabled={bulkBusy}
                  >
                    <X /> Clear
                  </Button>
                </>
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {filteredRuns.length ? `${pageStart + 1}-${pageEnd} of ${filteredRuns.length}` : "0 rows"}
                </span>
              )}
            </div>
          </div>

          {bulkError ? (
            <div className="border-b border-destructive/25 bg-destructive/5 px-4 py-2 font-mono text-xs text-destructive">
              {bulkError}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[1200px]">
              <div className="grid grid-cols-[44px_minmax(220px,1.35fr)_130px_170px_170px_96px_160px_minmax(170px,1fr)_44px] items-center border-b border-border bg-background/45 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <span className="grid place-items-center">
                  <SelectionCheckbox
                    ariaLabel="Select all visible runs"
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    disabled={pagedRuns.length === 0 || bulkBusy}
                    onChange={toggleVisibleSelection}
                  />
                </span>
                <span>Test</span>
                <span>Status</span>
                <span>Agent</span>
                <span>Profile</span>
                <span>Duration</span>
                <span>Started</span>
                <span>Build</span>
                <span />
              </div>

              {loading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-md bg-muted/60" />
                  ))}
                </div>
              ) : error ? (
                <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <p className="text-sm font-medium text-destructive">
                    Couldn’t load run history.
                  </p>
                  <p className="mt-1 font-mono text-xs text-destructive/75">
                    {error}
                  </p>
                </div>
              ) : filteredRuns.length === 0 ? (
                <div className="grid min-h-80 place-items-center px-6 py-10 text-center">
                  <div>
                    <p className="text-sm font-medium">No runs match these filters.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Clear filters or start a new test from the dashboard.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {pagedRuns.map((run) => (
                    <div
                      key={run.id}
                      onClick={() => activateRunRow(run)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          activateRunRow(run);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={
                        selectedIds.size > 0
                          ? `Toggle selection for ${run.name}`
                          : `Open ${run.name}`
                      }
                      aria-selected={selectedIds.has(run.id)}
                      className={cn(
                        "grid w-full cursor-pointer grid-cols-[44px_minmax(220px,1.35fr)_130px_170px_170px_96px_160px_minmax(170px,1fr)_44px] items-center px-3 py-2.5 text-left text-sm transition hover:bg-accent/35 focus-visible:bg-accent/35 focus-visible:outline-none",
                        selectedIds.has(run.id) && "bg-primary/5",
                      )}
                    >
                      <span
                        className="grid place-items-center"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <SelectionCheckbox
                          ariaLabel={`Select ${run.name}`}
                          checked={selectedIds.has(run.id)}
                          disabled={bulkBusy}
                          onChange={(checked) => toggleRunSelection(run.id, checked)}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{run.name}</span>
                        <span
                          className="mt-0.5 block max-w-[34ch] truncate text-xs text-muted-foreground"
                          title={run.scenario || "No scenario"}
                        >
                          {run.scenario || "No scenario"}
                        </span>
                      </span>
                      <span className="min-w-0 overflow-hidden">
                        <RunStatusBadge
                          run={run}
                          showDuration={false}
                          className="max-w-full"
                        />
                      </span>
                      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                        {run.cli}/{run.model}
                      </span>
                      <span className="min-w-0 truncate text-muted-foreground">
                        {run.profileName || "-"}
                      </span>
                      <span className="min-w-0 truncate text-muted-foreground">
                        {duration(run.durationMs)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-muted-foreground">
                          {ago(run.createdAt)}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/75">
                          {new Date(run.createdAt).toLocaleString()}
                        </span>
                      </span>
                      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                        {run.buildPath || "-"}
                      </span>
                      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/25 px-4 py-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              {filteredRuns.length ? `${pageStart + 1}-${pageEnd} of ${filteredRuns.length}` : "0 rows"} · 10 per page
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageIndexChange(Math.max(0, currentPageIndex - 1))}
                disabled={currentPageIndex === 0}
              >
                <ChevronLeft /> Previous
              </Button>
              <span className="min-w-20 text-center font-mono text-[11px] text-muted-foreground">
                {currentPageIndex + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onPageIndexChange(Math.min(pageCount - 1, currentPageIndex + 1))
                }
                disabled={currentPageIndex >= pageCount - 1}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete selected runs?</DialogTitle>
                <DialogDescription>
                  This deletes {selectedCount} run{selectedCount === 1 ? "" : "s"} and
                  their stored event replays. Running or queued selections will be
                  cancelled first.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={bulkDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void deleteSelectedRuns()}
                  disabled={bulkDeleting}
                >
                  <Trash2 /> {bulkDeleting ? "Deleting" : "Delete runs"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      </div>
    </div>
  );
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  disabled,
  ariaLabel,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.checked)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className="size-4 rounded border border-input bg-background/70 accent-primary transition disabled:opacity-45"
    />
  );
}

function sortLabel(sort: SortMode): string {
  if (sort === "oldest") return "Oldest";
  if (sort === "duration-desc") return "Slowest";
  if (sort === "duration-asc") return "Fastest";
  if (sort === "name") return "Name";
  return "Newest";
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
    <div className="bg-card/70 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-lg font-semibold",
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
