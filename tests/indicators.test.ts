import { describe, it, expect } from "vitest";
import { ema } from "../electron/indicators/ema";
import { rsi } from "../electron/indicators/rsi";
import { macd } from "../electron/indicators/macd";
import { bollinger } from "../electron/indicators/bollinger";
import { atr } from "../electron/indicators/atr";

describe("ema", () => {
  it("matches manual calc for period 3", () => {
    const out = ema([1,2,3,4,5,6,7,8,9,10], 3);
    // EMA3 from index 2 onwards. k = 2/(3+1) = 0.5
    // EMA[2] = SMA(1,2,3) = 2; EMA[3] = (4-2)*0.5+2 = 3; EMA[4] = (5-3)*0.5+3=4; ...
    expect(out.slice(-1)[0]).toBeCloseTo(9, 4);
  });
});

describe("rsi", () => {
  it("known wilder RSI for sample", () => {
    const closes = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,
                    45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
    const r = rsi(closes, 14);
    expect(r[r.length - 1]).toBeGreaterThan(50);
    expect(r[r.length - 1]).toBeLessThan(80);
  });
});

describe("macd", () => {
  it("returns three series of equal length", () => {
    const closes = Array.from({length: 60}, (_, i) => 100 + Math.sin(i/3) * 5);
    const m = macd(closes);
    expect(m.macd.length).toBe(60);
    expect(m.signal.length).toBe(60);
    expect(m.histogram.length).toBe(60);
  });
});

describe("bollinger", () => {
  it("upper > middle > lower for noisy series", () => {
    const closes = Array.from({length: 30}, (_, i) => 100 + (i % 2 ? 1 : -1));
    const b = bollinger(closes, 20, 2);
    const i = 25;
    expect(b.upper[i]).toBeGreaterThan(b.middle[i]);
    expect(b.middle[i]).toBeGreaterThan(b.lower[i]);
  });
});

describe("atr", () => {
  it("positive after period candles", () => {
    const c = Array.from({length: 30}, (_, i) => ({ t: i, o: 100, h: 102, l: 98, c: 100+i*0.1, v: 1 }));
    const a = atr(c, 14);
    expect(a.slice(-1)[0]).toBeGreaterThan(0);
  });
});
