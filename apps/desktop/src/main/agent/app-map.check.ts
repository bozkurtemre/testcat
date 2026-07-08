// Durable app-map / build-key check. Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/app-map.check.ts
import assert from "node:assert/strict";
import { APP_MAP_MAX_CHARS, appMapPromptBlock } from "./app-map";
import { formatBuildKey } from "./build-key";

// Build key folds path + size + mtime (rounded) so a rebuild busts the cache.
assert.equal(formatBuildKey("/x/App.app", 1234, 99.7), "/x/App.app:1234:100");
assert.notEqual(
  formatBuildKey("/x/App.app", 1234, 100),
  formatBuildKey("/x/App.app", 9999, 100),
);

// No map → empty block (callers join blocks, so empty must contribute nothing).
assert.equal(appMapPromptBlock(null), "");
assert.equal(appMapPromptBlock("   "), "");

// A real map is wrapped with the verify-before-acting framing.
const block = appMapPromptBlock("Home has tabs A/B/C.");
assert.match(block, /APP MAP/);
assert.match(block, /Home has tabs A\/B\/C\./);
assert.match(block, /never reuse coordinates/i);

// Oversized maps are truncated, not passed through whole.
const huge = appMapPromptBlock("x".repeat(APP_MAP_MAX_CHARS + 500));
assert.match(huge, /app map truncated/);
// Truncated (~6419) — an untruncated block would be ~6920, so this still catches a regression.
assert(huge.length < APP_MAP_MAX_CHARS + 500);

console.log("app map check: OK");
