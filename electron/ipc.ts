import { ipcMain } from "electron";
import type Database from "better-sqlite3";
import { Orchestrator } from "@main/trader/orchestrator";
import { getSettings, updateSettings, resetSettings } from "@main/storage/settings";
import { setBithumbKeys, clearBithumbKeys } from "@main/storage/secrets";
import { startScheduler, stopScheduler } from "@main/scheduler";

export function registerIpc(db: Database.Database, orch: Orchestrator) {
  ipcMain.handle("portfolio:current", () => {
    const positions = db.prepare("SELECT * FROM positions").all();
    const last = db.prepare("SELECT * FROM portfolio_snapshots ORDER BY taken_at DESC LIMIT 1").get();
    return { positions, snapshot: last };
  });
  ipcMain.handle("snapshots:range", (_e, range: string) => {
    const days = range === "1D" ? 1 : range === "7D" ? 7 : range === "30D" ? 30 : 9999;
    return db.prepare(
      `SELECT * FROM portfolio_snapshots WHERE taken_at >= datetime('now','-${days} days') ORDER BY taken_at`
    ).all();
  });
  ipcMain.handle("trades:list", (_e, limit = 100) =>
    db.prepare("SELECT * FROM trade_attempts ORDER BY id DESC LIMIT ?").all(limit));
  ipcMain.handle("decisions:list", (_e, limit = 50) => {
    const rows = db.prepare("SELECT * FROM decisions ORDER BY id DESC LIMIT ?").all(limit) as any[];
    for (const r of rows) {
      r.coin_scores = db.prepare("SELECT * FROM coin_scores WHERE decision_id=?").all(r.id);
    }
    return rows;
  });
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:update", (_e, patch) => updateSettings(patch));
  ipcMain.handle("settings:reset", () => resetSettings());
  ipcMain.handle("bithumb:set-keys", (_e, k, s) => setBithumbKeys(k, s).then(() => updateSettings({ bithumb: { ...getSettings().bithumb, api_key_set: true } as any })));
  ipcMain.handle("bithumb:clear-keys", () => clearBithumbKeys().then(() => updateSettings({ bithumb: { ...getSettings().bithumb, api_key_set: false } as any })));
  ipcMain.handle("trader:run-now", () => orch.runCycle());
  ipcMain.handle("trader:start", () => { updateSettings({ trading_enabled: true }); startScheduler(orch); });
  ipcMain.handle("trader:stop", () => { updateSettings({ trading_enabled: false }); stopScheduler(); });
  ipcMain.handle("trader:emergency-stop", async () => {
    updateSettings({ trading_enabled: false }); stopScheduler();
    // future: place market sell of all positions
    return { ok: true };
  });
  ipcMain.handle("backtest:run", async (_e, p) => {
    const { fetchHistorical } = await import("@main/backtest/fetcher");
    const { runBacktest } = await import("@main/backtest/engine");
    const candles = await fetchHistorical(p.symbols, p.timeframe ?? "1h");
    return runBacktest(candles, { symbols: p.symbols, startCandleIdx: 200, steps: p.steps ?? 50, initialKrw: p.initialKrw ?? 1_000_000 });
  });
}
