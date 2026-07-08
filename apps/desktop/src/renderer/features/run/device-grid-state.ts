import type { AgentEvent, Device, DeviceFrameMessage } from "@testcat/shared";

export const DEVICE_GRID_MAX_COLUMNS = 4;
export const DEVICE_GRID_GAP_PX = 20;
export const DEVICE_GRID_MIN_COLUMN_PX = 240;

export interface DeviceTile {
  udid: string;
  name: string;
  runtime: string;
  kind?: "simulator" | "physical";
  dataUrl?: string;
  fps?: number;
  lastFrameAtMs?: number;
}

export type DeviceTiles = Record<string, DeviceTile>;

const UDID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** UDIDs reserved for this run by main's device-usage bookkeeping. */
export const reservedDeviceUdids = (
  devices: Device[],
  runId: string,
): string[] =>
  devices
    .filter((device) => device.usage?.runId === runId)
    .map((device) => device.udid);

export function getDeviceGridColumnCount(widthPx: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return DEVICE_GRID_MAX_COLUMNS;
  const fit = Math.floor(
    (widthPx + DEVICE_GRID_GAP_PX) /
      (DEVICE_GRID_MIN_COLUMN_PX + DEVICE_GRID_GAP_PX),
  );
  return Math.max(1, Math.min(DEVICE_GRID_MAX_COLUMNS, fit));
}

export function extractUsedDeviceUdids(events: AgentEvent[]): string[] {
  const udids = new Set<string>();
  for (const event of events) {
    if (event.type !== "tool_use") continue;
    const input =
      typeof event.input === "string" ? event.input : JSON.stringify(event.input);
    for (const match of input.matchAll(UDID_RE)) {
      udids.add(match[0].toUpperCase());
    }
  }
  return [...udids];
}

const isAllowed = (
  udid: string,
  allowedUdids?: ReadonlySet<string>,
): boolean => !allowedUdids || allowedUdids.has(udid.toUpperCase());

/**
 * Positive per-run filter: a tile is shown only when the device is reserved
 * for this run or referenced by this run's transcript. Anything else — e.g.
 * a simulator booted by a concurrently running other test — never appears.
 */
export function mergeDeviceList(
  current: DeviceTiles,
  devices: Device[],
  options: {
    allowedUdids?: ReadonlySet<string>;
  } = {},
): DeviceTiles {
  const next: DeviceTiles = {};

  for (const device of devices) {
    if (!device.isBooted) continue;
    if (!isAllowed(device.udid, options.allowedUdids)) continue;
    const existing = current[device.udid];
    next[device.udid] = {
      udid: device.udid,
      name: device.name,
      runtime: device.runtime,
      kind: device.kind,
      dataUrl: existing?.dataUrl,
      fps: existing?.fps,
      lastFrameAtMs: existing?.lastFrameAtMs,
    };
  }

  return next;
}

export function mergeDeviceFrame(
  current: DeviceTiles,
  frame: DeviceFrameMessage,
  options: {
    allowedUdids?: ReadonlySet<string>;
    fps?: number;
    receivedAtMs?: number;
  } = {},
): DeviceTiles {
  const existing = current[frame.udid];
  if (!isAllowed(frame.udid, options.allowedUdids)) return current;
  return {
    ...current,
    [frame.udid]: {
      udid: frame.udid,
      name: frame.name || existing?.name || "Simulator",
      runtime: existing?.runtime ?? "",
      kind: frame.kind ?? existing?.kind,
      dataUrl: frame.dataUrl,
      fps: options.fps,
      lastFrameAtMs: options.receivedAtMs,
    },
  };
}

export function decayDeviceFps(
  current: DeviceTiles,
  nowMs: number,
  staleAfterMs: number,
): DeviceTiles {
  let changed = false;
  const next: DeviceTiles = {};

  for (const [udid, tile] of Object.entries(current)) {
    const stale =
      tile.lastFrameAtMs == null || nowMs - tile.lastFrameAtMs > staleAfterMs;
    const fps = stale ? 0 : tile.fps;
    if (fps !== tile.fps) changed = true;
    next[udid] = { ...tile, fps };
  }

  return changed ? next : current;
}
