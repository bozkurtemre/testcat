import type { Device, DeviceUsage } from "@testcat/shared";

export type DeviceUsageClaim = Omit<DeviceUsage, "inUse">;

const UDID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const usageByUdid = new Map<string, DeviceUsage>();

export function annotateDeviceUsage<T extends Device>(device: T): T {
  return {
    ...device,
    usage: usageByUdid.get(normalizeUdid(device.udid)) ?? null,
  };
}

export function annotateDevicesUsage<T extends Device>(devices: T[]): T[] {
  return devices.map(annotateDeviceUsage);
}

export function reserveDeviceUsage(udid: string, claim: DeviceUsageClaim): void {
  usageByUdid.set(normalizeUdid(udid), { ...claim, inUse: true });
}

export function reserveDevicesUsage(
  udids: string[],
  claim: DeviceUsageClaim,
): void {
  for (const udid of udids) reserveDeviceUsage(udid, claim);
}

export function releaseDeviceUsageForRun(runId: string): void {
  for (const [udid, usage] of usageByUdid) {
    if (usage.runId === runId) usageByUdid.delete(udid);
  }
}

export function clearDeviceUsage(): void {
  usageByUdid.clear();
}

export function deviceUsageForUdid(udid: string): DeviceUsage | null {
  return usageByUdid.get(normalizeUdid(udid)) ?? null;
}

export function deviceUsageSnapshot(): DeviceUsage[] {
  return [...usageByUdid.values()];
}

export function extractUdidsFromText(value: string): string[] {
  return [...value.matchAll(UDID_RE)].map((match) => normalizeUdid(match[0]));
}

export function extractUdidsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return extractUdidsFromText(value);
  try {
    return extractUdidsFromText(JSON.stringify(value));
  } catch {
    return [];
  }
}

export function freeSimulatorCandidates(devices: Device[]): Device[] {
  return devices
    .filter((device) => device.kind !== "physical")
    .filter((device) => device.isAvailable !== false)
    .filter((device) => !deviceUsageForUdid(device.udid));
}

/**
 * Pick up to `count` free simulators for a run, best-first with the same
 * ranking the single-sim selection always used: booted iPhones, then other
 * booted sims, then shutdown iPhones, then anything else. May return fewer
 * than requested when not enough free simulators exist.
 */
export function selectSimulatorsForRun(devices: Device[], count: number): Device[] {
  const candidates = freeSimulatorCandidates(devices);
  const isIphone = (device: Device) => /iphone/i.test(device.name);
  const ranked = [
    ...candidates.filter((device) => device.isBooted && isIphone(device)),
    ...candidates.filter((device) => device.isBooted && !isIphone(device)),
    ...candidates.filter((device) => !device.isBooted && isIphone(device)),
    ...candidates.filter((device) => !device.isBooted && !isIphone(device)),
  ];
  return ranked.slice(0, Math.max(1, count));
}

export function selectSimulatorForRun(devices: Device[]): Device | null {
  return selectSimulatorsForRun(devices, 1)[0] ?? null;
}

function normalizeUdid(udid: string): string {
  return udid.trim().toUpperCase();
}
