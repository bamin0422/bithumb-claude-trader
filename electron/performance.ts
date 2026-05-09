import type Database from "better-sqlite3";

export function computePerformance(db: Database.Database) {
  const rows = db.prepare(
    `SELECT result, filled_qty, filled_price, fee_krw, krw_amount, action, attempted_at
     FROM trade_attempts WHERE result IN ('FILLED','PARTIAL','PAPER')
     AND attempted_at >= datetime('now','-30 days')`
  ).all() as any[];

  let wins = 0, losses = 0, sumWinPct = 0, sumLossPct = 0, fees = 0, sumPnL = 0;
  for (const r of rows) {
    fees += r.fee_krw ?? 0;
  }

  // Pair BUY -> SELL on same symbol via FIFO using positions table is complex;
  // here approximate by daily_performance rollup table populated by orchestrator after each cycle.
  const daily = db.prepare(
    `SELECT pnl_pct, wins, losses FROM daily_performance
     WHERE date >= date('now','-30 days')`
  ).all() as any[];
  for (const d of daily) {
    if (d.pnl_pct > 0) { wins += d.wins ?? 0; sumWinPct += d.pnl_pct; }
    else { losses += d.losses ?? 0; sumLossPct += Math.abs(d.pnl_pct); }
  }

  const total = wins + losses;
  return {
    win_rate_30d: total === 0 ? 0 : wins / total,
    avg_win_pct: wins ? sumWinPct / wins : 0,
    avg_loss_pct: losses ? sumLossPct / losses : 0,
    profit_factor: sumLossPct === 0 ? sumWinPct : sumWinPct / sumLossPct,
    fees_paid_30d: fees
  };
}
