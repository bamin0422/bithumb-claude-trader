import { rsi } from "./rsi";
export function stochRsi(closes: number[], rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  const r = rsi(closes, rsiPeriod);
  const k: number[] = [];
  for (let i = 0; i < r.length; i++) {
    if (i < stochPeriod - 1 || !Number.isFinite(r[i])) { k.push(NaN); continue; }
    const win = r.slice(i - stochPeriod + 1, i + 1).filter(Number.isFinite);
    if (win.length < stochPeriod) { k.push(NaN); continue; }
    const lo = Math.min(...win), hi = Math.max(...win);
    k.push(hi === lo ? 50 : ((r[i] - lo) / (hi - lo)) * 100);
  }
  function sma(a: number[], p: number) {
    return a.map((_, i) => i < p - 1 ? NaN : a.slice(i - p + 1, i + 1).reduce((x, y) => x + y, 0) / p);
  }
  const ks = sma(k, smoothK), ds = sma(ks, smoothD);
  return { k: ks, d: ds };
}
