import type { OHLCV } from "@shared/types";
function highest(arr: number[], p: number, i: number) { return Math.max(...arr.slice(i - p + 1, i + 1)); }
function lowest(arr: number[], p: number, i: number) { return Math.min(...arr.slice(i - p + 1, i + 1)); }

export function ichimoku(candles: OHLCV[]) {
  const highs = candles.map(c => c.h), lows = candles.map(c => c.l);
  const tenkan: number[] = [], kijun: number[] = [], senA: number[] = [], senB: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    tenkan.push(i < 8 ? NaN : (highest(highs, 9, i) + lowest(lows, 9, i)) / 2);
    kijun.push(i < 25 ? NaN : (highest(highs, 26, i) + lowest(lows, 26, i)) / 2);
    senA.push(i < 25 ? NaN : (tenkan[i] + kijun[i]) / 2);
    senB.push(i < 51 ? NaN : (highest(highs, 52, i) + lowest(lows, 52, i)) / 2);
  }
  const last = candles.length - 1;
  const price = candles[last].c, a = senA[last], b = senB[last];
  let cloud_state: "ABOVE"|"INSIDE"|"BELOW" = "INSIDE";
  if (Number.isFinite(a) && Number.isFinite(b)) {
    const top = Math.max(a, b), bot = Math.min(a, b);
    if (price > top) cloud_state = "ABOVE";
    else if (price < bot) cloud_state = "BELOW";
  }
  return { tenkan, kijun, senkou_a: senA, senkou_b: senB, cloud_state };
}
