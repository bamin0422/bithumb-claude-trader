import type Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as bpub from "@main/bithumb/public";
import { getBithumbKeys } from "@main/storage/secrets";
import * as bpriv from "@main/bithumb/private";
import { getFearGreed } from "@main/fear-greed";
import { getBtcDominance } from "@main/btc-dominance";
import * as ind from "@main/indicators";
import { detectPatterns } from "@main/patterns";
import { correlationMatrix } from "@main/correlation";
import { runClaudeDecision } from "@main/claude-runner";
import { evaluateDecision } from "@main/trader/risk-guard";
import { executeDecision } from "@main/trader/executor";
import { CircuitBreaker } from "@main/trader/circuit-breaker";
import { Journal } from "@main/storage/journal";
import { computePerformance } from "@main/performance";
import { getSettings } from "@main/storage/settings";

export class Orchestrator {
  private cb = new CircuitBreaker();
  constructor(private db: Database.Database) {}

  async runCycle() {
    const s = getSettings();
    const j = new Journal(this.db);
    j.insertEvent("INFO", "SCHEDULER", "cycle start");

    const halt = this.cb.shouldHalt();
    if (halt.halt) { j.insertEvent("WARN", "SCHEDULER", `halted: ${halt.reason}`); return; }

    if (!s.trading_enabled && !s.paper_mode) {
      j.insertEvent("INFO", "SCHEDULER", "trading disabled, skipping"); return;
    }

    // 1. Market data
    const market: Record<string, any> = {};
    for (const sym of s.watch_symbols) {
      try {
        const [ticker, c5m, c15m, c1h, c4h, c1d, ob] = await Promise.all([
          bpub.getTicker(sym),
          bpub.getCandles(sym, "5m"),
          bpub.getCandles(sym, "30m"),
          bpub.getCandles(sym, "1h"),
          bpub.getCandles(sym, "6h"),
          bpub.getCandles(sym, "24h"),
          bpub.getOrderbook(sym)
        ]);
        const closes1h = c1h.map(x => x.c);
        const indicators = {
          ema: { ema20: ind.ema(closes1h, 20).at(-1), ema50: ind.ema(closes1h, 50).at(-1),
                 ema200: ind.ema(closes1h, 200).at(-1) },
          rsi_1h: ind.rsi(closes1h).at(-1),
          rsi_4h: ind.rsi(c4h.map(x => x.c)).at(-1),
          macd: (() => { const m = ind.macd(closes1h);
            return { macd: m.macd.at(-1), signal: m.signal.at(-1), histogram: m.histogram.at(-1) }; })(),
          bbands: (() => { const b = ind.bollinger(closes1h);
            return { upper: b.upper.at(-1), middle: b.middle.at(-1), lower: b.lower.at(-1),
                     width_pct: b.width_pct.at(-1), percent_b: b.percent_b.at(-1) }; })(),
          atr_14: (() => { const a = ind.atr(c1h).at(-1);
            return { absolute: a, pct_of_price: (a! / closes1h.at(-1)!) * 100 }; })(),
          adx: ind.adx(c1h).at(-1),
          stoch_rsi: (() => { const sr = ind.stochRsi(closes1h);
            return { k: sr.k.at(-1), d: sr.d.at(-1) }; })(),
          ichimoku: ind.ichimoku(c1h),
          obv_slope: ind.obvSlope(ind.obv(c1h)),
          vwap: ind.vwap24h(c1h.slice(-24)),
          mtf_alignment: ind.alignmentScore(c1d, c4h, c1h)
        };
        const top = ob.bids[0]?.price ?? 0, topa = ob.asks[0]?.price ?? 0;
        const spread_pct = top && topa ? ((topa - top) / top) * 100 : 99;
        market[sym] = {
          ticker: { last: Number(ticker.closing_price), high_24h: Number(ticker.max_price),
                    low_24h: Number(ticker.min_price), vol_24h_krw: Number(ticker.acc_trade_value_24H),
                    change_pct_24h: Number(ticker.fluctate_rate_24H) },
          ohlcv: { "5m": c5m.slice(-60), "1h": c1h.slice(-168), "4h": c4h.slice(-90), "1d": c1d.slice(-60) },
          indicators,
          orderbook: { bids: ob.bids.slice(0,10), asks: ob.asks.slice(0,10), spread_pct },
          patterns_detected: detectPatterns(c1h)
        };
      } catch (e: any) {
        j.insertEvent("ERROR", "BITHUMB", `fetch ${sym} failed: ${e.message}`);
        this.cb.recordBithumbFailure();
      }
    }

    // 2. Macro
    const fg = await getFearGreed().catch(() => null);
    const dom = await getBtcDominance().catch(() => null);

    // 3. Portfolio
    const creds = await getBithumbKeys();
    let krw_balance = 0, positions: any[] = [];
    if (creds) {
      try {
        const bal = await bpriv.getBalance({ apiKey: creds.key, apiSecret: creds.secret });
        krw_balance = Number(bal.available_krw ?? bal.total_krw ?? 0);
        const dbPositions = this.db.prepare("SELECT * FROM positions").all() as any[];
        positions = dbPositions.map(p => ({ ...p, current_price: market[p.symbol]?.ticker?.last ?? p.avg_price }));
      } catch (e: any) {
        j.insertEvent("ERROR", "BITHUMB", `balance fetch: ${e.message}`);
      }
    }
    const total_assets_krw = krw_balance + positions.reduce((a, p) => a + p.qty * p.current_price, 0);

    // 4. Performance + correlation
    const perf = computePerformance(this.db);
    const closesBySymbol: Record<string, number[]> = {};
    for (const sym of s.watch_symbols) {
      closesBySymbol[sym] = (market[sym]?.ohlcv?.["1d"] ?? []).map((x: any) => x.c);
    }
    const correlation = correlationMatrix(closesBySymbol);

    // 5. Build user payload
    const userJson = {
      now_kst: new Date().toLocaleString("sv", { timeZone: "Asia/Seoul" }),
      portfolio: {
        krw_balance, total_assets_krw,
        daily_pnl_pct: 0, weekly_pnl_pct: 0, max_drawdown_7d_pct: 0,
        positions: positions.map(p => ({
          symbol: p.symbol, qty: p.qty, avg_price: p.avg_price,
          current_price: p.current_price,
          pnl_pct: ((p.current_price - p.avg_price) / p.avg_price) * 100,
          holding_minutes: Math.round((Date.now() - new Date(p.entered_at).getTime())/60000),
          highest_pnl_since_entry: p.highest_pnl_pct,
          stop_loss_price: p.stop_loss_price, take_profit_price: p.take_profit_price
        }))
      },
      market,
      macro: {
        fear_greed: fg, btc_dominance: dom,
        btc_4h_regime: "UNKNOWN" // simple stub; can be derived from BTC indicators
      },
      correlation_matrix_30d: correlation,
      recent_trades: this.db.prepare(
        "SELECT attempted_at, symbol, action, krw_amount, result FROM trade_attempts ORDER BY id DESC LIMIT 20"
      ).all(),
      performance: perf,
      limits: s.risk
    };

    // 6. Claude
    const systemPrompt = readFileSync(join(process.cwd(), "prompts/crypto-trading-ai-guide.md"), "utf-8");
    const claudeRes = await runClaudeDecision({ systemPrompt, userJson });
    const decisionId = j.insertDecision({
      cycle_at: new Date().toISOString(),
      claude_raw: claudeRes.ok ? claudeRes.raw : (claudeRes.raw ?? ""),
      market_view: claudeRes.ok ? claudeRes.decision.market_analysis.summary : null,
      fear_greed: fg?.value ?? null,
      btc_dominance: dom?.value ?? null,
      cost_usd: claudeRes.ok ? (claudeRes.cost_usd ?? null) : null,
      duration_ms: claudeRes.duration_ms,
      status: claudeRes.ok ? "OK" : "SCHEMA_FAIL",
      error: claudeRes.ok ? null : claudeRes.error
    });
    if (!claudeRes.ok) { this.cb.recordClaudeFailure();
      j.insertEvent("ERROR","CLAUDE",`fail: ${claudeRes.error}`); return; }
    this.cb.recordClaudeSuccess();
    j.insertCoinScores(decisionId, claudeRes.decision.coin_scores);

    // 7. Risk-guard + execute each decision
    for (const d of claudeRes.decision.decisions) {
      const recent = this.db.prepare(
        "SELECT attempted_at, action FROM trade_attempts WHERE symbol = ? ORDER BY id DESC LIMIT 5"
      ).all(d.symbol) as any[];
      const ctx = {
        krw_balance, total_assets_krw, positions,
        daily_pnl_pct: 0, weekly_pnl_pct: 0,
        recent_trades_for_symbol: recent,
        spread_pct: market[d.symbol]?.orderbook?.spread_pct ?? 99
      };
      const ev = evaluateDecision(d, ctx, s);
      if (!ev.ok) {
        j.insertTradeAttempt({
          decision_id: decisionId, attempted_at: new Date().toISOString(),
          symbol: d.symbol, action: d.action, krw_amount: d.krw_amount, qty: null,
          order_type: d.order_type, limit_price: d.limit_price ?? null,
          reason: d.reason, signals: JSON.stringify(d.signals), confidence: d.confidence,
          stop_loss_price: d.stop_loss_price ?? null, take_profit_price: d.take_profit_price ?? null,
          risk_check: `BLOCKED:${ev.reason}`, result: "REJECTED",
          bithumb_order_id: null, filled_qty: null, filled_price: null, fee_krw: null,
          error: null
        });
        continue;
      }
      const final = ev.adjusted ?? d;
      await executeDecision(this.db, decisionId, final, s);
    }

    // 8. Snapshot
    j.insertSnapshot({
      taken_at: new Date().toISOString(),
      krw_balance, total_assets_krw,
      positions_value: total_assets_krw - krw_balance,
      daily_pnl_pct: 0, weekly_pnl_pct: 0, all_time_pnl_pct: 0
    });

    j.insertEvent("INFO","SCHEDULER","cycle end");
  }
}
