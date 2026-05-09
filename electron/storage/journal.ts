import type Database from "better-sqlite3";

export class Journal {
  constructor(private db: Database.Database) {}

  insertDecision(row: {
    cycle_at: string; claude_raw: string; market_view: string | null;
    fear_greed: number | null; btc_dominance: number | null;
    cost_usd: number | null; duration_ms: number | null;
    status: string; error: string | null;
  }) {
    return this.db.prepare(
      `INSERT INTO decisions (cycle_at, claude_raw, market_view, fear_greed, btc_dominance,
        cost_usd, duration_ms, status, error)
       VALUES (@cycle_at, @claude_raw, @market_view, @fear_greed, @btc_dominance,
        @cost_usd, @duration_ms, @status, @error)`
    ).run(row).lastInsertRowid as number;
  }

  insertCoinScores(decisionId: number, scores: any[]) {
    const stmt = this.db.prepare(
      `INSERT INTO coin_scores (decision_id, symbol, score, ema_state, rsi_1h, macd_state,
        volume_ratio, patterns, playbook, decision_hint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      for (const s of scores) {
        stmt.run(decisionId, s.symbol, s.score, s.ema_state ?? null,
          s.momentum?.rsi_1h ?? null, s.momentum?.macd ?? null,
          s.volume_analysis?.ratio ?? null,
          JSON.stringify(s.patterns ?? []),
          s.playbook_match ?? null, s.decision_hint ?? null);
      }
    });
    tx();
  }

  insertEvent(level: string, category: string, message: string, meta?: any) {
    this.db.prepare(
      `INSERT INTO events (at, level, category, message, meta)
       VALUES (?, ?, ?, ?, ?)`
    ).run(new Date().toISOString(), level, category, message, meta ? JSON.stringify(meta) : null);
  }

  insertTradeAttempt(row: any): number {
    return this.db.prepare(
      `INSERT INTO trade_attempts (decision_id, attempted_at, symbol, action, krw_amount, qty,
        order_type, limit_price, reason, signals, confidence, stop_loss_price, take_profit_price,
        risk_check, result, bithumb_order_id, filled_qty, filled_price, fee_krw, error)
       VALUES (@decision_id, @attempted_at, @symbol, @action, @krw_amount, @qty,
        @order_type, @limit_price, @reason, @signals, @confidence, @stop_loss_price, @take_profit_price,
        @risk_check, @result, @bithumb_order_id, @filled_qty, @filled_price, @fee_krw, @error)`
    ).run(row).lastInsertRowid as number;
  }

  upsertPosition(p: any) {
    this.db.prepare(
      `INSERT INTO positions (symbol, qty, avg_price, entered_at, highest_pnl_pct,
        stop_loss_price, take_profit_price, last_updated)
       VALUES (@symbol, @qty, @avg_price, @entered_at, @highest_pnl_pct,
        @stop_loss_price, @take_profit_price, @last_updated)
       ON CONFLICT(symbol) DO UPDATE SET
        qty=@qty, avg_price=@avg_price, highest_pnl_pct=@highest_pnl_pct,
        stop_loss_price=@stop_loss_price, take_profit_price=@take_profit_price,
        last_updated=@last_updated`
    ).run(p);
  }

  insertSnapshot(s: any) {
    this.db.prepare(
      `INSERT INTO portfolio_snapshots (taken_at, krw_balance, total_assets_krw,
        positions_value, daily_pnl_pct, weekly_pnl_pct, all_time_pnl_pct)
       VALUES (@taken_at, @krw_balance, @total_assets_krw, @positions_value,
        @daily_pnl_pct, @weekly_pnl_pct, @all_time_pnl_pct)`
    ).run(s);
  }
}
