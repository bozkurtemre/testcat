import type { AgentEvent, RunDoneMessage } from "@testcat/shared";
import { ArrowLeft, Loader2, Square } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSecondsAndMinutes } from "@/lib/duration";
import { cn } from "@/lib/utils";
import { ChatPane } from "./ChatPane";
import { DeviceGrid } from "./DeviceGrid";
import { extractUsedDeviceUdids } from "./device-grid-state";
import { NetworkPanel, type NetworkPanelUiState } from "./NetworkPanel";

interface Props {
  runId: string;
  stream: { events: AgentEvent[]; done: RunDoneMessage | null };
  meta: {
    name: string;
    cli: string;
    profileName?: string;
    deviceBaselineUdids?: string[];
  };
  disableAnimations?: boolean;
  networkPanelState?: NetworkPanelUiState;
  onNetworkPanelStateChange?: (patch: Partial<NetworkPanelUiState>) => void;
  onBack: () => void;
}

export function RunView({
  runId,
  stream,
  meta,
  disableAnimations = false,
  networkPanelState,
  onNetworkPanelStateChange,
  onBack,
}: Props) {
  const { events, done } = stream;
  const running = !done;
  const usedDeviceUdids = useMemo(
    () => extractUsedDeviceUdids(events),
    [events],
  );

  return (
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
            {meta.name || "Test run"}
          </h1>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            {meta.profileName || meta.cli}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge done={done} />
          {running && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void window.testcat.runCancel(runId)}
            >
              <Square className="size-3.5" /> Stop
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div data-page-reveal className="ide-panel flex w-[420px] shrink-0 flex-col border-r border-border">
          <div className="flex items-center border-b border-border px-4 py-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Agent output
            </span>
          </div>
          <ChatPane events={events} done={done} />
        </div>

        <div
          data-page-reveal
          className="flex min-w-0 flex-1 flex-col bg-background/45"
        >
          <div className="min-h-0 flex-1">
            <DeviceGrid
              runId={runId}
              usedDeviceUdids={usedDeviceUdids}
              done={done}
              disableIntroAnimation={disableAnimations}
            />
          </div>
          <NetworkPanel
            runId={runId}
            done={done}
            uiState={networkPanelState}
            onUiStateChange={onNetworkPanelStateChange}
          />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ done }: { done: RunDoneMessage | null }) {
  if (!done) {
    return (
      <Badge variant="accent" className="h-8 px-3 text-sm">
        <Loader2 className="size-4 animate-spin" /> running
      </Badge>
    );
  }
  const ok = done.status === "passed";
  return (
    <Badge
      variant={ok ? "accent" : "outline"}
      className={cn(
        "h-8 px-3 text-sm",
        !ok && "border-destructive/30 text-destructive",
      )}
    >
      {done.status} · {formatSecondsAndMinutes(done.durationMs)}
    </Badge>
  );
}
