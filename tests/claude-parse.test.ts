import { describe, it, expect } from "vitest";
import { parseClaudeEnvelope } from "../electron/claude-runner";

describe("parseClaudeEnvelope", () => {
  it("parses valid envelope with embedded decision JSON", () => {
    const inner = {
      market_analysis: { regime: "RISK_ON", btc_trend_4h: "UP", fear_greed_state: "FEAR",
                         btc_dominance_view: "ALT_FAVORABLE", summary: "ok", key_risks: [] },
      coin_scores: [],
      decisions: [{ action: "HOLD", symbol: "BTC", krw_amount: 0, sell_ratio: 0,
                    order_type: "LIMIT", playbook: "NONE", reason: "wait",
                    signals: [], confidence: 0.4 }]
    };
    const env = JSON.stringify({ result: JSON.stringify(inner), total_cost_usd: 0.01 });
    const r = parseClaudeEnvelope(env);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decision.decisions[0].action).toBe("HOLD");
  });
  it("fails on bad schema", () => {
    const env = JSON.stringify({ result: JSON.stringify({ wrong: 1 }) });
    const r = parseClaudeEnvelope(env);
    expect(r.ok).toBe(false);
  });
});
