import { statSync } from "node:fs";
import { join } from "node:path";

// Identity for the per-build exploration cache. A `.app` is a directory and its
// own mtime is not reliably bumped on rebuild, so we stat Info.plist (rewritten
// every build) and fold in path + size + mtime. ponytail: hash the whole bundle
// only if Info.plist mtime ever proves too coarse to bust the cache.
export function formatBuildKey(
  path: string,
  sizeBytes: number,
  mtimeMs: number,
): string {
  return `${path}:${sizeBytes}:${Math.round(mtimeMs)}`;
}

export function buildKeyForApp(appPath: string): string {
  for (const probe of ["Info.plist", ""]) {
    try {
      const target = probe ? join(appPath, probe) : appPath;
      const stat = statSync(target);
      return formatBuildKey(appPath, stat.size, stat.mtimeMs);
    } catch {
      // Probe missing; try the next one.
    }
  }
  // Last resort: path only. Cache still works; it just never busts on rebuild.
  return `${appPath}:unknown`;
}
