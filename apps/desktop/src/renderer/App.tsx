import type { AgentEvent, RunDoneMessage, TestRun, TestStatus } from "@testcat/shared";
import { CircleHelp, History, Settings, Users } from "lucide-react";
import { type ComponentType, useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AgentProfilesPage } from "@/features/agent-profiles/AgentProfilesPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { RunDetail } from "@/features/dashboard/RunDetail";
import { RunHistoryPage } from "@/features/dashboard/RunHistoryPage";
import { HelpDialog } from "@/features/help/HelpDialog";
import {
  DEFAULT_NETWORK_PANEL_UI_STATE,
  type NetworkPanelUiState,
} from "@/features/run/NetworkPanel";
import { type NewTestDraft, NewTestDialog } from "@/features/run/NewTestDialog";
import { RunView } from "@/features/run/RunView";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { PageReveal } from "@/features/shell/PageReveal";
import { type RunTab, TopBar } from "@/features/shell/TopBar";
import { cn } from "@/lib/utils";
import logo from "./assets/testcat-dark.svg";

type Active =
  | { kind: "dashboard" }
  | { kind: "runs" }
  | { kind: "profiles" }
  | { kind: "settings" }
  | { kind: "run"; runId: string };

const noDrag = "[-webkit-app-region:no-drag]";

type RunStreamState = {
  events: AgentEvent[];
  done: RunDoneMessage | null;
};

const EMPTY_RUN_STREAM: RunStreamState = { events: [], done: null };

const isLiveStatus = (status: TestStatus) =>
  status === "running" || status === "queued";

export default function App() {
  const [tabs, setTabs] = useState<RunTab[]>([]);
  const [runStreams, setRunStreams] = useState<Record<string, RunStreamState>>(
    {},
  );
  const [networkPanelStates, setNetworkPanelStates] = useState<
    Record<string, NetworkPanelUiState>
  >({});
  const [active, setActive] = useState<Active>({ kind: "dashboard" });
  const [historyPageIndex, setHistoryPageIndex] = useState(0);
  const [newTestOpen, setNewTestOpen] = useState(false);
  const [newTestDraft, setNewTestDraft] = useState<NewTestDraft | null>(null);
  const [help, setHelp] = useState<{ open: boolean; tab: "setup" | "faq" }>({
    open: false,
    tab: "setup",
  });

  // First launch: open the step-by-step setup guide once.
  useEffect(() => {
    if (!localStorage.getItem("testcat:onboarded")) {
      setHelp({ open: true, tab: "setup" });
    }
  }, []);

  // Keep live run output in memory even when its tab is not currently selected.
  useEffect(
    () => {
      const offEvent = window.testcat.onRunEvent((msg) => {
        const timestamp = msg.event.timestamp ?? new Date().toISOString();
        setRunStreams((prev) => {
          const current = prev[msg.runId] ?? EMPTY_RUN_STREAM;
          return {
            ...prev,
            [msg.runId]: {
              ...current,
              events: [...current.events, { ...msg.event, timestamp }],
            },
          };
        });
      });
      const offDone = window.testcat.onRunDone((msg) => {
        const timestamp = msg.timestamp ?? new Date().toISOString();
        setRunStreams((prev) => {
          const current = prev[msg.runId] ?? EMPTY_RUN_STREAM;
          return {
            ...prev,
            [msg.runId]: {
              ...current,
              done: { ...msg, timestamp },
            },
          };
        });
        setTabs((prev) =>
          prev.map((t) =>
            t.runId === msg.runId ? { ...t, status: msg.status } : t,
          ),
        );
      });
      return () => {
        offEvent();
        offDone();
      };
    },
    [],
  );

  const closeHelp = () => {
    localStorage.setItem("testcat:onboarded", "1");
    setHelp((h) => ({ ...h, open: false }));
  };

  const openRun = (tab: RunTab) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.runId === tab.runId);
      if (!existing) return [...prev, tab];
      return prev.map((t) =>
        t.runId === tab.runId ? { ...t, ...tab, live: t.live || tab.live } : t,
      );
    });
    setActive({ kind: "run", runId: tab.runId });
  };
  const openRunFromDashboard = (run: {
    id: string;
    name: string;
    cli: string;
    profileName: string;
    status: TestStatus;
  }) =>
    openRun({
      runId: run.id,
      name: run.name,
      cli: run.cli,
      profileName: run.profileName,
      live: isLiveStatus(run.status),
      status: run.status,
    });
  const openStartedRuns = (
    startedRuns: Array<{
      runId: string;
      name: string;
      cli: string;
      profileName?: string;
      deviceBaselineUdids?: string[];
    }>,
  ) => {
    const lastStartedRun = startedRuns[startedRuns.length - 1];
    if (!lastStartedRun) return;
    setTabs((prev) => {
      const existing = new Set(prev.map((tab) => tab.runId));
      const additions: RunTab[] = startedRuns
        .filter((run) => !existing.has(run.runId))
        .map((run) => ({
          runId: run.runId,
          name: run.name,
          cli: run.cli,
          profileName: run.profileName,
          deviceBaselineUdids: run.deviceBaselineUdids,
          live: true,
        }));
      return additions.length ? [...prev, ...additions] : prev;
    });
    setActive({ kind: "run", runId: lastStartedRun.runId });
  };
  const forgetRuns = (runIds: string[]) => {
    const deleted = new Set(runIds);
    setTabs((prev) => prev.filter((tab) => !deleted.has(tab.runId)));
    setRunStreams((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const runId of runIds) {
        if (runId in next) {
          delete next[runId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setNetworkPanelStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const runId of runIds) {
        if (runId in next) {
          delete next[runId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setActive((current) =>
      current.kind === "run" && deleted.has(current.runId)
        ? { kind: "runs" }
        : current,
    );
  };
  const openRunDetailFromHistory = (run: TestRun) =>
    openRun({
      runId: run.id,
      name: run.name,
      cli: run.cli,
      profileName: run.profileName,
      live: false,
      status: run.status,
    });
  const openNewTest = (draft: NewTestDraft | null = null) => {
    setNewTestDraft(draft);
    setNewTestOpen(true);
  };
  const closeTab = (runId: string) => {
    setTabs((prev) => prev.filter((t) => t.runId !== runId));
    setNetworkPanelStates((prev) => {
      if (!(runId in prev)) return prev;
      const next = { ...prev };
      delete next[runId];
      return next;
    });
    setActive((a) =>
      a.kind === "run" && a.runId === runId ? { kind: "dashboard" } : a,
    );
  };
  const reorderTabs = (
    draggedRunId: string,
    targetRunId: string,
    placement: "before" | "after",
  ) => {
    if (draggedRunId === targetRunId) return;
    setTabs((prev) => {
      const dragged = prev.find((tab) => tab.runId === draggedRunId);
      if (!dragged) return prev;

      const withoutDragged = prev.filter((tab) => tab.runId !== draggedRunId);
      const targetIndex = withoutDragged.findIndex(
        (tab) => tab.runId === targetRunId,
      );
      if (targetIndex < 0) return prev;

      const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
      const next = [...withoutDragged];
      next.splice(insertIndex, 0, dragged);

      const unchanged = next.every(
        (tab, index) => tab.runId === prev[index]?.runId,
      );
      return unchanged ? prev : next;
    });
  };
  const updateNetworkPanelState = (
    runId: string,
    patch: Partial<NetworkPanelUiState>,
  ) => {
    setNetworkPanelStates((prev) => ({
      ...prev,
      [runId]: {
        ...DEFAULT_NETWORK_PANEL_UI_STATE,
        ...prev[runId],
        ...patch,
      },
    }));
  };

  const activeRunId = active.kind === "run" ? active.runId : null;
  const activeTab = activeRunId
    ? tabs.find((t) => t.runId === activeRunId)
    : undefined;
  const disablePageReveal = activeTab?.live === true;
  const pageKey = activeTab
    ? `run:${activeTab.runId}:${activeTab.live ? "live" : "detail"}`
    : active.kind;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-screen flex-col overflow-hidden bg-background font-sans text-foreground">
        <TopBar
          dashboardActive={active.kind === "dashboard"}
          onDashboard={() => setActive({ kind: "dashboard" })}
          tabs={tabs}
          activeRunId={activeRunId}
          onSelectRun={(runId) => setActive({ kind: "run", runId })}
          onCloseTab={closeTab}
          onReorderTabs={reorderTabs}
          onNewTest={() => openNewTest()}
        />

        <div className="flex min-h-0 flex-1">
          <aside className="ide-panel flex w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-sidebar pt-3 pb-3 [-webkit-app-region:drag]">
            <button
              type="button"
              onClick={() => setActive({ kind: "dashboard" })}
              aria-label="testcat — Dashboard"
              className={cn(
                "grid size-11 place-items-center rounded-xl border border-border bg-background/70 transition hover:border-primary/40 active:scale-95",
                noDrag,
              )}
            >
              <img src={logo} alt="testcat" className="block size-8 rounded-lg" />
            </button>

            <div className="my-1 h-px w-9 bg-border" />

            <RailButton
              icon={History}
              label="Recent Runs"
              active={active.kind === "runs"}
              onClick={() => setActive({ kind: "runs" })}
            />
            <RailButton
              icon={Users}
              label="Agent Profiles"
              active={active.kind === "profiles"}
              onClick={() => setActive({ kind: "profiles" })}
            />
            <RailButton
              icon={Settings}
              label="Settings"
              active={active.kind === "settings"}
              onClick={() => setActive({ kind: "settings" })}
            />

            <div className="mt-auto">
              <RailButton
                icon={CircleHelp}
                label="Help"
                onClick={() => setHelp({ open: true, tab: "faq" })}
              />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <main className="ide-surface min-h-0 w-full max-w-full flex-1 overflow-x-hidden">
              <PageReveal
                key={pageKey}
                identity={pageKey}
                disabled={disablePageReveal}
              >
                {activeTab ? (
                  activeTab.live ? (
                    <RunView
                      runId={activeTab.runId}
                      stream={runStreams[activeTab.runId] ?? EMPTY_RUN_STREAM}
                      meta={{
                        name: activeTab.name,
                        cli: activeTab.cli,
                        profileName: activeTab.profileName,
                        deviceBaselineUdids: activeTab.deviceBaselineUdids,
                      }}
                      disableAnimations
                      networkPanelState={networkPanelStates[activeTab.runId]}
                      onNetworkPanelStateChange={(patch) =>
                        updateNetworkPanelState(activeTab.runId, patch)
                      }
                      onBack={() => closeTab(activeTab.runId)}
                    />
                  ) : (
                    <RunDetail
                      runId={activeTab.runId}
                      onBack={() => closeTab(activeTab.runId)}
                      onRerunStarted={(runId, meta) =>
                        openRun({
                          runId,
                          name: meta.name,
                          cli: meta.cli,
                          profileName: meta.profileName,
                          deviceBaselineUdids: meta.deviceBaselineUdids,
                          live: true,
                        })
                      }
                      onConfigureRerun={(draft) => openNewTest(draft)}
                      onDeleted={() => {
                        forgetRuns([activeTab.runId]);
                      }}
                    />
                  )
                ) : active.kind === "profiles" ? (
                  <AgentProfilesPage />
                ) : active.kind === "runs" ? (
                  <RunHistoryPage
                    pageIndex={historyPageIndex}
                    onPageIndexChange={setHistoryPageIndex}
                    onOpenRun={openRunDetailFromHistory}
                    onRunsStarted={openStartedRuns}
                    onRunsDeleted={forgetRuns}
                  />
                ) : active.kind === "settings" ? (
                  <SettingsPage />
                ) : (
                  <DashboardPage
                    onNewTest={() => openNewTest()}
                    onOpenRun={openRunFromDashboard}
                  />
                )}
              </PageReveal>
            </main>
          </div>
        </div>

        <NewTestDialog
          open={newTestOpen}
          draft={newTestDraft}
          onOpenChange={(open) => {
            setNewTestOpen(open);
            if (!open) setNewTestDraft(null);
          }}
          onStarted={(runId, meta) => {
            setNewTestOpen(false);
            openRun({
              runId,
              name: meta.name,
              cli: meta.cli,
              profileName: meta.profileName,
              deviceBaselineUdids: meta.deviceBaselineUdids,
              live: true,
            });
          }}
        />

        <HelpDialog
          open={help.open}
          onOpenChange={(o) => {
            if (!o) closeHelp();
          }}
          initialTab={help.tab}
          onGoProfiles={() => setActive({ kind: "profiles" })}
          onGoNewTest={() => openNewTest()}
        />
      </div>
    </TooltipProvider>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  primary,
  onClick,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-lg transition-all duration-150 active:scale-95",
            noDrag,
            primary
              ? "bg-primary text-primary-foreground shadow-sm hover:bg-[#77d6b1]"
              : active
                ? "bg-accent text-primary ring-1 ring-primary/35"
                : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
          )}
        >
          {active && !primary && (
            <span className="absolute -left-3 h-6 w-0.5 rounded-r bg-primary" />
          )}
          <Icon className="size-[22px]" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
