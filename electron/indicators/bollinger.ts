export function bollinger(closes: number[], period = 20, mult = 2) {
  const out = { upper: [] as number[], middle: [] as number[], lower: [] as number[],
                width_pct: [] as number[], percent_b: [] as number[] };
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.upper.push(NaN); out.middle.push(NaN); out.lower.push(NaN); out.width_pct.push(NaN); out.percent_b.push(NaN); continue; }
    const window = closes.slice(i - period + 1, i + 1);
    const m = window.reduce((a, b) => a + b, 0) / period;
    const v = window.reduce((a, b) => a + (b - m) * (b - m), 0) / period;
    const s = Math.sqrt(v);
    const u = m + mult * s, l = m - mult * s;
    out.upper.push(u); out.middle.push(m); out.lower.push(l);
    out.width_pct.push(((u - l) / m) * 100);
    out.percent_b.push((closes[i] - l) / (u - l));
  }
  return out;
}
