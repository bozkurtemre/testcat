#!/usr/bin/env node
// Upstream-sync tooling for the baguette fork (native/testcat-sim + skills/testcat-ios).
// Automates the playbook in native/testcat-sim/UPSTREAM.md. Plain Node, no dependencies.
//
//   --check  report upstream drift (new baguette tags, CHANGELOG delta, skill file
//            diff summary, vendored agent-device version). Report-only: exits 0
//            even when behind; skill content is never auto-merged.
//   --gate   verify every `testcat-sim <cmd>` mentioned in skills/testcat-ios/**/*.md
//            exists in the subcommand registry in RootCommand.swift. Exits 1 on
//            any unknown command.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const UPSTREAM_REPO = "https://github.com/tddworks/baguette";
const UPSTREAM_SKILL_DIR = "skills/baguette";
const LOCAL_SKILL_DIR = "skills/testcat-ios";
const ROOT_COMMAND = "native/testcat-sim/Sources/Baguette/App/RootCommand.swift";
const SWIFT_SOURCES = "native/testcat-sim/Sources/Baguette";
const UPSTREAM_MD = "native/testcat-sim/UPSTREAM.md";
const DEVICE_NOTICE = "native/testcat-device/NOTICE";
const DEVICE_API = "https://api.github.com/repos/callstack/agent-device";

function die(msg) {
  console.error(`sync-upstream: ${msg}`);
  process.exit(1);
}

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Registry: RootCommand.swift subcommands -> CLI names
// ---------------------------------------------------------------------------

function parseRegistryTypes() {
  const src = fs.readFileSync(path.join(ROOT, ROOT_COMMAND), "utf8");
  const arr = src.match(/subcommands:\s*\[([^\]]*)\]/);
  if (!arr) die(`no subcommands array found in ${ROOT_COMMAND}`);
  const types = [...arr[1].matchAll(/(\w+)\.self/g)].map((m) => m[1]);
  if (types.length === 0) die(`empty subcommands array in ${ROOT_COMMAND}`);
  return types;
}

// swift-argument-parser default when commandName is omitted: type name kebab-cased.
function kebabCase(type) {
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

// Map each registry type to its CLI name via the commandName in its
// CommandConfiguration. Top-level command structs start at column 0 and
// declare their configuration before any nested subcommand struct, so the
// first commandName inside the [struct decl .. next column-0 decl) slice is
// the right one.
function resolveCliNames(types) {
  const sources = walk(path.join(ROOT, SWIFT_SOURCES), (f) => f.endsWith(".swift")).map((f) =>
    fs.readFileSync(f, "utf8")
  );
  const names = new Map(); // cli name -> type
  for (const type of types) {
    let cli = null;
    for (const src of sources) {
      const decl = src.match(new RegExp(`^(?:public |final )*struct ${type}\\b`, "m"));
      if (!decl) continue;
      const rest = src.slice(decl.index + decl[0].length);
      const next = rest.search(/^(?:public |final )*(?:struct|class|enum|extension)\s/m);
      const body = next === -1 ? rest : rest.slice(0, next);
      const m = body.match(/commandName:\s*"([^"]+)"/);
      if (m) {
        cli = m[1];
      } else {
        cli = kebabCase(type);
        console.error(`sync-upstream: warning: ${type} has no explicit commandName; assuming "${cli}"`);
      }
      break;
    }
    if (!cli) die(`registry type ${type} not found under ${SWIFT_SOURCES}`);
    names.set(cli, type);
  }
  return names;
}

// ---------------------------------------------------------------------------
// --gate
// ---------------------------------------------------------------------------

// `testcat-sim <cmd>` where <cmd> starts with a letter, on one line. Horizontal
// whitespace only, so prose like "`testcat-sim`\nCLI" and path mentions like
// native/testcat-sim/Sources never produce a token; flags and <placeholders>
// don't match the leading [A-Za-z].
const TOKEN_RE = /testcat-sim[ \t]+([A-Za-z][A-Za-z0-9_-]*)/g;

function extractSkillTokens() {
  const tokens = [];
  const files = walk(path.join(ROOT, LOCAL_SKILL_DIR), (f) => f.endsWith(".md"));
  for (const file of files) {
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(TOKEN_RE)) {
          tokens.push({ cmd: m[1], file: path.relative(ROOT, file), line: i + 1 });
        }
      });
  }
  return tokens;
}

function runGate() {
  const registry = resolveCliNames(parseRegistryTypes());
  const allowed = new Set([...registry.keys(), "help"]); // `help` is ArgumentParser's builtin
  const tokens = extractSkillTokens();
  if (tokens.length === 0) {
    die(`no \`testcat-sim <cmd>\` tokens found in ${LOCAL_SKILL_DIR} — extractor drift?`);
  }
  const bad = tokens.filter((t) => !allowed.has(t.cmd));
  const used = new Set(tokens.map((t) => t.cmd));
  if (bad.length > 0) {
    console.error(`gate: FAIL — skill docs mention commands missing from the ${path.basename(ROOT_COMMAND)} registry:`);
    for (const t of bad) console.error(`  ${t.file}:${t.line}  testcat-sim ${t.cmd}`);
    console.error(`\nregistry commands: ${[...registry.keys()].sort().join(", ")}`);
    process.exit(1);
  }
  console.log(
    `gate: OK — ${tokens.length} \`testcat-sim <cmd>\` mentions (${used.size} distinct commands) across ` +
      `${new Set(tokens.map((t) => t.file)).size} files all exist in the registry (${registry.size} commands).`
  );
}

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------

function parseReconciledVersion() {
  const md = fs.readFileSync(path.join(ROOT, UPSTREAM_MD), "utf8");
  const line = md.split("\n").find((l) => l.includes("last reconciled"));
  const m = line && line.match(/@\s*\*{0,2}v?(\d+\.\d+\.\d+)/);
  if (!m) die(`could not parse the "last reconciled" version from ${UPSTREAM_MD}`);
  return m[1];
}

function semverCmp(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function latestUpstreamTag(cloneDir) {
  const out = execFileSync("git", ["-C", cloneDir, "ls-remote", "--tags", "origin"], {
    encoding: "utf8",
  });
  const versions = new Set();
  for (const m of out.matchAll(/refs\/tags\/v?(\d+\.\d+\.\d+)(?:\^\{\})?$/gm)) versions.add(m[1]);
  if (versions.size === 0) die("no semver tags found on upstream");
  return [...versions].sort(semverCmp).at(-1);
}

function changelogDelta(cloneDir, from, to) {
  const file = path.join(cloneDir, "CHANGELOG.md");
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  // keep-a-changelog headings: "## [0.1.80] - 2026-07-13"
  const marks = [...text.matchAll(/^##\s*\[?v?(\d+\.\d+\.\d+)\]?.*$/gm)].map((m) => ({
    version: m[1],
    index: m.index,
  }));
  const sections = [];
  for (let i = 0; i < marks.length; i++) {
    const { version, index } = marks[i];
    if (semverCmp(version, from) > 0 && semverCmp(version, to) <= 0) {
      const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
      sections.push(text.slice(index, end).replace(/\n---\s*$/, "").trimEnd());
    }
  }
  return sections;
}

function normalizeRename(text) {
  return text.replaceAll("baguette", "testcat-sim");
}

function skillDiffSummary(cloneDir) {
  const upstreamDir = path.join(cloneDir, UPSTREAM_SKILL_DIR);
  const localDir = path.join(ROOT, LOCAL_SKILL_DIR);
  if (!fs.existsSync(upstreamDir)) {
    console.log(`  upstream has no ${UPSTREAM_SKILL_DIR}/ — nothing to compare`);
    return;
  }
  const rel = (base) => (f) => path.relative(base, f);
  const upstream = new Set(walk(upstreamDir, () => true).map(rel(upstreamDir)));
  const local = new Set(walk(localDir, () => true).map(rel(localDir)));
  for (const f of [...upstream].sort()) {
    if (!local.has(f)) {
      console.log(`  upstream-only: ${f}  (TODO: decide whether to port)`);
      continue;
    }
    const a = normalizeRename(fs.readFileSync(path.join(upstreamDir, f), "utf8"));
    const b = fs.readFileSync(path.join(localDir, f), "utf8");
    if (a === b) {
      console.log(`  in sync:       ${f} (identical modulo baguette→testcat-sim rename)`);
    } else {
      const la = a.split("\n").length;
      const lb = b.split("\n").length;
      console.log(`  differs:       ${f} (upstream ${la} lines vs local ${lb} — intentional fork divergence; review on version bump)`);
    }
  }
  for (const f of [...local].sort()) {
    if (!upstream.has(f)) console.log(`  local-only:    ${f}`);
  }
}

async function githubJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "testcat-sync-upstream", accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Best-effort: report vendored agent-device vs upstream's latest release. Never fatal.
async function agentDeviceReport() {
  let vendored = null;
  try {
    vendored = fs
      .readFileSync(path.join(ROOT, DEVICE_NOTICE), "utf8")
      .match(/Package version:\s*v?([\w.\-]+)/)?.[1];
  } catch {
    // fall through
  }
  if (!vendored) {
    console.log(`  could not parse vendored version from ${DEVICE_NOTICE}`);
    return;
  }
  let latest = null;
  try {
    const release = await githubJson(`${DEVICE_API}/releases/latest`);
    latest = release?.tag_name?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
  } catch {
    try {
      const tags = await githubJson(`${DEVICE_API}/tags?per_page=100`);
      latest = tags
        .map((t) => t?.name?.match(/(\d+\.\d+\.\d+)/)?.[1])
        .filter(Boolean)
        .sort(semverCmp)
        .at(-1) ?? null;
    } catch {
      // offline / rate-limited — skip
    }
  }
  if (!latest) {
    console.log(`  agent-device vendored ${vendored}; upstream lookup skipped (offline or GitHub API unreachable)`);
    return;
  }
  const cmp = semverCmp(vendored, latest);
  console.log(
    `  agent-device vendored ${vendored} vs upstream latest ${latest} — ${cmp < 0 ? "BEHIND" : "up to date"}`
  );
}

function githubOutput(pairs) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}\n`)
    .join("");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, lines);
}

async function runCheck() {
  const reconciled = parseReconciledVersion();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baguette-sync-"));
  try {
    try {
      execFileSync("git", ["clone", "--quiet", "--depth", "1", UPSTREAM_REPO, tmp], {
        stdio: ["ignore", "inherit", "inherit"],
      });
    } catch {
      die(`shallow clone of ${UPSTREAM_REPO} failed (offline?)`);
    }
    const latest = latestUpstreamTag(tmp);
    const behind = semverCmp(reconciled, latest) < 0;

    console.log("== upstream baguette ==");
    console.log(`reconciled: v${reconciled} (${UPSTREAM_MD})`);
    console.log(`latest upstream tag: v${latest}`);
    console.log(`status: ${behind ? "BEHIND — reconciliation needed" : "up to date"}`);

    if (behind) {
      console.log(`\n== CHANGELOG delta (v${reconciled} → v${latest}] ==`);
      const sections = changelogDelta(tmp, reconciled, latest);
      if (sections === null) {
        console.log("  upstream CHANGELOG.md not found — read release notes manually");
      } else if (sections.length === 0) {
        console.log("  no matching CHANGELOG sections — heading format changed? Read CHANGELOG.md manually");
      } else {
        console.log(sections.join("\n\n"));
      }
    }

    console.log(`\n== skill files: upstream ${UPSTREAM_SKILL_DIR}/ vs local ${LOCAL_SKILL_DIR}/ ==`);
    skillDiffSummary(tmp);

    console.log("\n== vendored physical-device runtime ==");
    await agentDeviceReport();

    if (behind) {
      console.log(`
== TODO — human/agent decision required (skill content is never auto-merged) ==
  1. Read the CHANGELOG delta above and identify agent-relevant changes.
  2. Port applicable skill-doc changes with the rename map baguette → testcat-sim.
  3. Never document serve/WebSocket/camera features or any command absent from
     the subcommand registry in ${ROOT_COMMAND}.
  4. Keep the testcat-specific sections of ${LOCAL_SKILL_DIR}/SKILL.md
     (headless contract, text-entry/pasteboard recipe, physical-device contract,
     alert-window coordinate caveat, parsing notes, push notifications).
  5. Update the "last reconciled" row in ${UPSTREAM_MD}, then run: make upstream-gate`);
    }

    githubOutput({ reconciled: `v${reconciled}`, latest_tag: `v${latest}`, behind: String(behind) });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------

const mode = process.argv[2];
if (mode === "--gate") runGate();
else if (mode === "--check") await runCheck();
else die("usage: node scripts/sync-upstream.mjs --check | --gate");
