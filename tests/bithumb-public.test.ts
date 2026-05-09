import { describe, it, expect } from "vitest";
import { getTicker, getCandles, getOrderbook } from "../electron/bithumb/public";

const skip = !!process.env.SKIP_NETWORK;
describe.skipIf(skip)("bithumb public", () => {
  it("ticker BTC has positive last price", async () => {
    const t = await getTicker("BTC");
    expect(Number(t.closing_price)).toBeGreaterThan(0);
  });
  it("candles 1h returns array", async () => {
    const c = await getCandles("BTC", "1h");
    expect(c.length).toBeGreaterThan(50);
    expect(c[0]).toHaveProperty("o");
  });
  it("orderbook has bids/asks", async () => {
    const ob = await getOrderbook("BTC");
    expect(ob.bids.length).toBeGreaterThan(0);
    expect(ob.asks.length).toBeGreaterThan(0);
  });
});
