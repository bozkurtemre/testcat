import { execFile } from "node:child_process";
import { dirname } from "node:path";
import type { AgentEvent, Device, RunRequest, RunWarmup } from "@testcat/shared";
import { resolveSimBin } from "../devices/sim-binary";

const MAX_BUFFER = 10 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 90_000;

type Emit = (event: AgentEvent) => void;

export async function warmUpSimulatorRun(input: {
  req: RunRequest;
  device: Device;
  emit: Emit;
  env: NodeJS.ProcessEnv;
}): Promise<RunWarmup> {
  const bin = resolveSimBin();
  let latest = input.device;

  await runSim(bin, ["list", "--json"], input.emit, input.env);
  if (!latest.isBooted) {
    await runSim(bin, ["boot", "--udid", latest.udid], input.emit, input.env);
    latest = { ...latest, state: "Booted", isBooted: true };
    await runSim(bin, ["list", "--json"], input.emit, input.env);
  }

  await runSim(
    bin,
    ["install", "--udid", latest.udid, "--app", input.req.buildPath],
    input.emit,
    input.env,
  );
  await runSim(
    bin,
    [
      "launch",
      "--udid",
      latest.udid,
      "--app",
      input.req.buildPath,
      "--terminate-running-process",
    ],
    input.emit,
    input.env,
  );
  const layout = await runSim(
    bin,
    ["chrome", "layout", "--udid", latest.udid],
    input.emit,
    input.env,
  );
  const ui = await runSim(
    bin,
    ["describe-ui", "--udid", latest.udid],
    input.emit,
    input.env,
  );

  return {
    ok: true,
    device: latest,
    summary: `Warm-up completed on ${latest.name} (${latest.udid}). App was installed, launched, and inspected.`,
    layout,
    ui,
  };
}

async function runSim(
  bin: string,
  args: string[],
  emit: Emit,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const command = `${bin} ${args.map(shellArg).join(" ")}`;
  emit({
    type: "tool_use",
    name: "testcat-sim",
    family: "exec",
    input: command,
  });

  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        cwd: args.includes("--app")
          ? dirname(args[args.indexOf("--app") + 1] ?? process.cwd())
          : process.cwd(),
        env,
        maxBuffer: MAX_BUFFER,
        timeout: COMMAND_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        const output = [stdout.toString(), stderr.toString()]
          .filter(Boolean)
          .join("\n")
          .trim();
        if (error) {
          const message = output || error.message;
          emit({ type: "tool_result", ok: false, output: message });
          reject(new Error(message));
          return;
        }
        emit({ type: "tool_result", ok: true, output });
        resolve(output);
      },
    );
  });
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
