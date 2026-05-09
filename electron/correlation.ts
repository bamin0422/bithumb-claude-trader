function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, dxs = 0, dys = 0;
  for (let i = 0; i < n; i++) {
    const dx = a[i] - ma, dy = b[i] - mb;
    num += dx * dy; dxs += dx * dx; dys += dy * dy;
  }
  const denom = Math.sqrt(dxs * dys);
  return denom === 0 ? 0 : num / denom;
}

export function correlationMatrix(closesBySymbol: Record<string, number[]>): Record<string, number> {
  const symbols = Object.keys(closesBySymbol);
  const out: Record<string, number> = {};
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const r = pearson(closesBySymbol[symbols[i]], closesBySymbol[symbols[j]]);
      out[`${symbols[i]}-${symbols[j]}`] = Math.round(r * 1000) / 1000;
    }
  }
  return out;
}
