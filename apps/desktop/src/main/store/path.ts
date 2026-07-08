import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const DB_FILENAME = "testcat.sqlite";

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function defaultDataDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "testcat");
  }
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "testcat",
    );
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "testcat");
}

export function resolveDatabasePath(input = process.env.TESTCAT_DB_PATH): string {
  if (input?.trim()) return resolve(expandHome(input.trim()));
  return join(defaultDataDir(), DB_FILENAME);
}

export function ensureDatabaseDirectory(path = resolveDatabasePath()): string {
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
