import { describe, it, expect } from "vitest";
import { evaluateDecision } from "../electron/trader/risk-guard";
import type { Settings } from "@shared/zod-schemas";

const S = (over?: any): Settings => ({
  trading_enabled: true, paper_mode: false, decision_interval_min: 5,
  auto_start_on_login: false, run_in_background: false,
  watch_symbols: ["BTC"],
  risk: { max_buy_ratio: 0.25, max_position_ratio: 0.5, daily_loss_limit_pct: 10,
          stop_loss_pct: 15, take_profit_pct: 20, max_concurrent_positions: 5,
          min_confidence_to_trade: 0.55, max_drawdown_circuit_breaker_pct: 15 },
  claude: { model: "claude-opus-4-7", max_turns: 1, timeout_ms: 120000, permission_mode: "denyAll" },
  bithumb: { api_key_set: true, use_market_orders: false, max_spread_pct_for_market: 0.2 },
  notifications: { on_trade: true, on_error: true, on_circuit_breaker: true, macos_native: true },
  ui: { theme: "system", chart_default_timeframe: "1h", refresh_interval_sec: 10 },
  ...over
});

const ctx = (over?: any) => ({
  krw_balance: 1_000_000, total_assets_krw: 2_000_000,
  positions: [], daily_pnl_pct: 0, weekly_pnl_pct: 0,
  recent_trades_for_symbol: [],
  spread_pct: 0.1,
  ...over
});

const buyDec = (over?: any) => ({
  action: "BUY" as const, symbol: "BTC", krw_amount: 100_000, sell_ratio: 0,
  order_type: "LIMIT" as const, playbook: "A" as const, reason: "ok",
  signals: [], confidence: 0.7, ...over
});

describe("risk-guard", () => {
  it("blocks when trading disabled", () => {
    const r = evaluateDecision(buyDec(), ctx(), S({ trading_enabled: false }));
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toMatch(/disabled/i);
  });
  it("blocks when daily loss limit reached", () => {
    const r = evaluateDecision(buyDec(), ctx({ daily_pnl_pct: -10 }), S());
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toMatch(/daily/i);
  });
  it("blocks when confidence below min", () => {
    const r = evaluateDecision(buyDec({ confidence: 0.4 }), ctx(), S());
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toMatch(/confidence/i);
  });
  it("caps krw_amount to max_buy_ratio", () => {
    const r = evaluateDecision(buyDec({ krw_amount: 10_000_000 }), ctx(), S());
    expect(r.ok).toBe(true); if (r.ok) expect(r.adjusted!.krw_amount).toBe(250_000);
  });
  it("blocks when concurrent positions exceeded", () => {
    const positions = ["A","B","C","D","E"].map(s => ({ symbol: s, qty: 1, avg_price: 1, entered_at: "", highest_pnl_pct: 0, stop_loss_price: null, take_profit_price: null, last_updated: "" }));
    const r = evaluateDecision(buyDec(), ctx({ positions }), S());
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toMatch(/concurrent/i);
  });
  it("blocks rebuy within 30min", () => {
    const r = evaluateDecision(buyDec(), ctx({
      recent_trades_for_symbol: [{ attempted_at: new Date(Date.now()-10*60_000).toISOString(), action: "BUY" }]
    }), S());
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toMatch(/recent/i);
  });
  it("blocks below minimum order amount", () => {
    const r = evaluateDecision(buyDec({ krw_amount: 1000 }), ctx(), S());
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toMatch(/minimum/i);
  });
  it("blocks market order when spread too wide", () => {
    const r = evaluateDecision(buyDec({ order_type: "MARKET" }), ctx({ spread_pct: 0.5 }), S());
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toMatch(/spread/i);
  });
});
