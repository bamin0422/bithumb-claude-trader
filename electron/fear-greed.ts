export type FearGreed = { value: number; classification: string; change_24h: number; ma_7d: number };

export async function getFearGreed(): Promise<FearGreed> {
  const res = await fetch("https://api.alternative.me/fng/?limit=8");
  const j = await res.json();
  const d = j.data as any[];
  const today = Number(d[0].value);
  const yest = Number(d[1].value);
  const last7 = d.slice(0, 7).map(x => Number(x.value));
  const ma7 = last7.reduce((a, b) => a + b, 0) / last7.length;
  return {
    value: today,
    classification: d[0].value_classification,
    change_24h: today - yest,
    ma_7d: Math.round(ma7 * 100) / 100
  };
}
