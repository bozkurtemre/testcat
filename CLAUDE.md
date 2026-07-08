# CLAUDE.md

@AGENTS.md

Claude Code-specific notes (everything else is in the imported AGENTS.md):

- Per-app guidance: [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md).
- When testcat spawns an agent CLI to run a test, the agent acts on the **simulator**, not this codebase —
  the repo-side posture for those runs is read-only. Edits to testcat itself follow normal review.
- Prefer exploring/planning before large edits; keep cross-app types in `@testcat/shared`.
