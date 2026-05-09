export function rsi(closes: number[], period = 14): number[] {
  if (closes.length <= period) return [];
  const out: number[] = new Array(period).fill(NaN);
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  out.push(100 - 100 / (1 + (avgL === 0 ? Infinity : avgG / avgL)));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out.push(100 - 100 / (1 + (avgL === 0 ? Infinity : avgG / avgL)));
  }
  return out;
}
