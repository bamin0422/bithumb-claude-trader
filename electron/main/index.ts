import { app, BrowserWindow } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app as electronApp } from "electron";
import { openDb } from "@main/storage/db";
import { Orchestrator } from "@main/trader/orchestrator";
import { startScheduler } from "@main/scheduler";
import { registerIpc } from "@main/ipc";
import { getSettings } from "@main/storage/settings";
import { syncAutoStart } from "@main/autostart";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1200, minHeight: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  const dbPath = join(electronApp.getPath("userData"), "trader.db");
  const db = openDb(dbPath);
  const orch = new Orchestrator(db);
  registerIpc(db, orch);
  syncAutoStart();
  await createWindow();
  if (getSettings().trading_enabled) startScheduler(orch);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
