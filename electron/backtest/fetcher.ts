import { getCandles, type CandleTF } from "@main/bithumb/public";
export async function fetchHistorical(symbols: string[], tf: CandleTF) {
  const out: Record<string, any[]> = {};
  for (const s of symbols) out[s] = await getCandles(s, tf);
  return out;
}
