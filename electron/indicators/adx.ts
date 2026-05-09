import type { OHLCV } from "@shared/types";

export function adx(candles: OHLCV[], period = 14): number[] {
  const len = candles.length;
  const tr: number[] = [], pdm: number[] = [], ndm: number[] = [];
  for (let i = 0; i < len; i++) {
    if (i === 0) { tr.push(candles[i].h - candles[i].l); pdm.push(0); ndm.push(0); continue; }
    const c = candles[i], p = candles[i-1];
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
    const up = c.h - p.h, dn = p.l - c.l;
    pdm.push(up > dn && up > 0 ? up : 0);
    ndm.push(dn > up && dn > 0 ? dn : 0);
  }
  function wilder(arr: number[]) {
    const out: number[] = new Array(period - 1).fill(NaN);
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    out.push(s);
    for (let i = period; i < arr.length; i++) { s = s - s/period + arr[i]; out.push(s); }
    return out;
  }
  const trS = wilder(tr), pS = wilder(pdm), nS = wilder(ndm);
  const dx: number[] = [];
  for (let i = 0; i < len; i++) {
    if (!Number.isFinite(trS[i]) || trS[i] === 0) { dx.push(NaN); continue; }
    const pDI = 100 * pS[i] / trS[i];
    const nDI = 100 * nS[i] / trS[i];
    dx.push(100 * Math.abs(pDI - nDI) / (pDI + nDI || 1));
  }
  const out: number[] = new Array(period * 2 - 1).fill(NaN);
  let avg = dx.slice(period - 1, period * 2 - 1).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) / period;
  out.push(avg);
  for (let i = period * 2; i < len; i++) {
    avg = (avg * (period - 1) + dx[i]) / period;
    out.push(avg);
  }
  return out;
}
