import type {
  NetworkActivity,
  NetworkEventsSnapshot,
  NetworkRoutingInfo,
  RunDoneMessage,
} from "@testcat/shared";
import {
  ChevronDown,
  ChevronUp,
  Clock3,
  Network,
  Search,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  runId: string;
  done?: RunDoneMessage | null;
  uiState?: NetworkPanelUiState;
  onUiStateChange?: (patch: Partial<NetworkPanelUiState>) => void;
}

export interface NetworkPanelUiState {
  collapsed: boolean;
  panelHeight: number;
  query: string;
  selectedId: string | null;
  autoExpanded: boolean;
}

const EMPTY_SNAPSHOT: NetworkEventsSnapshot = {
  runId: "",
  enabled: false,
  proxyUrl: null,
  events: [],
};
const NETWORK_PANEL_DEFAULT_HEIGHT = 280;
const NETWORK_PANEL_MIN_HEIGHT = 180;
const NETWORK_PANEL_MAX_HEIGHT = 560;
const NETWORK_PANEL_COLLAPSED_HEIGHT = 44;

export const DEFAULT_NETWORK_PANEL_UI_STATE: NetworkPanelUiState = {
  collapsed: true,
  panelHeight: NETWORK_PANEL_DEFAULT_HEIGHT,
  query: "",
  selectedId: null,
  autoExpanded: false,
};

function clampPanelHeight(value: number): number {
  const viewportBound =
    typeof window === "undefined"
      ? NETWORK_PANEL_MAX_HEIGHT
      : Math.max(NETWORK_PANEL_MIN_HEIGHT, window.innerHeight - 220);
  return Math.min(
    Math.max(value, NETWORK_PANEL_MIN_HEIGHT),
    Math.min(NETWORK_PANEL_MAX_HEIGHT, viewportBound),
  );
}

export function NetworkPanel({
  runId,
  done,
  uiState,
  onUiStateChange,
}: Props) {
  const initialUiState = uiState ?? DEFAULT_NETWORK_PANEL_UI_STATE;
  const [collapsed, setCollapsedState] = useState(initialUiState.collapsed);
  const [panelHeight, setPanelHeightState] = useState(initialUiState.panelHeight);
  const [snapshot, setSnapshot] = useState<NetworkEventsSnapshot>({
    ...EMPTY_SNAPSHOT,
    runId,
  });
  const [query, setQueryState] = useState(initialUiState.query);
  const [selectedId, setSelectedIdState] = useState<string | null>(
    initialUiState.selectedId,
  );
  const selectedIdRef = useRef(initialUiState.selectedId);
  const autoExpandedRef = useRef(initialUiState.autoExpanded);
  const resizeRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  const patchUiState = (patch: Partial<NetworkPanelUiState>) => {
    onUiStateChange?.(patch);
  };

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    patchUiState({ collapsed: next });
  };

  const setPanelHeight = (next: number) => {
    setPanelHeightState(next);
    patchUiState({ panelHeight: next });
  };

  const setQuery = (next: string) => {
    setQueryState(next);
    patchUiState({ query: next });
  };

  const setSelectedId = (next: string | null) => {
    selectedIdRef.current = next;
    setSelectedIdState(next);
    patchUiState({ selectedId: next });
  };

  const selectDefaultId = (next: string | null | undefined) => {
    if (!next || selectedIdRef.current) return;
    setSelectedId(next);
  };

  const markAutoExpanded = () => {
    autoExpandedRef.current = true;
    patchUiState({ autoExpanded: true });
  };

  useEffect(() => {
    let active = true;
    window.testcat.networkEvents(runId).then(
      (next) => {
        if (!active) return;
        setSnapshot(next);
        selectDefaultId(next.events.at(-1)?.id);
        if (next.enabled && !autoExpandedRef.current) {
          markAutoExpanded();
          setCollapsed(false);
        }
      },
      () => undefined,
    );

    const off = window.testcat.onNetworkEvent((msg) => {
      if (msg.runId !== runId) return;
      setSnapshot((prev) => {
        const events = mergeNetworkActivity(prev.events, msg.event);
        return {
          runId,
          enabled: true,
          proxyUrl: prev.proxyUrl,
          routing: prev.routing,
          events,
        };
      });
      selectDefaultId(msg.event.id);
      if (!autoExpandedRef.current) {
        markAutoExpanded();
        setCollapsed(false);
      }
    });

    return () => {
      active = false;
      off();
    };
  }, [runId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const events = [...snapshot.events].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    if (!needle) return events;
    return events.filter((event) =>
      [
        event.method,
        event.url,
        event.host,
        event.path,
        event.statusCode == null ? "" : String(event.statusCode),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, snapshot.events]);

  const selected =
    snapshot.events.find((event) => event.id === selectedId) ??
    filtered[0] ??
    null;
  const completed = snapshot.events.filter(
    (event) => event.phase === "completed",
  ).length;
  const failed = snapshot.events.filter((event) => event.phase === "failed").length;
  const running = !done;
  const contentHeight = Math.max(0, panelHeight - NETWORK_PANEL_COLLAPSED_HEIGHT);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panelHeight,
    };
  };

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = resizeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const delta = active.startY - event.clientY;
    setPanelHeight(clampPanelHeight(active.startHeight + delta));
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = resizeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      className={cn(
        "ide-panel relative border-t border-border bg-background/88",
        !collapsed && "shrink-0",
      )}
      style={{
        height: collapsed ? NETWORK_PANEL_COLLAPSED_HEIGHT : panelHeight,
      }}
    >
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize network panel"
          tabIndex={0}
          onPointerDown={beginResize}
          onPointerMove={resize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className="absolute -top-1 left-0 right-0 z-20 h-2 cursor-row-resize touch-none"
        >
          <div className="mx-auto mt-[3px] h-px w-16 rounded-full bg-border transition-colors group-hover:bg-primary/50" />
        </div>
      )}
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        <Network className="size-4 text-primary" />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Network
        </span>
        <Badge variant={snapshot.enabled ? "accent" : "outline"}>
          {snapshot.enabled ? "capture" : "off"}
        </Badge>
        {snapshot.enabled && (
          <Badge variant="outline">
            {completed} ok{failed ? ` · ${failed} failed` : ""}
          </Badge>
        )}
        {snapshot.enabled && snapshot.routing && (
          <Badge
            variant={snapshot.routing.status === "active" ? "accent" : "outline"}
            title={snapshot.routing.reason}
          >
            {routingLabel(snapshot.routing)}
          </Badge>
        )}
        {running && snapshot.enabled && (
          <span className="ml-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            live
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand network panel" : "Collapse network panel"}
        >
          {collapsed ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <div
          className="grid min-h-0 grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]"
          style={{ height: contentHeight }}
        >
          <div className="flex min-h-0 flex-col border-r border-border">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
              <Search className="size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter requests"
                className="h-7 border-transparent bg-transparent px-0 font-mono text-xs shadow-none focus-visible:bg-transparent focus-visible:ring-0"
              />
            </div>
            <div className="grid grid-cols-[76px_72px_minmax(180px,1fr)_88px_88px] border-b border-border bg-background/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>Status</span>
              <span>Method</span>
              <span>URL</span>
              <span>Time</span>
              <span>Size</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {filtered.length ? (
                filtered.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedId(event.id)}
                    className={cn(
                      "grid w-full grid-cols-[76px_72px_minmax(180px,1fr)_88px_88px] items-center gap-0 border-b border-border/65 px-3 py-2 text-left font-mono text-xs transition hover:bg-accent/35",
                      selected?.id === event.id && "bg-accent/45",
                    )}
                  >
                    <StatusCell event={event} />
                    <span className="truncate text-muted-foreground">
                      {event.method}
                    </span>
                    <span className="min-w-0 truncate text-foreground">
                      {event.host}
                      <span className="text-muted-foreground">{event.path}</span>
                    </span>
                    <span className="truncate text-muted-foreground">
                      {event.durationMs == null ? "-" : `${event.durationMs}ms`}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {formatBytes(event.responseBytes)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="grid h-full place-items-center px-4 text-center text-xs text-muted-foreground">
                  {emptyNetworkMessage(snapshot)}
                </div>
              )}
            </div>
          </div>

          <NetworkDetails event={selected} enabled={snapshot.enabled} />
        </div>
      )}
    </section>
  );
}

function mergeNetworkActivity(
  events: NetworkActivity[],
  next: NetworkActivity,
): NetworkActivity[] {
  const index = events.findIndex((event) => event.id === next.id);
  if (index < 0) return [...events, next].slice(-500);
  const copy = [...events];
  copy[index] = next;
  return copy;
}

function routingLabel(routing: NetworkRoutingInfo): string {
  return routing.status === "active" ? "sim env" : "capture fallback";
}

function emptyNetworkMessage(snapshot: NetworkEventsSnapshot): string {
  if (!snapshot.enabled) return "Network capture is off for this run.";
  if (snapshot.routing?.status === "fallback") {
    return snapshot.routing.reason
      ? `Proxy is running, but simulator app launch routing is limited: ${snapshot.routing.reason}`
      : "Proxy is running, but simulator app traffic may not reach it.";
  }
  return "Waiting for proxied requests from simulator-launched apps.";
}

function StatusCell({ event }: { event: NetworkActivity }) {
  if (event.phase === "started") {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Clock3 className="size-3" /> pending
      </span>
    );
  }
  if (event.phase === "failed") {
    return <span className="font-semibold text-destructive">failed</span>;
  }
  return (
    <span
      className={cn(
        "font-semibold",
        event.statusCode && event.statusCode >= 400
          ? "text-destructive"
          : "text-primary",
      )}
    >
      {event.statusCode ?? "-"}
    </span>
  );
}

function NetworkDetails({
  event,
  enabled,
}: {
  event: NetworkActivity | null;
  enabled: boolean;
}) {
  if (!event) {
    return (
      <div className="grid min-h-0 place-items-center p-4 text-center text-xs text-muted-foreground">
        {enabled ? "Select a request." : "Capture was not enabled."}
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-auto p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={event.kind === "http" ? "accent" : "outline"}>
            {event.kind}
          </Badge>
          <span className="truncate font-mono text-xs font-semibold">
            {event.method} {event.host}
          </span>
        </div>
        <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
          {event.url}
        </p>
      </div>

      <DetailGrid event={event} />

      <HeaderBlock title="Request headers" headers={event.requestHeaders} />
      <HeaderBlock title="Response headers" headers={event.responseHeaders} />

      {event.kind === "http" ? (
        <>
          <BodyBlock title="Request body" body={event.requestBodyPreview} />
          <BodyBlock title="Response body" body={event.responseBodyPreview} />
        </>
      ) : (
        <p className="mt-3 rounded-md border border-border bg-background/35 p-3 text-xs leading-relaxed text-muted-foreground">
          HTTPS tunnel contents are not decoded because Testcat is not installing
          a local root certificate in this MVP.
        </p>
      )}

      {event.error && (
        <pre className="mt-3 whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-[11px] text-destructive">
          {event.error}
        </pre>
      )}
    </div>
  );
}

function DetailGrid({ event }: { event: NetworkActivity }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <DetailItem label="Started" value={new Date(event.startedAt).toLocaleTimeString()} />
      <DetailItem
        label="Duration"
        value={event.durationMs == null ? "-" : `${event.durationMs}ms`}
      />
      <DetailItem label="Request" value={formatBytes(event.requestBytes)} />
      <DetailItem label="Response" value={formatBytes(event.responseBytes)} />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/35 px-2 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-[11px] text-foreground">{value}</p>
    </div>
  );
}

function HeaderBlock({
  title,
  headers,
}: {
  title: string;
  headers?: Record<string, string>;
}) {
  if (!headers || Object.keys(headers).length === 0) return null;
  return (
    <section className="mt-3">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-1 overflow-hidden rounded-md border border-border">
        {Object.entries(headers).map(([key, value]) => (
          <div
            key={key}
            className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-border/60 px-2 py-1 last:border-b-0"
          >
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {key}
            </span>
            <span className="break-all font-mono text-[10px] text-foreground">
              {value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BodyBlock({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <section className="mt-3">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background/35 p-2 font-mono text-[10px] leading-relaxed text-foreground">
        {body}
      </pre>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
