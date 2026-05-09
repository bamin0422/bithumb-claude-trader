CREATE TABLE IF NOT EXISTS decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_at      TEXT    NOT NULL,
  claude_raw    TEXT    NOT NULL,
  market_view   TEXT,
  fear_greed    INTEGER,
  btc_dominance REAL,
  cost_usd      REAL,
  duration_ms   INTEGER,
  status        TEXT    NOT NULL,   -- OK|SCHEMA_FAIL|TIMEOUT|BUDGET_BLOCKED
  error         TEXT
);

CREATE TABLE IF NOT EXISTS coin_scores (
  decision_id   INTEGER NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  symbol        TEXT    NOT NULL,
  score         INTEGER NOT NULL,
  ema_state     TEXT,
  rsi_1h        REAL,
  macd_state    TEXT,
  volume_ratio  REAL,
  patterns      TEXT,                -- JSON array
  playbook      TEXT,
  decision_hint TEXT
);

CREATE TABLE IF NOT EXISTS trade_attempts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id       INTEGER REFERENCES decisions(id),
  attempted_at      TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  action            TEXT NOT NULL,   -- BUY|SELL
  krw_amount        REAL,
  qty               REAL,
  order_type        TEXT,            -- MARKET|LIMIT
  limit_price       REAL,
  reason            TEXT,
  signals           TEXT,            -- JSON array
  confidence        REAL,
  stop_loss_price   REAL,
  take_profit_price REAL,
  risk_check        TEXT NOT NULL,   -- PASSED|BLOCKED:reason
  result            TEXT,            -- FILLED|PARTIAL|REJECTED|ERROR|PAPER
  bithumb_order_id  TEXT,
  filled_qty        REAL,
  filled_price      REAL,
  fee_krw           REAL,
  error             TEXT
);

CREATE TABLE IF NOT EXISTS positions (
  symbol            TEXT PRIMARY KEY,
  qty               REAL NOT NULL,
  avg_price         REAL NOT NULL,
  entered_at        TEXT NOT NULL,
  highest_pnl_pct   REAL DEFAULT 0,  -- 트레일링용
  stop_loss_price   REAL,
  take_profit_price REAL,
  last_updated      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  taken_at         TEXT PRIMARY KEY,
  krw_balance      REAL NOT NULL,
  total_assets_krw REAL NOT NULL,
  positions_value  REAL NOT NULL,
  daily_pnl_pct    REAL,
  weekly_pnl_pct   REAL,
  all_time_pnl_pct REAL
);

CREATE TABLE IF NOT EXISTS market_cache (
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,         -- 5m|15m|1h|4h|1d
  fetched_at  TEXT NOT NULL,
  ohlcv_json  TEXT NOT NULL,
  PRIMARY KEY (symbol, timeframe)
);

CREATE TABLE IF NOT EXISTS daily_performance (
  date            TEXT PRIMARY KEY,  -- YYYY-MM-DD KST
  start_assets    REAL,
  end_assets      REAL,
  pnl_krw         REAL,
  pnl_pct         REAL,
  trades_count    INTEGER,
  wins            INTEGER,
  losses          INTEGER,
  fees_paid_krw   REAL
);

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  level     TEXT NOT NULL,           -- INFO|WARN|ERROR|CRITICAL
  category  TEXT NOT NULL,           -- SCHEDULER|CLAUDE|BITHUMB|RISK|EXEC|UI
  message   TEXT NOT NULL,
  meta      TEXT                     -- JSON
);

CREATE INDEX IF NOT EXISTS idx_decisions_cycle ON decisions(cycle_at);
CREATE INDEX IF NOT EXISTS idx_attempts_time ON trade_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_attempts_symbol ON trade_attempts(symbol, attempted_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_time ON portfolio_snapshots(taken_at);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(at);
