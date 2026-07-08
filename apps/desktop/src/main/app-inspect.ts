import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AppBundleInfo } from "@testcat/shared";

type PlistJson = Record<string, unknown>;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

async function dirSize(path: string): Promise<number> {
  const s = await stat(path);
  if (!s.isDirectory()) return s.size;

  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map((entry) => dirSize(join(path, entry.name))),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

function readPlistJson(path: string): Promise<PlistJson> {
  return new Promise((resolve, reject) => {
    execFile("plutil", ["-convert", "json", "-o", "-", path], (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        resolve(JSON.parse(stdout.toString()) as PlistJson);
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function findInfoPlistPath(path: string): string | null {
  const candidates = [join(path, "Info.plist"), join(path, "Contents", "Info.plist")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function executableError(path: string, executable: string | null): string | undefined {
  if (!executable) return "CFBundleExecutable was not found in Info.plist.";
  const executablePath = join(path, executable);
  if (!existsSync(executablePath)) {
    return `Bundle executable was not found at ${executablePath}.`;
  }
  return undefined;
}

export async function inspectAppBundle(path: string): Promise<AppBundleInfo> {
  const base: AppBundleInfo = {
    path,
    exists: existsSync(path),
    name: null,
    displayName: null,
    bundleIdentifier: null,
    version: null,
    build: null,
    executable: null,
    sizeBytes: null,
  };

  if (!base.exists) return { ...base, error: "Build path does not exist." };

  const plistPath = findInfoPlistPath(path);
  try {
    const [plist, sizeBytes] = await Promise.all([
      plistPath
        ? readPlistJson(plistPath)
        : Promise.resolve({} as PlistJson),
      dirSize(path),
    ]);

    const displayName = asString(plist.CFBundleDisplayName);
    const name = asString(plist.CFBundleName);
    const executable = asString(plist.CFBundleExecutable);
    return {
      ...base,
      name: name ?? displayName,
      displayName,
      bundleIdentifier: asString(plist.CFBundleIdentifier),
      version: asString(plist.CFBundleShortVersionString),
      build: asString(plist.CFBundleVersion),
      executable,
      sizeBytes,
      error: plistPath
        ? executableError(path, executable)
        : "Info.plist was not found.",
    };
  } catch (error) {
    return {
      ...base,
      sizeBytes: await dirSize(path).catch(() => null),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
