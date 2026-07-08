import { type ChildProcess, execFile, spawn } from "node:child_process";
import { type Device, IpcChannel } from "@testcat/shared";
import type { WebContents } from "electron";
import { getSettings } from "../settings-store";
import { resolveDeviceBin } from "./device-binary";
import { annotateDevicesUsage } from "./device-usage";
import { physicalDeviceEnv } from "./physical-helper";
import { resolveSimBin } from "./sim-binary";

const SOI = Buffer.from([0xff, 0xd8]); // JPEG start-of-image
const EOI = Buffer.from([0xff, 0xd9]); // JPEG end-of-image
const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const DISCOVER_MS = 2500; // re-scan for booted sims
const MIN_FRAME_GAP_MS = 33; // cap renderer sends to ~30 fps/device
const MAX_BUF = 16 * 1024 * 1024;

interface RawDev {
  udid: string;
  name: string;
  state: string;
  runtime: string;
}
interface Cast {
  proc: ChildProcess;
  name: string;
  kind: "simulator" | "physical";
  buf: Buffer;
  lastSent: number;
  startedAt: number;
}

// Live view-only grid feed: one `testcat-sim screencast` (continuous MJPEG over
// stdout) per booted sim. We demux JPEG frames (FF D8 … FF D9) and forward the
// freshest one to the renderer, capped at ~30fps to bound IPC. The screencast
// itself only emits on actual screen change (SeedFilter), so an idle sim is
// quiet. ponytail: base64-over-IPC is fine here; a local socket would scale
// to many devices / higher fps if it ever bites.
class DeviceMonitor {
  private wc: WebContents | null = null;
  private discoverTimer: ReturnType<typeof setInterval> | null = null;
  private casts = new Map<string, Cast>();
  private castCooldownUntil = new Map<string, number>();
  private discovering = false;
  private bin = "testcat-sim";
  private deviceBin = "testcat-device";

  watch(wc: WebContents): void {
    this.wc = wc;
    this.bin = resolveSimBin();
    if (this.discoverTimer) return;
    void this.discover();
    this.discoverTimer = setInterval(() => void this.discover(), DISCOVER_MS);
  }

  unwatch(): void {
    if (this.discoverTimer) clearInterval(this.discoverTimer);
    this.discoverTimer = null;
    for (const c of this.casts.values()) c.proc.kill("SIGTERM");
    this.casts.clear();
    this.castCooldownUntil.clear();
    this.wc = null;
  }

  async list(): Promise<Device[]> {
    const [simulators, physical] = await Promise.all([
      this.listSimulators().catch(() => []),
      this.listPhysicalDevices().catch(() => []),
    ]);
    return annotateDevicesUsage([...simulators, ...physical]);
  }

  private async listSimulators(): Promise<Device[]> {
    this.bin = resolveSimBin();
    const json = await this.run(this.bin, ["list", "--json"]);
    const d = JSON.parse(json) as { running?: RawDev[]; available?: RawDev[] };
    const seen = new Set<string>();
    const out: Device[] = [];
    for (const r of [...(d.running ?? []), ...(d.available ?? [])]) {
      if (seen.has(r.udid)) continue;
      seen.add(r.udid);
      out.push({
        id: r.udid,
        udid: r.udid,
        name: r.name,
        state: r.state,
        runtime: r.runtime,
        isBooted: r.state === "Booted",
        kind: "simulator",
        provider: "testcat-sim",
        isAvailable: true,
      });
    }
    return out;
  }

  private async listPhysicalDevices(): Promise<Device[]> {
    this.deviceBin = resolveDeviceBin();
    const json = await this.run(this.deviceBin, ["list", "--json"]);
    const d = JSON.parse(json) as { running?: Device[]; available?: Device[] };
    const seen = new Set<string>();
    const out: Device[] = [];
    for (const r of [...(d.running ?? []), ...(d.available ?? [])]) {
      if (seen.has(r.udid)) continue;
      seen.add(r.udid);
      out.push({
        ...r,
        id: r.id ?? r.udid,
        kind: "physical",
        provider: "testcat-device",
        isBooted: r.isBooted,
      });
    }
    return out;
  }

  private async discover(): Promise<void> {
    if (!this.wc || this.wc.isDestroyed()) return;
    if (this.discovering) return;
    this.discovering = true;
    let devices: Device[];
    const settings = await getSettings().catch(() => null);
    try {
      devices = await this.list();
    } catch {
      this.discovering = false;
      return; // testcat-sim missing / transient — retry next tick
    }
    try {
      const now = Date.now();
      const physicalEnv = physicalDeviceEnv(process.env, settings ?? undefined);
      const booted = new Set(devices.filter((d) => d.isBooted).map((d) => d.udid));
      for (const d of devices) {
        if (!d.isBooted || this.casts.has(d.udid)) continue;
        if ((this.castCooldownUntil.get(d.udid) ?? 0) > now) continue;
        // No live grid for physical devices: their screencast runs through the
        // device's single XCUITest session, so it reinstalls the runner app in
        // a loop and starves the actual test run of the device. Tests still
        // capture screenshots on demand.
        if (d.kind === "physical") continue;
        this.startCast(d, process.env);
      }
      for (const [udid, c] of this.casts) {
        if (!booted.has(udid)) {
          c.proc.kill("SIGTERM");
          this.casts.delete(udid);
        }
      }
    } finally {
      this.discovering = false;
    }
  }

  private startCast(device: Device, env: NodeJS.ProcessEnv): void {
    const kind = device.kind === "physical" ? "physical" : "simulator";
    const cmd = kind === "physical" ? this.deviceBin : this.bin;
    const args =
      kind === "physical"
        ? ["screencast", "--udid", device.udid, "--fps", "2", "--max-size", "900"]
        : ["screencast", "--udid", device.udid, "--scale", "2", "--quality", "0.6"];
    const proc = spawn(cmd, args, { env });
    const c: Cast = {
      proc,
      name: device.name,
      kind,
      buf: Buffer.alloc(0),
      lastSent: 0,
      startedAt: Date.now(),
    };
    const udid = device.udid;
    this.casts.set(udid, c);
    proc.stdout?.on("data", (chunk: Buffer) => this.onChunk(c, udid, chunk));
    const drop = () => {
      if (this.casts.get(udid) === c) this.casts.delete(udid);
      if (Date.now() - c.startedAt < 2000) {
        this.castCooldownUntil.set(udid, Date.now() + 10_000);
      }
    };
    proc.on("close", drop);
    proc.on("error", drop);
  }

  private onChunk(c: Cast, udid: string, chunk: Buffer): void {
    c.buf = c.buf.length ? Buffer.concat([c.buf, chunk]) : chunk;
    // Drain to the freshest complete image; drop intermediate frames.
    let latest: { bytes: Buffer; mime: "image/jpeg" | "image/png" } | null = null;
    for (;;) {
      const jpegStart = c.buf.indexOf(SOI);
      const pngStart = c.buf.indexOf(PNG_START);
      const starts = [jpegStart, pngStart].filter((index) => index >= 0);
      const start = starts.length ? Math.min(...starts) : -1;
      if (start < 0) {
        const keep = Math.max(SOI.length, PNG_START.length) - 1;
        if (c.buf.length > keep) c.buf = c.buf.subarray(c.buf.length - keep);
        break;
      }
      const isPng = pngStart === start;
      const marker = isPng ? PNG_END : EOI;
      const end = c.buf.indexOf(marker, start + (isPng ? PNG_START.length : SOI.length));
      if (end < 0) {
        if (start > 0) c.buf = c.buf.subarray(start);
        break;
      }
      const endOffset = end + marker.length;
      latest = {
        bytes: c.buf.subarray(start, endOffset),
        mime: isPng ? "image/png" : "image/jpeg",
      };
      c.buf = c.buf.subarray(endOffset);
    }
    if (c.buf.length > MAX_BUF) c.buf = Buffer.alloc(0);
    if (!latest) return;
    this.castCooldownUntil.delete(udid);

    const now = Date.now();
    if (now - c.lastSent < MIN_FRAME_GAP_MS) return; // throttle IPC
    c.lastSent = now;
    if (this.wc && !this.wc.isDestroyed()) {
      this.wc.send(IpcChannel.DeviceFrame, {
        udid,
        name: c.name,
        kind: c.kind,
        dataUrl: `data:${latest.mime};base64,${latest.bytes.toString("base64")}`,
      });
    }
  }

  private run(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(bin, args, { maxBuffer: MAX_BUF }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.toString());
      });
    });
  }
}

export const streamManager = new DeviceMonitor();
