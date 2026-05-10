import { z } from "zod";

export const ActionEnum = z.enum(["BUY", "SELL", "HOLD"]);
export const RegimeEnum = z.enum(["RISK_ON", "MIXED", "RISK_OFF", "VOLATILE"]);
export const BtcTrendEnum = z.enum(["STRONG_UP", "UP", "SIDEWAYS", "DOWN", "STRONG_DOWN"]);
export const FearGreedEnum = z.enum(["EXTREME_FEAR","FEAR","NEUTRAL","GREED","EXTREME_GREED"]);
export const PlaybookEnum = z.enum(["A","B","C","D","MANAGEMENT","NONE"]);

// Accept either object or string descriptions from Claude (model often summarizes inline)
const FlexibleObj = z.union([z.record(z.string(), z.any()), z.string()]).optional();

export const CoinScoreSchema = z.object({
  symbol: z.string(),
  score: z.number().min(0).max(100),
  mtf_alignment: z.number().min(0).max(100).optional(),
  ema_state: z.string().optional(),
  momentum: FlexibleObj,
  volatility: FlexibleObj,
  volume_analysis: FlexibleObj,
  patterns: z.array(z.string()).default([]),
  key_levels: z.union([z.record(z.string(), z.any()), z.string()]).optional(),
  playbook_match: z.string().optional(),
  decision_hint: z.string().optional()
}).passthrough();

export const DecisionSchema = z.object({
  action: z.string().transform(s => s.toUpperCase().trim()).pipe(ActionEnum),
  symbol: z.string(),
  krw_amount: z.number().min(0).default(0),
  sell_ratio: z.number().min(0).max(1).default(0),
  order_type: z.string().default("LIMIT"),
  limit_price: z.number().optional(),
  playbook: z.string().default("NONE"),
  reason: z.string().max(500).default(""),
  signals: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  stop_loss_price: z.number().optional(),
  take_profit_price: z.number().optional(),
  expected_holding_hours: z.number().optional()
}).passthrough();

export const DecisionResponseSchema = z.object({
  market_analysis: z.object({
    regime: z.string(),
    btc_trend_4h: z.string(),
    fear_greed_state: z.string(),
    btc_dominance_view: z.string(),
    kst_session: z.string().optional(),
    summary: z.string(),
    key_risks: z.array(z.string()).default([])
  }).passthrough(),
  coin_scores: z.array(CoinScoreSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  portfolio_thoughts: z.union([z.record(z.string(), z.any()), z.string()]).optional(),
  next_check_focus: z.string().optional(),
  self_critique: z.string().optional()
}).passthrough();

export const SettingsSchema = z.object({
  trading_enabled: z.boolean().default(false),
  paper_mode: z.boolean().default(true),
  decision_interval_min: z.number().min(1).max(60).default(5),
  auto_start_on_login: z.boolean().default(true),
  run_in_background: z.boolean().default(true),
  watch_symbols: z.array(z.string()).default(["BTC","ETH","XRP","SOL","DOGE","WLD"]),
  risk: z.object({
    max_buy_ratio: z.number().default(0.25),
    max_position_ratio: z.number().default(0.50),
    daily_loss_limit_pct: z.number().default(10),
    stop_loss_pct: z.number().default(15),
    take_profit_pct: z.number().default(20),
    max_concurrent_positions: z.number().default(5),
    min_confidence_to_trade: z.number().default(0.55),
    max_drawdown_circuit_breaker_pct: z.number().default(15)
  }).default({} as any),
  claude: z.object({
    model: z.string().default("claude-opus-4-7"),
    max_turns: z.number().default(1),
    timeout_ms: z.number().default(120000),
    permission_mode: z.enum(["denyAll","default"]).default("denyAll")
  }).default({} as any),
  bithumb: z.object({
    api_key_set: z.boolean().default(false),
    use_market_orders: z.boolean().default(false),
    max_spread_pct_for_market: z.number().default(0.2)
  }).default({} as any),
  notifications: z.object({
    on_trade: z.boolean().default(true),
    on_error: z.boolean().default(true),
    on_circuit_breaker: z.boolean().default(true),
    macos_native: z.boolean().default(true)
  }).default({} as any),
  ui: z.object({
    theme: z.enum(["light","dark","system"]).default("system"),
    chart_default_timeframe: z.enum(["15m","1h","4h","1d"]).default("1h"),
    refresh_interval_sec: z.number().default(10)
  }).default({} as any)
});

export type Decision = z.infer<typeof DecisionSchema>;
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type CoinScore = z.infer<typeof CoinScoreSchema>;
