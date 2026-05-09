const BASE = "https://api.bithumb.com/public";

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`bithumb GET ${path}: ${res.status}`);
  const json = await res.json();
  if (json.status !== "0000") throw new Error(`bithumb error ${json.status}: ${json.message}`);
  return json.data;
}

export async function getTicker(symbol: string) {
  return get(`/ticker/${symbol}_KRW`);
}

export type CandleTF = "1m"|"3m"|"5m"|"10m"|"30m"|"1h"|"6h"|"12h"|"24h";
const TF_TO_PATH: Record<CandleTF,string> = {
  "1m":"1m","3m":"3m","5m":"5m","10m":"10m","30m":"30m",
  "1h":"1h","6h":"6h","12h":"12h","24h":"24h"
};

export async function getCandles(symbol: string, tf: CandleTF) {
  // returns [[timestamp, open, close, high, low, volume], ...]
  const data = await get(`/candlestick/${symbol}_KRW/${TF_TO_PATH[tf]}`);
  return (data as any[]).map(r => ({
    t: Number(r[0]), o: Number(r[1]), c: Number(r[2]),
    h: Number(r[3]), l: Number(r[4]), v: Number(r[5])
  }));
}

export async function getOrderbook(symbol: string) {
  const d = await get(`/orderbook/${symbol}_KRW?count=20`);
  return {
    bids: (d.bids as any[]).map(x => ({ price: Number(x.price), qty: Number(x.quantity) })),
    asks: (d.asks as any[]).map(x => ({ price: Number(x.price), qty: Number(x.quantity) }))
  };
}
