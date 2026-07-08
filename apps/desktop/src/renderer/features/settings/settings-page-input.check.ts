// Durable settings input check.
// Run: pnpm --filter @testcat/desktop exec tsx src/renderer/features/settings/settings-page-input.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "SettingsPage.tsx"),
  "utf8",
);

const unsafeEventReadInUpdater =
  /setSettings\(\(current\) => \(\{[\s\S]{0,240}event\.(?:currentTarget|target)\.value/.test(
    source,
  );

assert.equal(
  unsafeEventReadInUpdater,
  false,
  "Settings input handlers must copy event.target.value before calling setSettings; reading a synthetic event inside a functional updater can crash the renderer.",
);

console.log("settings page input check: OK");
