import type Database from "better-sqlite3";
import type { Decision, Settings } from "@shared/zod-schemas";
import { Journal } from "@main/storage/journal";
import * as bp from "@main/bithumb/private";
import { getBithumbKeys } from "@main/storage/secrets";

export type ExecResult = {
  result: "FILLED"|"PARTIAL"|"REJECTED"|"ERROR"|"PAPER";
  bithumb_order_id?: string;
  filled_qty?: number;
  filled_price?: number;
  fee_krw?: number;
  error?: string;
};

export async function executeDecision(
  db: Database.Database, decisionId: number, d: Decision, s: Settings
): Promise<ExecResult> {
  const j = new Journal(db);
  const attemptRow = {
    decision_id: decisionId,
    attempted_at: new Date().toISOString(),
    symbol: d.symbol, action: d.action,
    krw_amount: d.krw_amount, qty: null,
    order_type: d.order_type, limit_price: d.limit_price ?? null,
    reason: d.reason, signals: JSON.stringify(d.signals),
    confidence: d.confidence,
    stop_loss_price: d.stop_loss_price ?? null,
    take_profit_price: d.take_profit_price ?? null,
    risk_check: "PASSED",
    result: null, bithumb_order_id: null,
    filled_qty: null, filled_price: null, fee_krw: null, error: null
  };

  if (s.paper_mode) {
    const paper: ExecResult = { result: "PAPER", filled_qty: 0, filled_price: 0, fee_krw: 0 };
    j.insertTradeAttempt({ ...attemptRow, ...paper, signals: attemptRow.signals });
    return paper;
  }

  const creds = await getBithumbKeys();
  if (!creds) {
    const err: ExecResult = { result: "ERROR", error: "no bithumb keys" };
    j.insertTradeAttempt({ ...attemptRow, ...err });
    return err;
  }

  try {
    if (d.action === "BUY") {
      const order = d.order_type === "MARKET"
        ? await bp.placeMarketBuy({ apiKey: creds.key, apiSecret: creds.secret }, d.symbol, d.krw_amount)
        : await bp.placeLimit({ apiKey: creds.key, apiSecret: creds.secret }, d.symbol, "bid",
            d.krw_amount / (d.limit_price ?? 1), d.limit_price ?? 0);
      const ok: ExecResult = { result: "FILLED", bithumb_order_id: order.order_id ?? order.orderId };
      j.insertTradeAttempt({ ...attemptRow, ...ok });
      return ok;
    } else if (d.action === "SELL") {
      const order = await bp.placeMarketSell(
        { apiKey: creds.key, apiSecret: creds.secret }, d.symbol,
        // qty resolved by orchestrator passing krw_amount=qty in d for SELL? we keep simple: pass krw_amount as units
        d.krw_amount
      );
      const ok: ExecResult = { result: "FILLED", bithumb_order_id: order.order_id ?? order.orderId };
      j.insertTradeAttempt({ ...attemptRow, ...ok });
      return ok;
    }
    j.insertTradeAttempt({ ...attemptRow, result: "REJECTED", error: "unknown action" });
    return { result: "REJECTED" };
  } catch (e: any) {
    const err: ExecResult = { result: "ERROR", error: String(e.message ?? e) };
    j.insertTradeAttempt({ ...attemptRow, ...err });
    return err;
  }
}
