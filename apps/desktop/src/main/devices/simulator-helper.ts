import { execFile } from "node:child_process";
import type { Device, SimulatorKillResult } from "@testcat/shared";
import { streamManager } from "./stream-manager";
import { resolveSimBin } from "./sim-binary";

const exec = (bin: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 30_000 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.toString().trim() || err.message));
        return;
      }
      resolve();
    });
  });

export async function killAllSimulators(): Promise<SimulatorKillResult> {
  const bin = resolveSimBin();
  const booted = (await streamManager.list()).filter(
    (device) => device.isBooted && device.kind !== "physical",
  );
  const killed: Device[] = [];
  const failed: SimulatorKillResult["failed"] = [];

  await Promise.all(
    booted.map(async (device) => {
      try {
        await exec(bin, ["shutdown", "--udid", device.udid]);
        killed.push(device);
      } catch (error) {
        failed.push({
          device,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return { requested: booted.length, killed, failed };
}
