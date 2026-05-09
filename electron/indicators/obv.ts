import type { OHLCV } from "@shared/types";
export function obv(candles: OHLCV[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const prev = out[i - 1];
    if (candles[i].c > candles[i-1].c) out.push(prev + candles[i].v);
    else if (candles[i].c < candles[i-1].c) out.push(prev - candles[i].v);
    else out.push(prev);
  }
  return out;
}
export function obvSlope(o: number[], lookback = 20): number {
  if (o.length < lookback) return 0;
  const a = o.slice(-lookback);
  return (a[a.length-1] - a[0]) / lookback;
}
