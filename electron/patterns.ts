import type { OHLCV } from "@shared/types";

export function detectPatterns(c: OHLCV[]): string[] {
  const out: string[] = [];
  if (c.length < 3) return out;
  const last = c.at(-1)!, prev = c.at(-2)!;
  const body = (k: OHLCV) => Math.abs(k.c - k.o);
  const range = (k: OHLCV) => k.h - k.l || 1;

  // Doji
  if (body(last) / range(last) < 0.1) out.push("DOJI");

  // Hammer
  if (last.c > last.o && (last.o - last.l) > 2 * body(last) && (last.h - last.c) < body(last) * 0.3)
    out.push("HAMMER");

  // Shooting Star
  if (last.c < last.o && (last.h - last.o) > 2 * body(last) && (last.c - last.l) < body(last) * 0.3)
    out.push("SHOOTING_STAR");

  // Bullish Engulfing
  if (prev.c < prev.o && last.c > last.o && last.c > prev.o && last.o < prev.c)
    out.push("BULL_ENGULFING");

  // Bearish Engulfing
  if (prev.c > prev.o && last.c < last.o && last.c < prev.o && last.o > prev.c)
    out.push("BEAR_ENGULFING");

  // Breakout 24h high (assume input is enough; check last 24 candles for hourly)
  const last24 = c.slice(-25, -1);
  if (last24.length === 24) {
    const high24 = Math.max(...last24.map(x => x.h));
    if (last.c > high24) out.push("BREAKOUT_24H_HIGH");
  }

  return out;
}
