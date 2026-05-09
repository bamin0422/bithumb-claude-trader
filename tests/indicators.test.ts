import { describe, it, expect } from "vitest";
import { ema } from "../electron/indicators/ema";
import { rsi } from "../electron/indicators/rsi";

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
