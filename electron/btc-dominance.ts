export type BtcDominance = { value: number; change_24h: number };

export async function getBtcDominance(): Promise<BtcDominance> {
  const res = await fetch("https://api.coingecko.com/api/v3/global");
  const j = await res.json();
  const d = j.data;
  return {
    value: Number(d.market_cap_percentage.btc),
    change_24h: Number(d.market_cap_change_percentage_24h_usd)
  };
}
