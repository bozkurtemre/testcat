import { existsSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow, app } from "electron";
import { killActiveRuns } from "./agent/run-controller";
import { registerIpc } from "./ipc";
import { adoptLoginShellPath, ensureAgentAssetsInstalled } from "./setup";
import { store } from "./store/store";

// Set before ready so the dock tooltip + menu bar read "testcat", not "Electron",
// in dev. Packaged builds already get this from productName (electron-builder).
app.setName("testcat");

// Dock icon for `pnpm dev` (otherwise Electron's default shows). Packaged
// builds get their icon from build/icon.icns via electron-builder.
function setDevDockIcon(): void {
  if (process.platform !== "darwin" || app.isPackaged) return;
  const icon = join(__dirname, "../../build/icon.png");
  if (existsSync(icon)) app.dock?.setIcon(icon);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b0d0e",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 10 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // electron-vite injects ELECTRON_RENDERER_URL in dev; load the built file otherwise.
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(async () => {
  setDevDockIcon();
  // Before anything detects or spawns CLIs: a Finder-launched app only has
  // the minimal launchd PATH, hiding brew/nvm installs (claude, codex, node).
  await adoptLoginShellPath();
  ensureAgentAssetsInstalled();
  registerIpc();
  createWindow();

  // A fresh main owns no runs, so any row still "running" is a stale leftover
  // from a session that died mid-run — mark those interrupted.
  void store.runsInterruptStale().catch(() => {});

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Don't leave agent CLIs running or the temporary Network panel proxy server
// alive after the app quits.
let cleanedUpBeforeQuit = false;
app.on("before-quit", (event) => {
  if (cleanedUpBeforeQuit) return;
  event.preventDefault();
  void killActiveRuns().finally(() => {
    cleanedUpBeforeQuit = true;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
