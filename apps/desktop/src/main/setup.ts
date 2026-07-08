import { execFile } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentCli,
  SetupInstallResult,
  SetupInstallTarget,
  SetupStatus,
} from "@testcat/shared";
import { shell } from "electron";
import { resolveDeviceBin } from "./devices/device-binary";
import { resolveSimBin } from "./devices/sim-binary";
import { streamManager } from "./devices/stream-manager";
import { isOllamaReachable } from "./ollama-codex";
import { store } from "./store/store";

const onPath = (bin: string): Promise<boolean> =>
  new Promise((res) => execFile("which", [bin], (err) => res(!err)));

/**
 * GUI-launched Electron apps only get the minimal launchd PATH, so CLIs
 * installed via brew/nvm (claude, codex, node, npm) are invisible to a
 * packaged testcat. Adopt the user's login-shell PATH once at startup —
 * detection AND spawned test runs both read process.env afterwards.
 */
export function adoptLoginShellPath(): Promise<void> {
  if (process.platform !== "darwin") return Promise.resolve();
  const loginShell = process.env.SHELL || "/bin/zsh";
  const mark = "__TESTCAT_PATH__";
  return new Promise((resolve) => {
    execFile(
      loginShell,
      ["-ilc", `printf '${mark}%s${mark}' "$PATH"`],
      { timeout: 5000 },
      (err, stdout) => {
        const shellPath = err ? null : stdout?.toString().split(mark)[1];
        if (shellPath) {
          const merged = [
            ...new Set([
              ...shellPath.split(":"),
              ...(process.env.PATH ?? "").split(":"),
            ]),
          ].filter(Boolean);
          process.env.PATH = merged.join(":");
        }
        resolve();
      },
    );
  });
}

const cliVersion = (bin: string): Promise<string | null> =>
  new Promise((res) =>
    execFile(bin, ["--version"], { timeout: 4000 }, (err, stdout) =>
      res(err ? null : stdout.toString().trim() || null),
    ),
  );

const commandOk = (bin: string, args: string[]): Promise<boolean> =>
  new Promise((res) =>
    execFile(bin, args, { timeout: 8000 }, (err) => res(!err)),
  );

export async function getCliVersions(): Promise<
  Record<AgentCli, string | null>
> {
  const [claude, codex, opencode, ollama] = await Promise.all([
    cliVersion("claude"),
    cliVersion("codex"),
    cliVersion("opencode"),
    isOllamaReachable(),
  ]);
  return {
    claude,
    codex,
    opencode,
    ollama: ollama ? "Ollama daemon reachable" : null,
  };
}

// The spawned agent loads the skill from its CLI's skills dir.
const SKILL_DIRS = [
  ".claude/skills/testcat-ios",
  ".agents/skills/testcat-ios",
  ".codex/skills/testcat-ios",
];
const skillInstalled = (): boolean =>
  SKILL_DIRS.some((p) => existsSync(join(homedir(), p)));

// The QA & Test Automation identity child-process runs assume (repo:
// agents/testcat-agent). claude loads it via --agent; codex/opencode get its
// body prepended to the composed prompt.
const AGENT_FILES = [
  ".claude/agents/testcat-agent.md",
  ".codex/agents/testcat-agent.md",
];
const testcatAgentInstalled = (): boolean =>
  AGENT_FILES.some((p) => existsSync(join(homedir(), p)));

// Bundled copies of skills/testcat-ios + agents/testcat-agent ship as
// extraResources; dev falls back to the repo checkout (same candidate walk as
// the binary resolvers).
function resolveAsset(rel: string): string | null {
  const candidates = [
    ...(process.resourcesPath ? [join(process.resourcesPath, rel)] : []),
    join(__dirname, "../../../../", rel),
    join(process.cwd(), "../../", rel),
    join(process.cwd(), rel),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/**
 * First-launch install of the agent-facing assets so a packaged app works
 * without the repo. Copies only when the destination is missing — never
 * overwrites a user's local edits.
 */
export function ensureAgentAssetsInstalled(): void {
  const home = homedir();
  const skillSrc = resolveAsset("skills/testcat-ios");
  if (skillSrc) {
    for (const dest of SKILL_DIRS.map((p) => join(home, p))) {
      if (existsSync(dest)) continue;
      try {
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(skillSrc, dest, { recursive: true });
      } catch {
        // Non-fatal: the setup checklist surfaces what's still missing.
      }
    }
  }
  const agentSrc = resolveAsset("agents/testcat-agent/testcat-agent.md");
  if (agentSrc) {
    for (const dest of AGENT_FILES.map((p) => join(home, p))) {
      if (existsSync(dest)) continue;
      try {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(agentSrc, dest);
      } catch {
        // Non-fatal: the setup checklist surfaces what's still missing.
      }
    }
  }
}

const NPM_PACKAGES: Partial<Record<SetupInstallTarget, string>> = {
  claude: "@anthropic-ai/claude-code",
  codex: "@openai/codex",
  opencode: "opencode-ai",
};

/** One-click installs behind the setup checklist's Install buttons. */
export async function installSetupTarget(
  target: SetupInstallTarget,
): Promise<SetupInstallResult> {
  if (target === "ollama") {
    await shell.openExternal("https://ollama.com/download");
    return {
      ok: true,
      message:
        "Opened the Ollama download page — install it, start the daemon, then Re-check.",
    };
  }
  if (target === "agent-assets") {
    ensureAgentAssetsInstalled();
    const ok = skillInstalled() && testcatAgentInstalled();
    return {
      ok,
      message: ok
        ? "Installed the bundled testcat-ios skill and testcat-agent identity."
        : "Bundled assets not found — reinstall testcat or copy them from the repo.",
    };
  }
  const pkg = NPM_PACKAGES[target];
  if (!pkg) return { ok: false, message: `Unknown install target: ${target}` };
  if (!(await onPath("npm"))) {
    return {
      ok: false,
      message:
        "npm not found — install Node.js first (nodejs.org), then retry.",
    };
  }
  return new Promise((res) =>
    execFile(
      "npm",
      ["install", "-g", pkg],
      { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (!err) return res({ ok: true, message: `Installed ${pkg}.` });
        const tail =
          stderr?.toString().trim().split("\n").slice(-3).join("\n") ||
          String(err);
        res({ ok: false, message: `npm install failed:\n${tail}` });
      },
    ),
  );
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const simBin = resolveSimBin();
  const deviceBin = resolveDeviceBin();
  const [claude, codex, opencode, ollama, simOnPath, deviceOnPath] =
    await Promise.all([
      onPath("claude"),
      onPath("codex"),
      onPath("opencode"),
      isOllamaReachable(),
      onPath("testcat-sim"),
      onPath("testcat-device"),
    ]);
  const simReady = simBin !== "testcat-sim" ? existsSync(simBin) : simOnPath;
  const deviceResolvable =
    deviceBin !== "testcat-device" ? existsSync(deviceBin) : deviceOnPath;
  const deviceReady = deviceResolvable
    ? await commandOk(deviceBin, ["doctor"])
    : false;

  let profiles = 0;
  let runs = 0;
  let databaseReady = false;
  let physicalDevices = 0;
  try {
    const [ps, rs] = await Promise.all([
      store.profilesList(),
      store.runsList(),
    ]);
    profiles = ps.length;
    runs = rs.length;
    databaseReady = true;
  } catch {
    // Database unavailable - leave counts at 0.
  }
  try {
    physicalDevices = (await streamManager.list()).filter(
      (device) => device.kind === "physical",
    ).length;
  } catch {
    physicalDevices = 0;
  }

  return {
    // resolveSimBin returns the bare name only when no real binary was found.
    testcatSim: simReady,
    testcatDevice: deviceReady,
    claude,
    codex,
    opencode,
    ollama,
    skill: skillInstalled(),
    testcatAgent: testcatAgentInstalled(),
    database: databaseReady,
    profiles,
    runs,
    physicalDevices,
  };
}
