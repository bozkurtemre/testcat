import type { TestStatus } from "@testcat/shared";
import { LayoutDashboard, Plus, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** An open run, shown as a tab so the user can switch between live tests. */
export type RunTab = {
  runId: string;
  name: string;
  cli: string;
  profileName?: string;
  /** true = started this session (live RunView); false = opened from history. */
  live: boolean;
  /** Simulators that were already booted before this run started. */
  deviceBaselineUdids?: string[];
  /** undefined while in flight; set on finish / when opened from history. */
  status?: TestStatus;
};

interface Props {
  dashboardActive: boolean;
  onDashboard: () => void;
  tabs: RunTab[];
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
  onCloseTab: (runId: string) => void;
  onReorderTabs: (
    draggedRunId: string,
    targetRunId: string,
    placement: "before" | "after",
  ) => void;
  onNewTest: () => void;
}

// The whole title/tab bar is draggable. Only the actual controls opt out so
// empty tab-strip space can move the macOS window.
const noDrag = "[-webkit-app-region:no-drag]";

const tabBase =
  "relative flex h-[26px] shrink-0 self-center items-center gap-2 rounded-[7px] border border-transparent px-3 text-[13px] font-medium transition-colors";
const tabActive = "border-border bg-[#171a1b] text-foreground shadow-sm";
const tabIdle =
  "text-muted-foreground hover:border-border/70 hover:bg-accent/40 hover:text-foreground";

export function TopBar({
  dashboardActive,
  onDashboard,
  tabs,
  activeRunId,
  onSelectRun,
  onCloseTab,
  onReorderTabs,
  onNewTest,
}: Props) {
  const [draggingRunId, setDraggingRunId] = useState<string | null>(null);

  return (
    <header className="ide-panel flex h-[34px] min-h-[34px] shrink-0 items-stretch border-b border-border bg-background/95 pr-2 pl-1.5 [-webkit-app-region:drag]">
      <div
        className="app-chrome-traffic-space workspace-tabs-traffic mr-3 w-24 shrink-0 self-stretch"
        aria-hidden
      />
      <nav className="workspace-tabs-strip flex min-w-0 flex-1 items-center gap-[3px] overflow-x-auto [-webkit-app-region:drag]">
        <div
          aria-current={dashboardActive ? "page" : undefined}
          className={cn(tabBase, "min-w-36", dashboardActive ? tabActive : tabIdle)}
        >
          <button
            type="button"
            onClick={onDashboard}
            className={cn("flex min-w-0 items-center gap-2", noDrag)}
          >
            <LayoutDashboard className="size-4" />
            Dashboard
          </button>
        </div>

        {tabs.map((t) => (
          <RunPill
            key={t.runId}
            tab={t}
            active={t.runId === activeRunId}
            dragging={t.runId === draggingRunId}
            draggingRunId={draggingRunId}
            onSelect={() => onSelectRun(t.runId)}
            onClose={() => onCloseTab(t.runId)}
            onDragStart={(runId) => setDraggingRunId(runId)}
            onDragEnd={() => setDraggingRunId(null)}
            onReorder={onReorderTabs}
          />
        ))}

        <button
          type="button"
          onClick={onNewTest}
          aria-label="New test"
          title="New test"
          className={cn(
            "grid size-6 shrink-0 self-center place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground active:scale-95",
            noDrag,
          )}
        >
          <Plus className="size-[18px]" />
        </button>
      </nav>
      <span
        className="mr-2 ml-2 self-center font-mono text-[10px] text-muted-foreground/60"
        title="testcat version"
      >
        v{__APP_VERSION__}
      </span>
    </header>
  );
}

function RunPill({
  tab,
  active,
  dragging,
  draggingRunId,
  onSelect,
  onClose,
  onDragStart,
  onDragEnd,
  onReorder,
}: {
  tab: RunTab;
  active: boolean;
  dragging: boolean;
  draggingRunId: string | null;
  onSelect: () => void;
  onClose: () => void;
  onDragStart: (runId: string) => void;
  onDragEnd: () => void;
  onReorder: (
    draggedRunId: string,
    targetRunId: string,
    placement: "before" | "after",
  ) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", tab.runId);
        onDragStart(tab.runId);
      }}
      onDragOver={(event) => {
        if (!draggingRunId || draggingRunId === tab.runId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        const placement =
          event.clientX > rect.left + rect.width / 2 ? "after" : "before";
        onReorder(draggingRunId, tab.runId, placement);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDragEnd();
      }}
      onDragEnd={onDragEnd}
      aria-grabbed={dragging}
      className={cn(
        tabBase,
        "group max-w-[14rem] cursor-grab gap-1.5 pr-1.5 pl-2.5 active:cursor-grabbing",
        active ? tabActive : tabIdle,
        dragging && "opacity-55",
        noDrag,
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn("flex min-w-0 items-center gap-2", noDrag)}
      >
        <StatusDot status={tab.status} />
        <span className="truncate">{tab.name || "Test run"}</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close tab"
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          noDrag,
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function StatusDot({ status }: { status?: TestStatus }) {
  const running =
    status === undefined || status === "running" || status === "queued";
  if (running) {
    return (
      <span className="relative grid size-2 shrink-0 place-items-center">
        <span className="absolute size-2 animate-ping rounded-full bg-primary/60" />
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
    );
  }
  const bad =
    status === "failed" || status === "error" || status === "cancelled";
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        bad ? "bg-destructive" : "bg-primary",
      )}
    />
  );
}
