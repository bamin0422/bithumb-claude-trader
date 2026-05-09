import { runClaudeDecision } from "@main/claude-runner";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ind from "@main/indicators";
import { detectPatterns } from "@main/patterns";

export type BacktestParams = {
  symbols: string[];
  startCandleIdx: number;   // skip warmup
  steps: number;            // how many candles to walk forward
  initialKrw: number;
};

export type BacktestResult = {
  trades: any[];
  finalKrw: number;
  finalAssets: number;
  pnlPct: number;
  decisions: any[];
};

export async function runBacktest(
  candlesBySymbol: Record<string, any[]>,
  params: BacktestParams
): Promise<BacktestResult> {
  const positions = new Map<string, { qty: number; avg: number }>();
  let krw = params.initialKrw;
  const trades: any[] = [];
  const decisions: any[] = [];
  const sysPrompt = readFileSync(join(process.cwd(), "prompts/crypto-trading-ai-guide.md"), "utf-8");

  for (let step = 0; step < params.steps; step++) {
    const idx = params.startCandleIdx + step;
    const market: any = {};
    for (const sym of params.symbols) {
      const c = candlesBySymbol[sym].slice(0, idx + 1);
      if (c.length < 60) continue;
      const closes = c.map(x => x.c);
      market[sym] = {
        ticker: { last: closes.at(-1) },
        ohlcv: { "1h": c.slice(-168) },
        indicators: {
          ema: { ema20: ind.ema(closes, 20).at(-1), ema50: ind.ema(closes, 50).at(-1), ema200: ind.ema(closes, 200).at(-1) },
          rsi_1h: ind.rsi(closes).at(-1),
          atr_14: { absolute: ind.atr(c).at(-1) }
        },
        patterns_detected: detectPatterns(c)
      };
    }
    const totalAssets = krw + Array.from(positions.entries())
      .reduce((a,[s,p])=>a + p.qty * (market[s]?.ticker.last ?? 0), 0);
    const userJson = {
      portfolio: { krw_balance: krw, total_assets_krw: totalAssets,
        positions: Array.from(positions.entries()).map(([s,p])=>({
          symbol: s, qty: p.qty, avg_price: p.avg, current_price: market[s]?.ticker.last,
          pnl_pct: ((market[s]?.ticker.last - p.avg) / p.avg) * 100 })) },
      market,
      limits: { MAX_BUY_RATIO: 0.25, MAX_POSITION_RATIO: 0.5, DAILY_LOSS_LIMIT: 10, STOP_LOSS_PCT: 15, TAKE_PROFIT_PCT: 20 }
    };
    const r = await runClaudeDecision({ systemPrompt: sysPrompt, userJson });
    if (!r.ok) continue;
    decisions.push(r.decision);
    for (const d of r.decision.decisions) {
      const px = market[d.symbol]?.ticker.last;
      if (!px) continue;
      if (d.action === "BUY" && krw >= d.krw_amount && d.krw_amount >= 5000) {
        const q = d.krw_amount / px;
        const cur = positions.get(d.symbol);
        const newQty = (cur?.qty ?? 0) + q;
        const newAvg = cur ? (cur.qty * cur.avg + q * px) / newQty : px;
        positions.set(d.symbol, { qty: newQty, avg: newAvg });
        krw -= d.krw_amount;
        trades.push({ step, action: "BUY", symbol: d.symbol, qty: q, price: px });
      } else if (d.action === "SELL") {
        const cur = positions.get(d.symbol);
        if (!cur) continue;
        const ratio = d.sell_ratio || 1;
        const sellQ = cur.qty * ratio;
        krw += sellQ * px;
        if (ratio >= 0.999) positions.delete(d.symbol);
        else positions.set(d.symbol, { qty: cur.qty - sellQ, avg: cur.avg });
        trades.push({ step, action: "SELL", symbol: d.symbol, qty: sellQ, price: px });
      }
    }
  }

  const finalAssets = krw + Array.from(positions.entries())
    .reduce((a,[s,p])=>a + p.qty * (candlesBySymbol[s][params.startCandleIdx + params.steps - 1].c), 0);
  return { trades, finalKrw: krw, finalAssets, pnlPct: ((finalAssets - params.initialKrw)/params.initialKrw)*100, decisions };
}
