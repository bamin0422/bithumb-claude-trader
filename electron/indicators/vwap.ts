import type { OHLCV } from "@shared/types";
export function vwap24h(candles: OHLCV[]): { value: number; dev_pct: number } {
  // assume input is recent 24h of candles
  let pv = 0, vv = 0;
  for (const c of candles) {
    const tp = (c.h + c.l + c.c) / 3;
    pv += tp * c.v; vv += c.v;
  }
  const value = vv === 0 ? candles.at(-1)!.c : pv / vv;
  const last = candles.at(-1)!.c;
  return { value, dev_pct: ((last - value) / value) * 100 };
}
