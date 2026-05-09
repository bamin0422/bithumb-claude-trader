import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { app as electronApp } from "electron";
import { openDb } from "@main/storage/db";
import { Orchestrator } from "@main/trader/orchestrator";
import { startScheduler } from "@main/scheduler";
import { registerIpc } from "@main/ipc";
import { getSettings } from "@main/storage/settings";

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1200, minHeight: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true, nodeIntegration: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await win.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(async () => {
  const dbPath = join(electronApp.getPath("userData"), "trader.db");
  const db = openDb(dbPath);
  const orch = new Orchestrator(db);
  registerIpc(db, orch);
  await createWindow();
  if (getSettings().trading_enabled) startScheduler(orch);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
