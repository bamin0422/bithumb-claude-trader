# Bithumb × Claude Code 자동매매 트레이더 — 디자인 명세

**날짜**: 2026-05-09
**상태**: 디자인 단계 (사용자 검토 대기)
**대상 디렉토리**: `/Users/mindaein/Project/bithumb-claude-trader`
**Git 레포**: `github.com/bamin0422/bithumb-claude-trader` (public)

## 1. 목적과 범위

빗썸 KRW 마켓에서 **Claude Code CLI의 판단**으로만 자동 매매를 수행하는 Electron 데스크탑 앱.

핵심 요건:
1. 모든 매매 결정은 Claude Code CLI 호출로 이루어진다 (사용자 개입 0).
2. 코인 투자 전문 AI 지침 markdown을 시스템 프롬프트로 사용한다.
3. Electron 대시보드로 수익률·포트폴리오·결정 근거를 시각화한다.
4. 완성 후 GitHub public repo로 푸시한다.

**거래 모드**: 실거래 즉시 시작 (사용자 결정).
**거래 주기**: 5분.
**거래 대상 코인 (기본값)**: BTC, ETH, XRP, SOL, DOGE, WLD — 설정에서 자유 추가/삭제.
**위험 한도 (기본값)**: 공격적 — 매수 25% / 포지션 50% / 일일손실 -10% / 손절 -15%. 설정에서 조정 가능.

## 2. 시스템 아키텍처

옵션 비교 결과 **올인원 Electron 앱** 채택. 클라우드 배포(Vercel/Railway)는 Claude Code CLI를 자연스럽게 호출하기 어려워 제외.

```
bithumb-claude-trader/
├── electron/
│   ├── main.ts              # Main: 스케줄러 + 거래 오케스트레이터
│   ├── preload.ts           # contextBridge IPC
│   ├── scheduler.ts         # 5분 cron
│   ├── claude-runner.ts     # `claude -p` 서브프로세스
│   ├── trader/
│   │   ├── orchestrator.ts
│   │   ├── risk-guard.ts
│   │   ├── circuit-breaker.ts
│   │   └── executor.ts
│   ├── bithumb/
│   │   ├── public.ts        # 시세, 캔들, 호가
│   │   └── private.ts       # 잔고, 주문, HMAC-SHA512
│   ├── indicators/          # EMA, RSI, MACD, BB, ATR, ADX, Stoch, Ichimoku, OBV, VWAP
│   ├── patterns.ts          # 캔들/차트 패턴
│   ├── correlation.ts       # 코인간 상관계수 (24h 캐시)
│   ├── fear-greed.ts        # alternative.me
│   ├── btc-dominance.ts     # CoinGecko global
│   ├── performance.ts       # 승률/PF/Sharpe
│   ├── storage/
│   │   ├── db.ts            # better-sqlite3
│   │   ├── migrations/
│   │   ├── settings.ts      # electron-store
│   │   └── secrets.ts       # keytar
│   └── notifications.ts     # macOS native + Discord
├── renderer/
│   ├── App.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Portfolio.tsx
│   │   ├── TradeLog.tsx
│   │   ├── Decisions.tsx
│   │   └── Settings.tsx
│   └── components/
├── prompts/
│   └── crypto-trading-ai-guide.md
├── shared/
│   ├── types.ts
│   └── zod-schemas.ts
├── tests/
├── electron-builder.yml
├── vite.config.ts
├── tsconfig.json
├── package.json
├── .gitignore
└── README.md
```

### 데이터 흐름 (5분마다)
1. Scheduler → Orchestrator
2. Bithumb public/private + Fear&Greed + BTC dominance 병렬 수집
3. 지표 사전 계산 (EMA/RSI/MACD/BB/ATR/ADX/Ichimoku/OBV/VWAP) + 패턴 감지
4. 프롬프트 구성: system = AI 지침 markdown, user = JSON(market+portfolio+macro+indicators)
5. `claude -p --output-format json --max-turns 1 --permission-mode denyAll`
6. 응답 JSON 파싱 + Zod 검증 (실패시 재시도 2회, 그래도 실패면 사이클 HOLD)
7. **Risk-Guard 강제 검증** (Claude 응답과 무관하게 코드가 한도 차단)
8. Executor → Bithumb 주문 + 5초 후 체결 확인
9. SQLite 저장 + IPC로 renderer 푸시

## 3. AI 투자 지침 (`prompts/crypto-trading-ai-guide.md`) — v3

매 사이클 시스템 프롬프트로 주입.

### 3.1 정체성
5년차 암호화폐 퀀트 트레이더. 신념: "한 번의 큰 손실이 백 번의 수익보다 치명적". HOLD가 가장 흔한 정답.

### 3.2 입력 데이터 (시스템이 사전 계산)
- portfolio: krw_balance, total_assets, daily/weekly_pnl, max_drawdown_7d, positions[]
- market[symbol]: ticker, ohlcv {5m/15m/1h/4h/1d}, indicators (모두 사전 계산), orderbook, patterns_detected, key_levels
- macro: fear_greed (값+분류+24h 변화+7d 이평), btc_dominance, total_market_cap_change, btc_4h_regime
- correlation_matrix_30d
- recent_trades (최근 20)
- performance: win_rate, avg_win/loss, profit_factor, sharpe
- limits: 사용자 설정 한도

### 3.3 기술적 분석 — 멀티 타임프레임 정합성
- **시간프레임 위계**: 1d(방향) > 4h(스윙) > 1h(메인 진입) > 15m(미세) > 5m(슬리피지)
- **MTF Alignment Score (0~100)**: 1d/4h/1h 모두 EMA20>EMA50 + 가격>EMA50 = 100점. 70점 미만이면 신규 매수 보류.
- **추세**: EMA20/50/200 정렬, 골든/데드크로스 (1h+4h), Ichimoku 구름, ADX>25
- **모멘텀**: RSI(14), Stochastic RSI, MACD 히스토그램, 다이버전스
- **변동성**: Bollinger Squeeze, ATR%, BB %B
- **거래량**: 비율(20봉 평균 대비), OBV slope, VWAP
- **호가**: imbalance, spread, 매수/매도 벽
- **패턴**: 캔들(Hammer, Engulfing, Doji, Morning/Evening Star, ...) + 차트(Breakout, Bull Flag, Double Bottom, ...) — 확증 신호로만 사용

### 3.4 시장 심리
- 공포/탐욕 × BTC 4h 매트릭스 → 공격성 결정
- BTC 도미넌스 추세 → 알트 비중 조절
- KST 시간대(아시아 활성/미국 프라임/주말) → 한도 조정

### 3.5 의사결정 알고리즘
- **Step 0** 정지 사유: daily loss limit, MDD, 연속 손절
- **Step 1** 보유 포지션 관리(방어 우선): 하드 손절, 추세 손절, 익절 1단계(50%)/2단계(전량), 트레일링 스톱(ATR×2), 시간 손절(24h+미실현손실)
- **Step 2** 시장 레짐: RISK_ON / MIXED / RISK_OFF / VOLATILE
- **Step 3** 종목 점수(0~100): MTF정합성(25) + EMA구조(15) + 모멘텀(15) + 거래량+OBV(10) + 변동성(10) + 호가(8) + 패턴(7) + 시장심리(±10)
- **Step 4** 포지션 사이징(Kelly-Lite): 가용KRW × MAX_BUY_RATIO × confidence × regime_factor. 상관계수 0.85+ 코인 동시 매수 제한.
- **Step 5** 진입/청산가: 시장가 vs 지정가, stop_loss = max(entry×(1-SL), entry-ATR×2), take_profit = min(entry×(1+TP), 저항×0.99)

### 3.6 명시적 플레이북
- A: Breakout Long
- B: Pullback to EMA20
- C: Oversold Reversal
- D: Mean Reversion (횡보장)
- Anti-Playbook: 떨어지는 칼날, 호가 스프레드 0.5%+, FOMO 추격, 신규상장 24h, 주말새벽+ADX<20

### 3.7 Confidence 캘리브레이션
0.0~0.3 거래 금지 / 0.3~0.5 HOLD 권장 / 0.5~0.7 한도×0.5 / 0.7~0.85 한도×0.75 / 0.85~0.95 한도×1.0 / 0.95+ 강등

### 3.8 출력 스키마 (반드시 이 JSON만)
- market_analysis: regime/trend/F&G/dominance/session/summary/key_risks
- coin_scores[]: symbol/score/mtf_alignment/ema_state/momentum/volatility/volume/patterns/key_levels/playbook_match/decision_hint
- decisions[]: action/symbol/krw_amount/sell_ratio/order_type/limit_price/playbook/reason/signals/stop_loss_price/take_profit_price/confidence/expected_holding_hours
- portfolio_thoughts: concentration_risk/rebalance_needed/cash_ratio_target
- next_check_focus
- self_critique

### 3.9 자기 점검 체크리스트
1. FOMO인가? 2. 손절가 ATR 1배 이상? 3. 같은 신호로 직전 7일 손실은? 4. RISK_OFF인데 매수 이유는? 5. confidence 과도하지 않은가?

## 4. Claude CLI 호출 설계

### 4.1 인증
- `ANTHROPIC_API_KEY` 또는 사용자 기존 `claude` CLI 로그인 세션 활용
- 사용자 본인 계정으로 청구 (별도 비용 가드 불필요)

### 4.2 호출 옵션
```
claude -p "<user prompt>" \
  --system-prompt-file prompts/crypto-trading-ai-guide.md \
  --output-format json \
  --max-turns 1 \
  --permission-mode denyAll \
  --model claude-opus-4-7 \
  --no-telemetry
```
- `--max-turns 1`: 단일 턴, 도구 사용 차단
- `--permission-mode denyAll`: Bash/Read/Write 차단, 순수 추론기로만
- 타임아웃 120s + SIGKILL
- 스키마 위반 시 재시도 2회, 그래도 실패면 사이클 HOLD

### 4.3 응답 처리
CLI `--output-format json` 봉투의 `result` 필드를 다시 JSON.parse → Zod `DecisionResponseSchema` 검증.

## 5. 데이터베이스 스키마 (SQLite, better-sqlite3)

```sql
CREATE TABLE decisions (
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

CREATE TABLE coin_scores (
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

CREATE TABLE trade_attempts (
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

CREATE TABLE positions (
  symbol            TEXT PRIMARY KEY,
  qty               REAL NOT NULL,
  avg_price         REAL NOT NULL,
  entered_at        TEXT NOT NULL,
  highest_pnl_pct   REAL DEFAULT 0,  -- 트레일링용
  stop_loss_price   REAL,
  take_profit_price REAL,
  last_updated      TEXT NOT NULL
);

CREATE TABLE portfolio_snapshots (
  taken_at         TEXT PRIMARY KEY,
  krw_balance      REAL NOT NULL,
  total_assets_krw REAL NOT NULL,
  positions_value  REAL NOT NULL,
  daily_pnl_pct    REAL,
  weekly_pnl_pct   REAL,
  all_time_pnl_pct REAL
);

CREATE TABLE market_cache (
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,         -- 5m|15m|1h|4h|1d
  fetched_at  TEXT NOT NULL,
  ohlcv_json  TEXT NOT NULL,
  PRIMARY KEY (symbol, timeframe)
);

CREATE TABLE daily_performance (
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

CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  level     TEXT NOT NULL,           -- INFO|WARN|ERROR|CRITICAL
  category  TEXT NOT NULL,           -- SCHEDULER|CLAUDE|BITHUMB|RISK|EXEC|UI
  message   TEXT NOT NULL,
  meta      TEXT                     -- JSON
);

CREATE INDEX idx_decisions_cycle ON decisions(cycle_at);
CREATE INDEX idx_attempts_time ON trade_attempts(attempted_at);
CREATE INDEX idx_attempts_symbol ON trade_attempts(symbol, attempted_at);
CREATE INDEX idx_snapshots_time ON portfolio_snapshots(taken_at);
CREATE INDEX idx_events_time ON events(at);
```

## 6. 설정 스키마 (electron-store, Zod 검증)

- 운영: trading_enabled, paper_mode, decision_interval_min, auto_start_on_login, run_in_background
- 거래 대상: watch_symbols (기본 BTC/ETH/XRP/SOL/DOGE/WLD)
- 위험 한도: max_buy_ratio, max_position_ratio, daily_loss_limit_pct, stop_loss_pct, take_profit_pct, max_concurrent_positions, min_confidence_to_trade, max_drawdown_circuit_breaker_pct
- Claude: model, max_turns, timeout_ms, permission_mode
- Bithumb: api_key_set 메타플래그 (실제 키는 keytar/macOS Keychain), use_market_orders, max_spread_pct_for_market
- 알림: on_trade, on_error, on_circuit_breaker, macos_native, discord_webhook
- UI: theme, chart_default_timeframe, refresh_interval_sec

## 7. 대시보드 UI

5개 페이지: Overview / Portfolio / Trade Log / Decisions / Settings.

상단 글로벌 헤더: 거래 ON/OFF 토글, 총자산, 오늘 P&L, 빨간 "긴급 정지" 버튼(전 종목 시장가 매도 + 24h 자동 재개 잠금).

기술 스택: React 18 + Vite + Tailwind + shadcn/ui + TanStack Query + Recharts + Lucide + Monaco editor (지침 markdown 편집용).

## 8. 안전장치 (Defense in Depth)

- L1 사용자 토글 (UI 헤더)
- L2 페이퍼 모드 (실주문 차단, 시뮬만)
- L3 Risk-Guard (코드가 한도 강제, Claude 무관)
- L4 거래소 한도 (Bithumb 자체)
- L5 Circuit Breaker
  - daily loss → SELL-only 모드
  - 7d MDD → 전면 정지
  - 연속 5회 손절 → 1시간 휴식
  - Claude CLI 연속 3회 실패 → 1시간 휴식
  - Bithumb API 연속 5회 실패 → 30분 휴식
  - BTC 1h -10% 급락 → SELL-only 1시간
- L6 감사 로그 (`events` 테이블 영구 보관)

## 9. 테스트 전략

- 단위 (Vitest): indicators 정확도, risk-guard 한도 위반 망라, HMAC 서명, claude-runner 응답 파싱, circuit-breaker 트리거
- 통합: 페이퍼 모드 1사이클 완주, Claude CLI 모킹, DB 마이그레이션
- 백테스트(v1 후): 과거 OHLCV 7일 구간 시뮬
- 실거래 검증: 페이퍼 1주 → 소액(5만원) 실거래 1주 → 본격

## 10. Git/배포

- GitHub public: `bamin0422/bithumb-claude-trader`
- Conventional Commits, main 브랜치 보호
- `.gitignore`: node_modules, dist, *.db, .env, logs, secrets
- secret scanning + push protection 활성화
- 빌드: electron-builder → macOS DMG (unsigned 시작)
- README: 면책, 빗썸 키 발급 가이드(출금 OFF 필수), Claude CLI 설치, 실행 절차, 트러블슈팅

## 11. 작업 분해 (구현 계획에서 상세화)

1. 모노레포/Vite/Electron 보일러플레이트
2. AI 지침 markdown 작성
3. SQLite 스키마 + 마이그레이션
4. Bithumb 클라이언트 (public + private + 서명)
5. 기술적 지표 라이브러리
6. Fear&Greed / BTC dominance 클라이언트
7. Claude CLI runner + 파서
8. Risk-Guard + Circuit Breaker
9. Trader Orchestrator + Scheduler
10. Executor (실주문 + 페이퍼)
11. IPC bridge (preload)
12. React 대시보드 5개 페이지
13. Settings + keytar
14. 알림 (macOS native + Discord)
15. 자동시작 + 백그라운드
16. 단위/통합 테스트
17. README + 빌드 + GitHub repo 생성/푸시

## 12. 미정 사항 / 결정 필요

이 문서 검토 시 다음을 확정할 것:
- 거래 시작 시 초기 가용 KRW 한도 (전체? 일부?)
- Discord 알림 사용 여부
- 빌드 시 macOS 코드사인 (지금 unsigned 시작 → 추후)
- 백테스트 기능 v1 포함 여부 (제외 권장)

## 13. 면책

⚠️ 본 소프트웨어는 학습/연구 목적. 실거래 손실은 사용자 책임. 빗썸 API 키는 출금 권한 OFF 필수.
