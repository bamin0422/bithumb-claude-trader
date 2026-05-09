import { ema } from "./ema";

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const line: number[] = closes.map((_, i) => fastE[i] - slowE[i]);
  const valid = line.map(v => Number.isFinite(v) ? v : 0);
  const sigE = ema(valid, signal);
  const hist = line.map((v, i) => v - sigE[i]);
  return { macd: line, signal: sigE, histogram: hist };
}
