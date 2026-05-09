import { ema } from "./ema";
import type { OHLCV } from "@shared/types";

export function alignmentScore(tf1d: OHLCV[], tf4h: OHLCV[], tf1h: OHLCV[]): number {
  function trendUp(c: OHLCV[]): number {
    const closes = c.map(x => x.c);
    const e20 = ema(closes, 20).at(-1)!;
    const e50 = ema(closes, 50).at(-1)!;
    const last = closes.at(-1)!;
    if (!Number.isFinite(e20) || !Number.isFinite(e50)) return 0;
    if (last > e20 && e20 > e50) return 1;
    if (last < e20 && e20 < e50) return -1;
    return 0;
  }
  const t = [trendUp(tf1d), trendUp(tf4h), trendUp(tf1h)];
  const same = t.every(x => x === 1) || t.every(x => x === -1);
  if (same) return 100;
  const twoSame = (t[0] === t[1] && t[1] !== 0) || (t[1] === t[2] && t[1] !== 0);
  if (twoSame) return 60;
  return 30;
}
