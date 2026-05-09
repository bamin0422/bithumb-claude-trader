import type { Decision, Settings } from "@shared/zod-schemas";
import type { Position } from "@shared/types";

export type RiskCtx = {
  krw_balance: number;
  total_assets_krw: number;
  positions: Position[];
  daily_pnl_pct: number;
  weekly_pnl_pct: number;
  recent_trades_for_symbol: { attempted_at: string; action: "BUY"|"SELL" }[];
  spread_pct: number;
};

export type RiskOk = { ok: true; adjusted?: Decision };
export type RiskBlock = { ok: false; reason: string };

const MIN_BITHUMB_KRW = 5_000;

export function evaluateDecision(d: Decision, ctx: RiskCtx, s: Settings): RiskOk | RiskBlock {
  if (!s.trading_enabled) return { ok: false, reason: "trading disabled" };

  if (d.action === "HOLD") return { ok: true };

  // Daily loss limit
  if (ctx.daily_pnl_pct <= -s.risk.daily_loss_limit_pct && d.action === "BUY") {
    return { ok: false, reason: "daily loss limit reached, BUY blocked" };
  }
  if (ctx.weekly_pnl_pct <= -s.risk.max_drawdown_circuit_breaker_pct && d.action === "BUY") {
    return { ok: false, reason: "weekly drawdown circuit breaker, BUY blocked" };
  }

  if (d.action === "BUY") {
    if (d.confidence < s.risk.min_confidence_to_trade) {
      return { ok: false, reason: `confidence ${d.confidence} < min ${s.risk.min_confidence_to_trade}` };
    }
    if (ctx.positions.length >= s.risk.max_concurrent_positions
        && !ctx.positions.find(p => p.symbol === d.symbol)) {
      return { ok: false, reason: "max concurrent positions reached" };
    }
    const recent = ctx.recent_trades_for_symbol.find(t =>
      Date.now() - new Date(t.attempted_at).getTime() < 30 * 60_000
    );
    if (recent) return { ok: false, reason: `too recent trade on ${d.symbol}` };

    const cap = ctx.krw_balance * s.risk.max_buy_ratio;
    let krw = Math.min(d.krw_amount, cap);

    const existing = ctx.positions.find(p => p.symbol === d.symbol);
    const existingValue = existing ? existing.qty * existing.avg_price : 0;
    const positionCap = ctx.total_assets_krw * s.risk.max_position_ratio;
    if (existingValue + krw > positionCap) {
      krw = Math.max(0, positionCap - existingValue);
    }
    if (krw < MIN_BITHUMB_KRW) return { ok: false, reason: `below minimum order ${MIN_BITHUMB_KRW}` };

    if (d.order_type === "MARKET" && ctx.spread_pct > s.bithumb.max_spread_pct_for_market) {
      return { ok: false, reason: `spread ${ctx.spread_pct}% too wide for MARKET` };
    }
    return { ok: true, adjusted: { ...d, krw_amount: krw } };
  }

  // SELL
  const pos = ctx.positions.find(p => p.symbol === d.symbol);
  if (!pos || pos.qty <= 0) return { ok: false, reason: `no position in ${d.symbol}` };
  const ratio = Math.max(0, Math.min(1, d.sell_ratio || 1));
  return { ok: true, adjusted: { ...d, sell_ratio: ratio } };
}
