# CLAUDE.md — @testcat/desktop

@AGENTS.md

Claude-specific:
- The renderer is sandboxed — never add `fs`, `child_process`, or `electron` imports there; put that logic in
  `src/main`.
- Repo-wide guidance: [root AGENTS.md](../../AGENTS.md).
