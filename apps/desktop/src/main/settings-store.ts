import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppSettings, AppSettingsPatch } from "@testcat/shared";
import { app } from "electron";

const DEFAULT_SETTINGS: AppSettings = {
  defaultEnhanceProfileId: null,
  explorationProfileId: null,
  credentialTemplate: null,
  physicalDeviceTeamId: null,
  physicalDeviceBundleId: null,
};

function normalizeCredentialTemplate(
  value: unknown,
): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [slot, template] of Object.entries(value)) {
    if (typeof template === "string" && template.trim()) out[slot] = template;
  }
  return Object.keys(out).length ? out : null;
}

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function normalizeSettings(value: unknown): AppSettings {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    defaultEnhanceProfileId:
      typeof raw.defaultEnhanceProfileId === "string" &&
      raw.defaultEnhanceProfileId.trim()
        ? raw.defaultEnhanceProfileId
        : null,
    explorationProfileId:
      typeof raw.explorationProfileId === "string" &&
      raw.explorationProfileId.trim()
        ? raw.explorationProfileId
        : null,
    credentialTemplate: normalizeCredentialTemplate(raw.credentialTemplate),
    physicalDeviceTeamId:
      typeof raw.physicalDeviceTeamId === "string" &&
      raw.physicalDeviceTeamId.trim()
        ? raw.physicalDeviceTeamId.trim()
        : null,
    physicalDeviceBundleId:
      typeof raw.physicalDeviceBundleId === "string" &&
      raw.physicalDeviceBundleId.trim()
        ? raw.physicalDeviceBundleId.trim()
        : null,
  };
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSettings(
  patch: AppSettingsPatch,
): Promise<AppSettings> {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  const path = settingsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
