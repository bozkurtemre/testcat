import type { RunDoneMessage } from "@testcat/shared";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Camera, Check, CircleAlert, Loader2, MonitorSmartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  decayDeviceFps,
  DEVICE_GRID_MAX_COLUMNS,
  type DeviceTiles,
  getDeviceGridColumnCount,
  mergeDeviceFrame,
  mergeDeviceList,
  reservedDeviceUdids,
} from "./device-grid-state";

const DEVICE_REFRESH_MS = 1500;
const FPS_WINDOW_MS = 1000;
const FPS_STALE_MS = 1400;

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * View-only live grid. Subscribes to per-simulator MJPEG frames streamed by
 * main (testcat-sim). No input is wired — monitoring only.
 */
export function DeviceGrid({
  runId,
  usedDeviceUdids,
  done,
  disableIntroAnimation = false,
}: {
  runId: string;
  usedDeviceUdids?: string[];
  done?: RunDoneMessage | null;
  disableIntroAnimation?: boolean;
}) {
  const [tiles, setTiles] = useState<DeviceTiles>({});
  const [columns, setColumns] = useState(DEVICE_GRID_MAX_COLUMNS);
  const [captureState, setCaptureState] = useState<
    Record<string, "saving" | "saved" | "error" | undefined>
  >({});
  // Tiles shown = devices reserved for THIS run + devices this run's
  // transcript touched. A concurrent test's simulators match neither.
  const reservedUdidsRef = useRef<Set<string>>(new Set());
  const usedUdidsRef = useRef<Set<string>>(new Set(usedDeviceUdids ?? []));
  const allowedUdidsRef = useRef<Set<string>>(new Set());
  const frameTimesRef = useRef(new Map<string, number[]>());
  const gridViewportRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const rebuildAllowed = () => {
    allowedUdidsRef.current = new Set(
      [...reservedUdidsRef.current, ...usedUdidsRef.current].map((udid) =>
        udid.toUpperCase(),
      ),
    );
  };

  useEffect(() => {
    usedUdidsRef.current = new Set(usedDeviceUdids ?? []);
    rebuildAllowed();
  }, [usedDeviceUdids]);

  useEffect(() => {
    const el = gridViewportRef.current;
    if (!el) return;

    const update = () => setColumns(getDeviceGridColumnCount(el.clientWidth));
    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    const calculateFps = (udid: string, nowMs: number) => {
      const recent = (frameTimesRef.current.get(udid) ?? []).filter(
        (time) => nowMs - time <= FPS_WINDOW_MS,
      );
      recent.push(nowMs);
      frameTimesRef.current.set(udid, recent);
      return recent.length;
    };

    const refreshDevices = async () => {
      try {
        const devices = await window.testcat.devicesList();
        reservedUdidsRef.current = new Set(
          reservedDeviceUdids(devices, runId),
        );
        rebuildAllowed();
        if (active) {
          setTiles((prev) =>
            mergeDeviceList(prev, devices, {
              allowedUdids: allowedUdidsRef.current,
            }),
          );
        }
      } catch {
        // Native simulator discovery is best-effort; devicesWatch retries too.
      }
    };

    void window.testcat.devicesWatch();
    void refreshDevices();
    const refreshTimer = window.setInterval(
      () => void refreshDevices(),
      DEVICE_REFRESH_MS,
    );
    const fpsTimer = window.setInterval(() => {
      const now = performance.now();
      setTiles((prev) => decayDeviceFps(prev, now, FPS_STALE_MS));
    }, 500);

    const off = window.testcat.onDeviceFrame((msg) => {
      const now = performance.now();
      const fps = calculateFps(msg.udid, now);
      setTiles((prev) =>
        mergeDeviceFrame(prev, msg, {
          allowedUdids: allowedUdidsRef.current,
          fps,
          receivedAtMs: now,
        }),
      );
    });

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(fpsTimer);
      off();
      void window.testcat.devicesUnwatch();
    };
  }, [runId]);

  const devices = Object.entries(tiles);
  const deviceError = devices.length === 0 && done && done.status !== "passed";

  const captureScreenshot = async (tile: DeviceTiles[string]) => {
    if (captureState[tile.udid] === "saving") return;
    setCaptureState((prev) => ({ ...prev, [tile.udid]: "saving" }));
    try {
      await window.testcat.runMediaCapture({
        runId,
        udid: tile.udid,
        deviceName: tile.name,
        runtime: tile.runtime,
        kind: tile.kind,
      });
      setCaptureState((prev) => ({ ...prev, [tile.udid]: "saved" }));
      window.setTimeout(() => {
        setCaptureState((prev) => ({ ...prev, [tile.udid]: undefined }));
      }, 1800);
    } catch {
      setCaptureState((prev) => ({ ...prev, [tile.udid]: "error" }));
      window.setTimeout(() => {
        setCaptureState((prev) => ({ ...prev, [tile.udid]: undefined }));
      }, 2400);
    }
  };

  useGSAP(
    () => {
      if (disableIntroAnimation) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(
        ".tc-device-tile",
        { scale: 0.94, autoAlpha: 0.3, y: 14 },
        {
          scale: 1,
          autoAlpha: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
          stagger: 0.05,
        },
      );
    },
    { scope: rootRef, dependencies: [devices.length, disableIntroAnimation] },
  );

  return (
    <div className="ide-grid-bg h-full overflow-y-auto overflow-x-hidden p-5">
      <div ref={gridViewportRef} className="h-full min-h-0">
        {deviceError ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <div className="mb-3 grid size-14 place-items-center rounded-lg border border-destructive/35 bg-destructive/10 text-destructive">
              <CircleAlert className="size-8" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-destructive">
              Device view {done.status}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground/80">
              The run ended before simulator frames were captured.
            </p>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <div className="mb-3 grid size-14 place-items-center rounded-lg border border-border bg-card">
              <MonitorSmartphone className="size-8" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-foreground">
              Waiting for simulators…
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              The live view appears as the agent boots devices.
            </p>
          </div>
        ) : (
          <div
            ref={rootRef}
            className="grid min-h-full content-start gap-4"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {devices.map(([udid, f]) => (
              <figure
                key={udid}
                className="tc-device-tile flex min-h-[520px] flex-col rounded-lg border border-border/80 bg-card/35 p-3 shadow-sm"
              >
                <div className="mb-2 flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="block cursor-default truncate font-mono text-[11px] font-semibold text-foreground"
                          tabIndex={0}
                        >
                          {f.name} ({f.udid})
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        align="start"
                        sideOffset={6}
                        className="max-w-[520px] break-all font-mono"
                      >
                        {f.name} ({f.udid})
                      </TooltipContent>
                    </Tooltip>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {f.runtime || "runtime unknown"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title={
                        captureState[f.udid] === "error"
                          ? "Screenshot failed"
                          : "Capture screenshot"
                      }
                      aria-label={`Capture screenshot for ${f.name}`}
                      disabled={captureState[f.udid] === "saving"}
                      onClick={() => void captureScreenshot(f)}
                      className={cn(
                        "grid size-7 place-items-center rounded-md border border-border bg-background/55 text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-70",
                        captureState[f.udid] === "error" &&
                          "border-destructive/40 text-destructive",
                      )}
                    >
                      {captureState[f.udid] === "saving" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : captureState[f.udid] === "saved" ? (
                        <Check className="size-3.5 text-primary" />
                      ) : (
                        <Camera className="size-3.5" />
                      )}
                    </button>
                    <span
                      title="Frames per second"
                      aria-label={`${Math.round(f.fps ?? 0)} frames per second`}
                      className={cn(
                        "grid size-7 place-items-center rounded-md border bg-background/55 font-mono text-[10px] font-semibold shadow-sm",
                        (f.fps ?? 0) > 0
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {Math.round(f.fps ?? 0)}
                    </span>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 items-start justify-center overflow-hidden rounded-md bg-background/45 p-2">
                  <div className="group w-full max-w-[320px] overflow-hidden rounded-[1.55rem] border-[3px] border-[#383d40] bg-black shadow-lg ring-1 ring-border">
                    {f.dataUrl ? (
                      <img
                        src={f.dataUrl}
                        alt={f.name}
                        className="block h-auto w-full select-none transition-transform duration-700 ease-out group-hover:scale-[1.015]"
                        draggable={false}
                      />
                    ) : (
                      <div className="grid aspect-[9/19.5] w-[240px] place-items-center bg-background/80 px-4 text-center">
                        <div>
                          <MonitorSmartphone
                            className="mx-auto mb-3 size-9 text-primary/80"
                            strokeWidth={1.5}
                          />
                          <p className="text-xs font-medium text-foreground">
                            Waiting for live frame
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            The device is ready. The preview updates on the
                            next screen change.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
