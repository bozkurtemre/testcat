import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { envWithSimBinOnPath } from "./sim-binary";

/**
 * Resolve the repo-owned physical iOS device CLI. It is a Testcat wrapper
 * around vendored upstream runtime, not an external agent-device install.
 */
export function resolveDeviceBin(): string {
  const env = process.env.TESTCAT_DEVICE_BIN;
  if (env && existsSync(env)) return env;

  const rel = "native/testcat-device/testcat-device";
  const candidates = [
    ...(process.resourcesPath ? [join(process.resourcesPath, rel)] : []),
    join(__dirname, "../../../../", rel),
    join(process.cwd(), "../../", rel),
    join(process.cwd(), rel),
  ];
  for (const c of candidates) if (existsSync(c)) return c;

  return "testcat-device";
}

export function envWithDeviceBinsOnPath(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const withSim = envWithSimBinOnPath(env);
  const bin = resolveDeviceBin();
  if (bin === "testcat-device") return withSim;

  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const currentPath = withSim[pathKey] ?? "";
  return {
    ...withSim,
    TESTCAT_DEVICE_BIN: bin,
    [pathKey]: [dirname(bin), currentPath].filter(Boolean).join(delimiter),
  };
}
