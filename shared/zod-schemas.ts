import { z } from "zod";

export const ActionEnum = z.enum(["BUY", "SELL", "HOLD"]);
export const RegimeEnum = z.enum(["RISK_ON", "MIXED", "RISK_OFF", "VOLATILE"]);
export const BtcTrendEnum = z.enum(["STRONG_UP", "UP", "SIDEWAYS", "DOWN", "STRONG_DOWN"]);
export const FearGreedEnum = z.enum(["EXTREME_FEAR","FEAR","NEUTRAL","GREED","EXTREME_GREED"]);
export const PlaybookEnum = z.enum(["A","B","C","D","MANAGEMENT","NONE"]);

export const CoinScoreSchema = z.object({
  symbol: z.string(),
  score: z.number().min(0).max(100),
  mtf_alignment: z.number().min(0).max(100).optional(),
  ema_state: z.string().optional(),
  momentum: z.object({
    rsi_1h: z.number().optional(),
    macd: z.string().optional(),
    stoch_rsi: z.string().optional()
  }).optional(),
  volatility: z.object({
    atr_pct: z.number().optional(),
    bb_state: z.string().optional()
  }).optional(),
  volume_analysis: z.object({
    ratio: z.number().optional(),
    obv_slope: z.string().optional()
  }).optional(),
  patterns: z.array(z.string()).default([]),
  key_levels: z.object({
    support: z.number().optional(),
    resistance: z.number().optional(),
    vwap: z.number().optional()
  }).optional(),
  playbook_match: PlaybookEnum.optional(),
  decision_hint: ActionEnum.optional()
});

export const DecisionSchema = z.object({
  action: ActionEnum,
  symbol: z.string(),
  krw_amount: z.number().min(0).default(0),
  sell_ratio: z.number().min(0).max(1).default(0),
  order_type: z.enum(["MARKET","LIMIT"]).default("LIMIT"),
  limit_price: z.number().optional(),
  playbook: PlaybookEnum.default("NONE"),
  reason: z.string().max(200),
  signals: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  stop_loss_price: z.number().optional(),
  take_profit_price: z.number().optional(),
  expected_holding_hours: z.number().optional()
});

export const DecisionResponseSchema = z.object({
  market_analysis: z.object({
    regime: RegimeEnum,
    btc_trend_4h: BtcTrendEnum,
    fear_greed_state: FearGreedEnum,
    btc_dominance_view: z.enum(["ALT_FAVORABLE","NEUTRAL","BTC_FAVORABLE"]),
    kst_session: z.string().optional(),
    summary: z.string(),
    key_risks: z.array(z.string()).default([])
  }),
  coin_scores: z.array(CoinScoreSchema),
  decisions: z.array(DecisionSchema),
  portfolio_thoughts: z.object({
    current_concentration_risk: z.enum(["LOW","MEDIUM","HIGH"]).optional(),
    rebalance_needed: z.boolean().optional(),
    cash_ratio_target: z.number().min(0).max(1).optional()
  }).optional(),
  next_check_focus: z.string().optional(),
  self_critique: z.string().optional()
});

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
  }),
  claude: z.object({
    model: z.string().default("claude-opus-4-7"),
    max_turns: z.number().default(1),
    timeout_ms: z.number().default(120000),
    permission_mode: z.enum(["denyAll","default"]).default("denyAll")
  }),
  bithumb: z.object({
    api_key_set: z.boolean().default(false),
    use_market_orders: z.boolean().default(false),
    max_spread_pct_for_market: z.number().default(0.2)
  }),
  notifications: z.object({
    on_trade: z.boolean().default(true),
    on_error: z.boolean().default(true),
    on_circuit_breaker: z.boolean().default(true),
    macos_native: z.boolean().default(true)
  }),
  ui: z.object({
    theme: z.enum(["light","dark","system"]).default("system"),
    chart_default_timeframe: z.enum(["15m","1h","4h","1d"]).default("1h"),
    refresh_interval_sec: z.number().default(10)
  })
});

export type Decision = z.infer<typeof DecisionSchema>;
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type CoinScore = z.infer<typeof CoinScoreSchema>;
