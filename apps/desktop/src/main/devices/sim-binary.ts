import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

/**
 * Resolve the `testcat-sim` binary. Order: explicit env → dev build in the repo
 * → PATH (where onboarding installs it).
 */
export function resolveSimBin(): string {
  const env = process.env.TESTCAT_SIM_BIN;
  if (env && existsSync(env)) return env;

  const rel = "native/testcat-sim/.build/release/testcat-sim";
  const packagedRel = "native/testcat-sim/.build/release/testcat-sim";
  const candidates = [
    ...(process.resourcesPath
      ? [join(process.resourcesPath, packagedRel)]
      : []),
    // out/main → … → repo root (electron-vite dev + packaged-but-unbundled)
    join(__dirname, "../../../../", rel),
    // cwd is apps/desktop in dev
    join(process.cwd(), "../../", rel),
    join(process.cwd(), rel),
  ];
  for (const c of candidates) if (existsSync(c)) return c;

  return "testcat-sim";
}

export function envWithSimBinOnPath(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const bin = resolveSimBin();
  if (bin === "testcat-sim") return env;

  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const currentPath = env[pathKey] ?? "";
  return {
    ...env,
    TESTCAT_SIM_BIN: bin,
    [pathKey]: [dirname(bin), currentPath].filter(Boolean).join(delimiter),
  };
}
