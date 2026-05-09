import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({}));

vi.mock("../electron/storage/settings", () => ({
  getSettings: () => ({
    trading_enabled: false,
    paper_mode: true,
    decision_interval_min: 5,
    auto_start_on_login: false,
    run_in_background: false,
    watch_symbols: ["BTC"],
    risk: {
      max_buy_ratio: 0.25, max_position_ratio: 0.5, daily_loss_limit_pct: 10,
      stop_loss_pct: 15, take_profit_pct: 20, max_concurrent_positions: 5,
      min_confidence_to_trade: 0.55, max_drawdown_circuit_breaker_pct: 15
    },
    claude: { model: "claude-opus-4-7", max_turns: 1, timeout_ms: 120000, permission_mode: "denyAll" },
    bithumb: { api_key_set: false, use_market_orders: false, max_spread_pct_for_market: 0.2 },
    notifications: { on_trade: true, on_error: true, on_circuit_breaker: true, macos_native: false },
    ui: { theme: "system", chart_default_timeframe: "1h", refresh_interval_sec: 10 }
  }),
  updateSettings: (p: any) => p,
  resetSettings: () => {}
}));

vi.mock("../electron/storage/secrets", () => ({
  getBithumbKeys: async () => null,
  setBithumbKeys: async () => {},
  clearBithumbKeys: async () => {}
}));

vi.mock("../electron/claude-runner", () => ({
  runClaudeDecision: vi.fn(async () => ({
    ok: true, raw: "{}", duration_ms: 100, cost_usd: 0,
    decision: {
      market_analysis: { regime: "RISK_ON", btc_trend_4h: "UP", fear_greed_state: "FEAR",
                         btc_dominance_view: "ALT_FAVORABLE", summary: "ok", key_risks: [] },
      coin_scores: [],
      decisions: [{ action: "HOLD", symbol: "BTC", krw_amount: 0, sell_ratio: 0,
        order_type: "LIMIT", playbook: "NONE", reason: "wait", signals: [], confidence: 0.4 }]
    }
  }))
}));

vi.mock("../electron/bithumb/public", () => ({
  getTicker: async () => ({ closing_price: "100000000", max_price: "0", min_price: "0",
                             acc_trade_value_24H: "0", fluctate_rate_24H: "0" }),
  getCandles: async () => Array.from({length: 200}, (_, i) => ({ t: i, o: 1, h: 2, l: 0, c: 1 + Math.sin(i/10), v: 1 })),
  getOrderbook: async () => ({ bids: [{ price: 99, qty: 1 }], asks: [{ price: 101, qty: 1 }] })
}));

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../electron/storage/db";

describe("paper cycle smoke", () => {
  it("orchestrator records HOLD decision without crashing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "paper-"));
    const db = openDb(join(dir, "p.db"));
    const { Orchestrator } = await import("../electron/trader/orchestrator");
    const orch = new Orchestrator(db);
    await orch.runCycle();
    const decisions = db.prepare("SELECT COUNT(*) as n FROM decisions").get() as any;
    expect(decisions.n).toBe(1);
  });
});
