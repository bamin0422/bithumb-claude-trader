export const krw = (n: number) => "₩" + Math.round(n).toLocaleString("ko-KR");
export const pct = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
export const num = (n: number, digits = 4) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: digits });
