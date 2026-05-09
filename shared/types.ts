export type OHLCV = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Position = {
  symbol: string;
  qty: number;
  avg_price: number;
  entered_at: string;
  highest_pnl_pct: number;
  stop_loss_price: number | null;
  take_profit_price: number | null;
  last_updated: string;
};
export type Portfolio = {
  krw_balance: number;
  total_assets_krw: number;
  positions_value: number;
  daily_pnl_pct: number;
  weekly_pnl_pct: number;
  positions: Position[];
};
export type IndicatorBundle = {
  ema: { ema20: number; ema50: number; ema200: number };
  rsi: number;
  macd: { macd: number; signal: number; histogram: number };
  bbands: { upper: number; middle: number; lower: number; width_pct: number; percent_b: number };
  atr_14: { absolute: number; pct_of_price: number };
  adx: number;
  stoch_rsi: { k: number; d: number };
  ichimoku: { tenkan: number; kijun: number; senkou_a: number; senkou_b: number; cloud_state: "ABOVE"|"INSIDE"|"BELOW" };
  obv_slope: number;
  vwap: { value: number; dev_pct: number };
};
