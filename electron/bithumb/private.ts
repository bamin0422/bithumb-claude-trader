import { signRequest } from "./sign";

const BASE = "https://api.bithumb.com";

export type Creds = { apiKey: string; apiSecret: string };

async function call(creds: Creds, endpoint: string, params: Record<string,any>) {
  const nonce = String(Date.now() * 1000);
  const { body, signature } = signRequest({ endpoint, params, apiSecret: creds.apiSecret, nonce });
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Api-Key": creds.apiKey,
      "Api-Sign": signature,
      "Api-Nonce": nonce,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const json = await res.json();
  if (json.status !== "0000") {
    const err: any = new Error(`bithumb ${endpoint}: ${json.status} ${json.message}`);
    err.status = json.status; throw err;
  }
  return json.data;
}

export async function getBalance(creds: Creds, currency = "ALL") {
  return call(creds, "/info/balance", { currency });
}

export async function placeMarketBuy(creds: Creds, symbol: string, krwAmount: number) {
  // Bithumb market buy uses 'units' or 'price' depending on endpoint version
  return call(creds, "/trade/market_buy", { order_currency: symbol, payment_currency: "KRW", units: krwAmount });
}

export async function placeMarketSell(creds: Creds, symbol: string, units: number) {
  return call(creds, "/trade/market_sell", { order_currency: symbol, payment_currency: "KRW", units });
}

export async function placeLimit(creds: Creds, symbol: string, side: "bid"|"ask", units: number, price: number) {
  return call(creds, "/trade/place", { order_currency: symbol, payment_currency: "KRW", units, price, type: side });
}

export async function getOrderDetail(creds: Creds, symbol: string, orderId: string, type: "bid"|"ask") {
  return call(creds, "/info/order_detail", { order_currency: symbol, payment_currency: "KRW", order_id: orderId, type });
}

export async function cancelOrder(creds: Creds, symbol: string, orderId: string, type: "bid"|"ask") {
  return call(creds, "/trade/cancel", { order_currency: symbol, payment_currency: "KRW", order_id: orderId, type });
}
