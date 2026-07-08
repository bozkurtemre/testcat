import type { AgentEvent, RunDevice, TestRun } from "@testcat/shared";

const UDID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export interface DeviceInsight {
  udid: string;
  name: string;
  runtime: string;
  firstSeenAtMs: number | null;
  lastSeenAtMs: number | null;
  activeMs: number | null;
  commandCount: number;
  commands: string[];
  bootedDuringRun: boolean;
  installedDuringRun: boolean;
  launchedDuringRun: boolean;
  terminatedDuringRun: boolean;
  timing: "exact" | "estimated" | "unknown";
}

type DeviceInventory = Record<string, RunDevice>;

type DeviceInsightRun = Pick<
  TestRun,
  "devices" | "durationMs" | "startedAt" | "finishedAt"
>;

export function summarizeRunDevices(
  run: DeviceInsightRun,
  events: AgentEvent[],
): DeviceInsight[] {
  const inventory: DeviceInventory = {};
  for (const device of run.devices) {
    inventory[device.udid.toUpperCase()] = {
      ...device,
      udid: device.udid.toUpperCase(),
    };
  }
  for (const event of events) {
    if (event.type !== "tool_result" || !event.ok) continue;
    for (const device of parseDeviceInventory(event.output)) {
      inventory[device.udid.toUpperCase()] = {
        ...device,
        udid: device.udid.toUpperCase(),
      };
    }
  }

  const byUdid = new Map<string, DeviceInsight>();
  const totalEvents = events.length;
  events.forEach((event, index) => {
    if (event.type !== "tool_use") return;
    const input = stringifyToolInput(event.input);
    const command = extractSimCommand(input);
    const udids = extractUdids(input);
    if (!command || udids.length === 0) return;

    const eventTime = inferEventTimeMs(event, index, totalEvents, run);
    for (const udid of udids) {
      const key = udid.toUpperCase();
      const device = inventory[key];
      const existing =
        byUdid.get(key) ??
        ({
          udid: key,
          name: device?.name ?? "Simulator",
          runtime: device?.runtime ?? "",
          firstSeenAtMs: null,
          lastSeenAtMs: null,
          activeMs: null,
          commandCount: 0,
          commands: [],
          bootedDuringRun: false,
          installedDuringRun: false,
          launchedDuringRun: false,
          terminatedDuringRun: false,
          timing: "unknown",
        } satisfies DeviceInsight);

      existing.name = device?.name ?? existing.name;
      existing.runtime = device?.runtime ?? existing.runtime;
      existing.commandCount += 1;
      if (!existing.commands.includes(command)) existing.commands.push(command);
      existing.bootedDuringRun ||= command === "boot";
      existing.installedDuringRun ||= command === "install";
      existing.launchedDuringRun ||= command === "launch";
      existing.terminatedDuringRun ||= command === "terminate";
      if (eventTime) {
        existing.firstSeenAtMs =
          existing.firstSeenAtMs == null
            ? eventTime.ms
            : Math.min(existing.firstSeenAtMs, eventTime.ms);
        existing.lastSeenAtMs =
          existing.lastSeenAtMs == null
            ? eventTime.ms
            : Math.max(existing.lastSeenAtMs, eventTime.ms);
        existing.timing =
          existing.timing === "exact" && eventTime.estimated
            ? "estimated"
            : eventTime.estimated
              ? "estimated"
              : existing.timing === "unknown"
                ? "exact"
                : existing.timing;
      }
      byUdid.set(key, existing);
    }
  });

  const runEndMs = inferRunEndMs(run);
  return [...byUdid.values()]
    .map((device) => ({
      ...device,
      activeMs: inferDeviceOpenMs(device, runEndMs),
    }))
    .sort((a, b) => {
      const aTime = a.firstSeenAtMs ?? Number.POSITIVE_INFINITY;
      const bTime = b.firstSeenAtMs ?? Number.POSITIVE_INFINITY;
      return aTime - bTime || a.name.localeCompare(b.name);
    });
}

function inferRunEndMs(run: DeviceInsightRun): number | null {
  const finished = parseTimeMs(run.finishedAt);
  if (finished != null) return finished;
  const started = parseTimeMs(run.startedAt);
  if (started != null && run.durationMs != null) return started + run.durationMs;
  return null;
}

function inferDeviceOpenMs(
  device: Omit<DeviceInsight, "activeMs">,
  runEndMs: number | null,
): number | null {
  if (device.firstSeenAtMs == null) return null;
  if (device.terminatedDuringRun && device.lastSeenAtMs != null) {
    return Math.max(0, device.lastSeenAtMs - device.firstSeenAtMs);
  }
  const end = device.bootedDuringRun ? (runEndMs ?? device.lastSeenAtMs) : device.lastSeenAtMs;
  return end == null ? null : Math.max(0, end - device.firstSeenAtMs);
}

function stringifyToolInput(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    const command =
      stringField(record.command) ??
      stringField(record.cmd) ??
      stringField(record.input);
    if (command) return command;
  }
  return JSON.stringify(input) ?? "";
}

function extractUdids(input: string): string[] {
  const seen = new Set<string>();
  for (const match of input.matchAll(UDID_RE)) {
    seen.add(match[0].toUpperCase());
  }
  return [...seen];
}

function extractSimCommand(input: string): string | null {
  const match = input.match(/(?:^|\s)(?:\S*\/)?testcat-sim\s+(\S+)(?:\s+(\S+))?/);
  if (!match?.[1]) return null;
  if (match[1] === "chrome" && match[2] === "layout") return "chrome layout";
  return match[1];
}

function inferEventTimeMs(
  event: AgentEvent,
  index: number,
  totalEvents: number,
  run: DeviceInsightRun,
): { ms: number; estimated: boolean } | null {
  const direct = parseTimeMs(event.timestamp);
  if (direct != null) return { ms: direct, estimated: false };

  const start = parseTimeMs(run.startedAt);
  if (start == null) return null;
  if (run.durationMs == null || totalEvents <= 1) return { ms: start, estimated: true };

  return {
    ms: start + Math.round(run.durationMs * (index / (totalEvents - 1))),
    estimated: true,
  };
}

function parseTimeMs(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseDeviceInventory(output: string): RunDevice[] {
  const parsed = parsePossibleJson(output);
  if (!parsed || typeof parsed !== "object") return [];
  const candidates = Array.isArray(parsed)
    ? parsed
    : [
        ...arrayField(parsed, "running"),
        ...arrayField(parsed, "available"),
        ...arrayField(parsed, "devices"),
      ];
  return candidates.flatMap(normalizeDevice);
}

function parsePossibleJson(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (end < 0) return null;
  try {
    return JSON.parse(trimmed.slice(0, end + 1));
  } catch {
    return null;
  }
}

function arrayField(value: object, key: string): unknown[] {
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? field : [];
}

function normalizeDevice(value: unknown): RunDevice[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const udid = stringField(record.udid) ?? stringField(record.id);
  if (!udid) return [];
  return [
    {
      udid: udid.toUpperCase(),
      name: stringField(record.name) ?? "Simulator",
      runtime:
        stringField(record.runtime) ??
        stringField(record.osVersion) ??
        stringField(record.os) ??
        "",
    },
  ];
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
