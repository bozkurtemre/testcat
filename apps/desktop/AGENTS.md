# AGENTS.md — @testcat/desktop

Electron app: local orchestrator + UI. Repo-wide context is in the [root AGENTS.md](../../AGENTS.md).

## Process model

- **`src/main`** — Electron main = orchestrator. Node + fs + child_process access. Creates the
  `BrowserWindow`, registers IPC, and (in later milestones) spawns the agent CLI, runs the stream parser, and
  manages device streams and local SQLite persistence. `index.ts` = lifecycle; `ipc.ts` = handler registration.
- **`src/preload/index.ts`** — the only bridge. Exposes the typed `window.testcat` API (`TestcatApi` from
  `@testcat/shared`) over `contextBridge`. Sandboxed: no Node leaks to the renderer.
- **`src/renderer`** — React + Vite UI. Pure presentation over IPC. No Node, no DB, no CLI.

Window is created with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.

## IPC contract

Channel names + payload types are defined once in `@testcat/shared` (`IpcChannel`, `RunRequest`,
`AgentEvent`, `Device`, …). Main registers `ipcMain.handle(...)` per channel; preload wraps each in a thin
`ipcRenderer.invoke`/`on`. Renderer calls `window.testcat.*`. See the IPC table in the root AGENTS.md.

In M0 the handlers are **inert** (return placeholders / throw "not implemented"). The intended split as this
grows: `src/main/ipc/{run,profiles,devices,runs}.ts` instead of the single `ipc.ts`.

## Agent orchestration (target — `src/main/agent/`)

`detect.ts` (which CLI/server is available) → `spawn.ts` for Claude/Codex child processes or a direct local
runner for Ollama → `parsers/{claude,codex}.ts` (stdout → normalized `AgentEvent`) or direct runner
events → `run-controller.ts` (one TestRun end-to-end: start, stream to renderer, persist via the local
SQLite store). All paths must emit the same `AgentEvent` union.

## Live device grid (`src/renderer/features/device-grid/` — target)

View-only. Poll `devices:list` (→ `baguette list --json`), and for each booted sim open
`ws://127.0.0.1:<BAGUETTE_PORT>/simulators/<UDID>/stream?format=mjpeg`, decode frames, and paint a `<canvas>`
tile. **Never** wire the gesture/input channel — there's no control path to build, so view-only is the
default, not a thing to disable. Tiles are larger than baguette's `/farm`.

## Renderer rules

- shadcn components live in `src/renderer/components/ui`; the brand theme + tokens are in
  `src/renderer/styles/globals.css` (Tailwind v4 `@theme inline` + oklch). Use token classes
  (`bg-background`, `text-primary`, …), not hex.
- Import shared types from `@testcat/shared`; use the `@/` alias for renderer-local modules.
- No `fs`, `child_process`, `electron` imports in the renderer — that's main's job.

## Commands

- `pnpm --filter @testcat/desktop dev` — electron-vite dev (launches the window).
- `pnpm --filter @testcat/desktop build` — bundle main/preload/renderer to `out/`.
- `pnpm --filter @testcat/desktop typecheck` — `tsc --noEmit`.
- `pnpm --filter @testcat/desktop package` — build + electron-builder (mac dmg/zip → `release/`).

## Gotchas

- `@testcat/shared` is excluded from dependency externalization in `electron.vite.config.ts` so it gets
  bundled (it's source-only `.ts`).
- One permissive `tsconfig.json` covers main + preload + renderer (node + DOM libs). Production could split
  into per-environment tsconfigs if the looseness ever bites.
- If `pnpm dev` fails with `Error: Electron uninstall`, the Electron binary wasn't fetched (pnpm gated the
  postinstall). Fix: `node node_modules/.pnpm/electron@*/node_modules/electron/install.js` (or
  `pnpm rebuild electron`). `electron` is in the root `pnpm.onlyBuiltDependencies` so a clean install should
  fetch it.
