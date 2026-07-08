# AGENTS.md — testcat

Canonical guidance for humans and coding agents working in this repo. (Each `CLAUDE.md` is a thin pointer to
this file plus tool-specific notes — keep the source of truth here.)

## What this is

testcat is an AI-agent-powered iOS simulator testing desktop app. A user defines a *test scenario* (name +
`.app` build + agent profile + prompt); an agent runtime (Claude Code, Codex, opencode, or Ollama Direct)
drives iOS simulators to run it while the user watches a streamed chat (left) and a live, view-only simulator
grid (right). Runs persist to SQLite for a dashboard.

This repo is currently an **M0 scaffold**: runnable empty shell + real DB schema + docs. No feature logic yet.

### Test-run flow (target architecture; built in later milestones)

```
Renderer (New Test form: Name, Build, Agent, Scenario)
  → IPC run:start → Main (orchestrator)
      1. fetch profile + scenario from the local SQLite store
      2. create a test_runs row {status:"running"}
      3. spawn agent CLI or start a direct local runner with profile (systemPrompt + skills + model/effort)
         + scenario prompt
      4. parse stdout stream → normalized AgentEvent → webContents.send(run:event)   [LEFT chat]
  ↕ renderer polls devices:list (testcat-sim list --json), opens view-only WS streams per
     booted sim and paints canvases. The agent decides which sims to boot.            [RIGHT grid]
  → on CLI exit: derive result+duration → patch test_runs + bulk events → run:done
  → dashboard re-queries runs:list
```

## Monorepo map

| Path | Package | Role |
|------|---------|------|
| `apps/desktop` | `@testcat/desktop` | Electron app. `main` = orchestrator (spawns CLI, parses stream, manages devices, owns SQLite persistence); `preload` = typed bridge; `renderer` = React/Vite UI. |
| `packages/shared` | `@testcat/shared` | Source-only TS types/contracts shared by desktop main/preload/renderer (AgentProfile, TestRun, AgentEvent, IPC channels). No build step. |
| `native/testcat-sim` | — | Swift CLI, forked from tddworks/baguette (Apache-2.0); web/serve stripped, renamed. Provides sim control + `screencast` (live MJPEG). Build: `swift build --package-path native/testcat-sim -c release`. |
| `skills/testcat-ios` | — | The agent control skill (forked baguette skill, renamed, control-only). The agent loads this to drive `testcat-sim`. |
| `agents/testcat-agent` | — | The QA & Test Automation identity every child-process test run assumes (installed into `~/.claude/agents` + `~/.codex/agents`; claude loads it via `--agent`, codex/opencode get its body prepended). Fully autonomous, read-only, evidence-based. |
| `assets/` | — | Brand marks (`testcat-dark.svg`, `testcat-light.svg`). |

Tooling: pnpm workspaces + Turborepo. Root configs: `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
`tsconfig.base.json`.

## Architecture — three processes

1. **Electron main** (`apps/desktop/src/main`) — the only place with Node/filesystem/child-process access.
   Owns the agent CLI child process, device lifecycle, stream parser, and local SQLite store.
2. **Renderer** (`apps/desktop/src/renderer`) — pure UI. No Node, no DB, no CLI. Talks only through
   `window.testcat` (contextBridge; `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`).

### IPC channels (`packages/shared/src/ipc.ts`)

| Channel | Direction | Payload |
|---------|-----------|---------|
| `run:start` | renderer→main invoke | `RunRequest` → `{runId}` |
| `run:cancel` | renderer→main invoke | `{runId}` |
| `run:event` | main→renderer send | `{runId, event: AgentEvent}` |
| `run:done` | main→renderer send | `RunDoneMessage` |
| `devices:list` | renderer→main invoke | → `Device[]` (from `testcat-sim list --json`) |
| `devices:serve-status` | renderer→main invoke | → `ServeStatus` |
| `profiles:*` / `runs:*` | renderer→main invoke | handled by Electron main's local SQLite store |

`AgentEvent` is the normalized union (`text_delta | thinking_delta | tool_use | tool_result | usage |
status`) that **both** CLI parsers emit, keeping the chat UI CLI-agnostic.

### Agent-CLI invocation (target)

- **Claude**: `claude -p --output-format stream-json --verbose --model <m> --append-system-prompt <sys> -- "<scenario>"` (NDJSON).
- **Codex**: `codex exec --json -m <m> -c model_reasoning_effort=<low|medium|high|xhigh> "<sys+scenario>"` (JSONL; no append-system-prompt — compose into the prompt).

## Commands

| Purpose | Command |
|---------|---------|
| Install | `pnpm install` |
| Typecheck all | `pnpm typecheck` |
| Build all | `pnpm build` |
| Dev desktop | `pnpm dev` |
| Dev desktop only | `pnpm --filter @testcat/desktop dev` |
| Generate migration | `pnpm db:generate` |
| Apply migration manually | `pnpm db:migrate` |
| Package desktop | `pnpm --filter @testcat/desktop package` |

First-time setup: `pnpm install` → `make sim-build`.

## Conventions

- **TypeScript strict**; `moduleResolution: "bundler"`. No `baseUrl` (deprecated in TS 6) — `@testcat/shared`
  resolves via its package `exports`; the renderer's `@/*` alias maps to `src/renderer`.
- **Cross-app types live in `@testcat/shared`** — don't redeclare `AgentProfile`/`TestRun`/`AgentEvent`/IPC
  payloads elsewhere; import them.
- **No Node in the renderer.** Anything touching fs/child_process/baguette/the agent CLI belongs in `main`.
- **IPC channel names are constants** (`IpcChannel`), never string literals at call sites.

## External tools (required, macOS only)

- **`testcat-sim`** — our own Swift CLI (in `native/testcat-sim`, forked from baguette). Two roles: the agent
  uses it for **control** (tap/swipe/boot/…) via the `testcat-ios` skill, and testcat consumes
  `testcat-sim screencast` (live MJPEG over stdout) to paint the **monitoring-only** grid. Must be built +
  on PATH (onboarding handles this). `testcat-sim list --json` enumerates sims.
- **`testcat-ios` skill** (`skills/testcat-ios`) — installed into the user's skills dir so the spawned agent
  loads it. Control-only; no serve/browser.
- **claude** / **codex** on `PATH`, or a local Ollama daemon — the agents that run tests.
- No `baguette serve`/`/farm` — testcat renders the live grid itself from `testcat-sim screencast`. (The CLI
  `stream` command does not deliver frames headless — always use `screencast`.)

## Gotchas

- `@testcat/shared` is source-only `.ts` → it must be **bundled** into main/preload, not externalized
  (`build.externalizeDeps: { exclude: ["@testcat/shared"] }` in `electron.vite.config.ts`). Otherwise the
  sandboxed preload would try to `require` a `.ts` file.
- Codex has no `--append-system-prompt`; compose the system prompt into the prompt argument.
- SQLite uses `TESTCAT_DB_PATH` when set; otherwise Electron main stores `testcat.sqlite` in the OS user-data
  directory. Run `make db-path` to print the effective path. Migrations run automatically when the store opens.
- Toolchain pin: Vite is held at 7 because electron-vite 5 (latest stable) doesn't support Vite 8 yet. Bump
  Vite→8 + electron-vite→6 when electron-vite 6 ships stable.
