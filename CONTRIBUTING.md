# Contributing to testcat

Thanks for your interest! Issues and pull requests are welcome.

## Development setup

Follow the [Quick start](README.md#quick-start-from-source) in the README — clone, `pnpm install`,
`make sim-build`, `pnpm dev`.

Requirements: macOS on Apple Silicon, Xcode, Node ≥ 24, pnpm 9.

## Before you open a PR

```bash
pnpm typecheck     # must be clean
make doctor        # typecheck + build + Electron smoke test
```

Logic that has a sibling `*.check.ts` file (e.g. `apps/desktop/src/main/agent/spawn.check.ts`) is verified by
running it directly: `pnpm --filter @testcat/desktop exec tsx <file>.check.ts`. If you change such a file,
run its check; if you add non-trivial logic, add a small check next to it.

## Conventions

The canonical guide is [AGENTS.md](AGENTS.md) (architecture, IPC contract, gotchas). The short version:

- TypeScript strict everywhere; cross-app types live in `packages/shared` — don't redeclare them.
- No Node/fs/child_process in the renderer; that logic belongs in `apps/desktop/src/main`.
- IPC channel names are constants (`IpcChannel`), never string literals.
- Keep diffs small and boring. Prefer deleting code over adding it.

Commit messages follow the conventional style used in the history (`feat: …`, `fix: …`, `docs: …`).

## Reporting bugs

Open a GitHub issue with: what you did, what you expected, what happened, and — if it concerns a test run —
the agent CLI + model used and the relevant lines from the run's chat/output.

For security issues, see [SECURITY.md](SECURITY.md) — please don't open a public issue.
