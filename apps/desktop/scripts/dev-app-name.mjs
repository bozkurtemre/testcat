// Dev-only: on macOS the dock tooltip + menu-bar name come from the running
// bundle's Info.plist. In dev that's the stock Electron.app, so it reads
// "Electron". Rename THIS project's Electron copy to "testcat". Self-healing —
// runs before each `pnpm dev` (electron's postinstall resets dist on reinstall).
// Per-project copy (hardlink count 1), so this never touches the pnpm store or
// other projects. Packaged builds use productName, so this never ships.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

if (process.platform !== "darwin") process.exit(0);

try {
  const req = createRequire(import.meta.url);
  const bin = req("electron"); // absolute path to the Electron executable
  const plist = bin.replace(
    /\/Contents\/MacOS\/Electron$/,
    "/Contents/Info.plist",
  );
  const pb = "/usr/libexec/PlistBuddy";
  const current = execFileSync(pb, ["-c", "Print :CFBundleName", plist], {
    encoding: "utf8",
  }).trim();
  if (current !== "testcat") {
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      try {
        execFileSync(pb, ["-c", `Set :${key} testcat`, plist]);
      } catch {
        // key may be absent on some Electron builds — CFBundleName is enough
      }
    }
    console.log("[dev] renamed Electron.app → testcat");
  }
} catch (e) {
  console.warn("[dev] could not rename Electron.app:", e?.message ?? e);
}
process.exit(0);
