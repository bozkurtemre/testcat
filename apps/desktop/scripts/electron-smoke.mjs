import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const req = createRequire(import.meta.url);
const electronPath = req("electron");

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "../..");
const mainPath = resolve(appRoot, "out/main/index.js");
const outDir = resolve(repoRoot, "output/playwright");

if (!existsSync(mainPath)) {
  console.error("Missing Electron build. Run `pnpm --filter @testcat/desktop build` first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

let app;
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [mainPath],
    cwd: appRoot,
  });

  const page = await app.firstWindow();
  await app.evaluate(async ({ BrowserWindow, app }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setBounds({ x: 0, y: 40, width: 1200, height: 760 });
    win.show();
    win.focus();
    win.moveTop();
    app.focus({ steal: true });
  });

  await page.evaluate(() => localStorage.setItem("testcat:onboarded", "1"));
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(750);

  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Missing selector: ${selector}`);
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const region = (selector) =>
      getComputedStyle(document.querySelector(selector)).getPropertyValue("-webkit-app-region");

    return {
      header: rect("header"),
      nav: rect("header nav"),
      trafficSpace: rect(".app-chrome-traffic-space"),
      firstTab: rect("header nav > :first-child"),
      firstTabButton: rect("header nav > :first-child button"),
      aside: rect("aside"),
      logo: rect("aside button"),
      trafficSpaceMarginRight: getComputedStyle(
        document.querySelector(".app-chrome-traffic-space"),
      ).marginRight,
      appRegion: {
        header: region("header"),
        nav: region("header nav"),
        firstTabButton: region("header nav > :first-child button"),
      },
    };
  });

  await page.screenshot({
    path: resolve(outDir, "electron-page.png"),
    fullPage: false,
  });

  if (process.env.TESTCAT_NATIVE_SCREENSHOT === "1" && process.platform === "darwin") {
    try {
      await page.waitForTimeout(500);
      execFileSync("screencapture", ["-x", resolve(outDir, "electron-desktop.png")]);
    } catch (error) {
      console.warn("Native screencapture failed:", error?.message ?? error);
    }
  }

  const failures = [];
  if (metrics.header.height !== 34) {
    failures.push(`top bar height is ${metrics.header.height}px, expected 34px`);
  }
  if (metrics.trafficSpace.width !== 96) {
    failures.push(`traffic-light reserved space is ${metrics.trafficSpace.width}px, expected 96px`);
  }
  if (metrics.trafficSpaceMarginRight !== "12px") {
    failures.push(`traffic-light margin is ${metrics.trafficSpaceMarginRight}, expected 12px`);
  }
  if (metrics.firstTab.x !== 114) {
    failures.push(`first tab starts at ${metrics.firstTab.x}px, expected 114px`);
  }
  if (metrics.aside.y < metrics.header.height) {
    failures.push(`rail starts inside the top bar (${metrics.aside.y}px < ${metrics.header.height}px)`);
  }
  if (metrics.logo.y < metrics.header.height + 8) {
    failures.push(`rail logo is too close to macOS traffic lights (${metrics.logo.y}px)`);
  }
  if (metrics.appRegion.header !== "drag") failures.push("top bar is not draggable");
  if (metrics.appRegion.nav !== "drag") failures.push("tab strip is not draggable");
  if (metrics.appRegion.firstTabButton !== "no-drag") {
    failures.push("tab click target is not marked no-drag");
  }

  console.log(JSON.stringify(metrics, null, 2));

  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Electron smoke layout checks passed.");
  }
} finally {
  if (app) await app.close();
}
