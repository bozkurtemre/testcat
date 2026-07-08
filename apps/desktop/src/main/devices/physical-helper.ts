import { execFile } from "node:child_process";
import type { PhysicalDevicePrepareResult } from "@testcat/shared";
import { getSettings } from "../settings-store";
import { resolveDeviceBin } from "./device-binary";

export function physicalDeviceEnv(
  env: NodeJS.ProcessEnv = process.env,
  settings?: {
    physicalDeviceTeamId?: string | null;
    physicalDeviceBundleId?: string | null;
  },
): NodeJS.ProcessEnv {
  return {
    ...env,
    ...(settings?.physicalDeviceTeamId
      ? { TESTCAT_DEVICE_IOS_TEAM_ID: settings.physicalDeviceTeamId }
      : {}),
    ...(settings?.physicalDeviceBundleId
      ? { TESTCAT_DEVICE_IOS_BUNDLE_ID: settings.physicalDeviceBundleId }
      : {}),
  };
}

export async function preparePhysicalDevice(
  udid: string,
): Promise<PhysicalDevicePrepareResult> {
  const settings = await getSettings();
  const bin = resolveDeviceBin();
  return new Promise((resolve) => {
    execFile(
      bin,
      ["prepare", "--udid", udid],
      {
        env: physicalDeviceEnv(process.env, settings),
        timeout: 240_000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const output = [stdout.toString(), stderr.toString()]
          .filter(Boolean)
          .join("\n")
          .trim();
        resolve({
          ok: !error,
          output: output || error?.message || "Prepared physical device runner.",
        });
      },
    );
  });
}
