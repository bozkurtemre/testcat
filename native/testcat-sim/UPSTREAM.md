# Upstream tracking — testcat-sim

Forked from [tddworks/baguette](https://github.com/tddworks/baguette) (Apache-2.0).

| What | State |
|------|-------|
| Fork point (Swift CLI) | ~v0.1.61 (binary `--version` reports 0.1.61) |
| Removed from fork | `serve` (web UI/farm), WebSocket routes |
| Added in fork | `screencast`, `complete`, `double-tap`*, `orientation`*, `status-bar`* (*may partially overlap upstream) |
| Ported from upstream post-fork | `paste`, `clipboard get/sync/copy`, `location set/start/clear` (from v0.1.80, 2026-07-14) |
| Skill (`skills/testcat-ios`) last reconciled against | upstream `skills/baguette` @ **v0.1.80** (2026-07-14) |
| Known upstream features NOT in fork | `add-media`, camera WS |

## Reconciling the skill with a new upstream release

1. Clone upstream, read `CHANGELOG.md` from the version above to HEAD.
2. Ground truth for what may be documented = the subcommand registry in
   `Sources/Baguette/App/RootCommand.swift` — never upstream's docs.
3. Port applicable skill changes with the rename map `baguette → testcat-sim`;
   skip anything requiring `serve`/WebSockets or commands absent from the registry.
4. Never drop the testcat-specific sections of `skills/testcat-ios/SKILL.md`
   (headless contract, text-entry/pasteboard recipe, physical-device contract,
   alert-window coordinate caveat, parsing notes, push notifications).
5. Gate: every `testcat-sim <cmd>` mentioned in the skill files must exist in
   the registry (grep the docs, compare against RootCommand.swift).
6. Sync the skill to `~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills`,
   and update this table's "last reconciled" row.
