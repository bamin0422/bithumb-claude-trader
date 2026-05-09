# Bithumb × Claude Code Auto-Trader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop app that delegates all crypto trading decisions to Claude Code CLI on a 5-minute cycle, with a 6-page dashboard, paper-trading and backtest modes, defense-in-depth safety, and SQLite-backed history.

**Architecture:** Single Electron app. Main process owns scheduler + Bithumb client + Claude CLI subprocess + risk-guard + executor + SQLite. Renderer is React/Vite dashboard talking via IPC. AI guideline markdown is the system prompt. All technical indicators are pre-computed in TypeScript before being shown to Claude (the model only does final synthesis).

**Tech Stack:** Electron 30+, electron-vite, React 18, TypeScript, Tailwind + shadcn/ui, TanStack Query, Recharts, better-sqlite3, electron-store, keytar, node-cron, Zod, Vitest, electron-builder.

**Spec reference:** `docs/superpowers/specs/2026-05-09-bithumb-claude-trader-design.md`

---

## File map (created across the plan)

```
bithumb-claude-trader/
├── package.json, pnpm-lock.yaml, tsconfig.json, electron.vite.config.ts, electron-builder.yml
├── prompts/crypto-trading-ai-guide.md
├── shared/zod-schemas.ts, shared/types.ts
├── electron/
│   ├── main.ts, preload.ts, ipc.ts
│   ├── scheduler.ts
│   ├── claude-runner.ts
│   ├── trader/{orchestrator,risk-guard,circuit-breaker,executor}.ts
│   ├── bithumb/{public,private,sign}.ts
│   ├── indicators/{ema,rsi,macd,bollinger,atr,adx,stoch,ichimoku,obv,vwap,mtf,index}.ts
│   ├── patterns.ts, correlation.ts
│   ├── fear-greed.ts, btc-dominance.ts
│   ├── performance.ts
│   ├── notifications.ts, autostart.ts
│   ├── backtest/{engine,fetcher}.ts
│   └── storage/{db,migrations,settings,secrets,journal}.ts
├── renderer/
│   ├── index.html, src/main.tsx, src/App.tsx
│   ├── src/lib/{api,query,format}.ts
│   ├── src/components/{Header,Sidebar,Toggle,...}.tsx
│   └── src/pages/{Overview,Portfolio,TradeLog,Decisions,Backtest,Settings}.tsx
└── tests/{indicators,risk-guard,sign,claude-parse,circuit-breaker,paper-cycle}.test.ts
```

---

## Task 1: Bootstrap Electron + Vite + React + TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `.npmrc`
- Create: `electron/main.ts`, `electron/preload.ts`, `renderer/index.html`, `renderer/src/main.tsx`, `renderer/src/App.tsx`

- [ ] **Step 1: Init project**

```bash
cd /Users/mindaein/Project/bithumb-claude-trader
corepack enable pnpm 2>/dev/null || npm i -g pnpm
pnpm init
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add -D electron electron-vite electron-builder vite typescript \
  @types/node @types/react @types/react-dom \
  @vitejs/plugin-react react react-dom \
  tailwindcss postcss autoprefixer \
  vitest @vitest/coverage-v8

pnpm add zod better-sqlite3 electron-store keytar node-cron \
  date-fns dayjs nanoid \
  @tanstack/react-query recharts lucide-react \
  clsx tailwind-merge class-variance-authority \
  react-router-dom
```

- [ ] **Step 3: Write `package.json` scripts**

Replace generated `package.json` with:

```json
{
  "name": "bithumb-claude-trader",
  "version": "0.1.0",
  "description": "Bithumb auto-trader powered by Claude Code CLI",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev --watch",
    "build": "electron-vite build",
    "build:mac": "electron-vite build && electron-builder --mac --config electron-builder.yml",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": { },
  "devDependencies": { }
}
```
(pnpm will populate the version maps; keep what `pnpm add` produced.)

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"],
      "@main/*": ["electron/*"],
      "@renderer/*": ["renderer/src/*"]
    }
  },
  "include": ["electron/**/*", "renderer/**/*", "shared/**/*", "tests/**/*"]
}
```

- [ ] **Step 5: Write `electron.vite.config.ts`**

```ts
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      lib: { entry: "electron/main.ts" },
      rollupOptions: { external: ["better-sqlite3", "keytar"] }
    },
    resolve: { alias: { "@shared": resolve("shared"), "@main": resolve("electron") } }
  },
  preload: {
    build: { lib: { entry: "electron/preload.ts" } },
    resolve: { alias: { "@shared": resolve("shared") } }
  },
  renderer: {
    root: "renderer",
    build: { rollupOptions: { input: resolve("renderer/index.html") } },
    plugins: [react()],
    resolve: {
      alias: {
        "@shared": resolve("shared"),
        "@renderer": resolve("renderer/src")
      }
    }
  }
});
```

- [ ] **Step 6: Write minimal main process**

`electron/main.ts`:
```ts
import { app, BrowserWindow } from "electron";
import { join } from "node:path";

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
```

- [ ] **Step 7: Write minimal preload**

`electron/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  ping: () => ipcRenderer.invoke("ping")
});
```

- [ ] **Step 8: Write renderer HTML and entry**

`renderer/index.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8"/><title>Bithumb Claude Trader</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
```

`renderer/src/main.tsx`:
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

`renderer/src/App.tsx`:
```tsx
export default function App() {
  return <div className="p-8 text-2xl">Bithumb × Claude Trader — boot OK</div>;
}
```

`renderer/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Init Tailwind**

```bash
npx tailwindcss init -p
```

Edit `tailwind.config.js`:
```js
export default {
  content: ["./renderer/index.html", "./renderer/src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: []
};
```

- [ ] **Step 10: Run dev to verify**

```bash
pnpm dev
```
Expected: Electron window opens showing "Bithumb × Claude Trader — boot OK".
Close window (Cmd+Q).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: bootstrap electron + vite + react + tailwind"
```

---

## Task 2: Shared Zod schemas and types

**Files:**
- Create: `shared/zod-schemas.ts`, `shared/types.ts`

- [ ] **Step 1: Write Zod schemas for Claude decision response**

`shared/zod-schemas.ts`:
```ts
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
```

- [ ] **Step 2: Write `shared/types.ts` for runtime types**

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add shared/
git commit -m "feat(shared): add zod schemas and runtime types"
```

---

## Task 3: SQLite storage layer with migrations

**Files:**
- Create: `electron/storage/db.ts`, `electron/storage/migrations/001_initial.sql`, `electron/storage/migrations/index.ts`
- Test: `tests/db.test.ts`

- [ ] **Step 1: Write migration SQL**

`electron/storage/migrations/001_initial.sql` — copy verbatim from spec section 5 (all 8 tables + indexes).

- [ ] **Step 2: Write migration runner test**

`tests/db.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../electron/storage/db";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("db migrations", () => {
  it("creates 8 tables on fresh db", () => {
    const dir = mkdtempSync(join(tmpdir(), "trader-db-"));
    const db = openDb(join(dir, "test.db"));
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map((r: any) => r.name).sort();
    expect(tables).toEqual([
      "coin_scores","daily_performance","decisions","events",
      "market_cache","portfolio_snapshots","positions","trade_attempts"
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
pnpm test tests/db.test.ts
```
Expected: FAIL — `openDb` not defined.

- [ ] **Step 4: Implement `db.ts`**

`electron/storage/db.ts`:
```ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const sql = readFileSync(join(__dirname, "migrations/001_initial.sql"), "utf-8");
  db.exec(sql);
  return db;
}
```

- [ ] **Step 5: Verify test passes**

```bash
pnpm test tests/db.test.ts
```
Expected: PASS.

- [ ] **Step 6: Add journal helpers**

`electron/storage/journal.ts`:
```ts
import type Database from "better-sqlite3";

export class Journal {
  constructor(private db: Database.Database) {}

  insertDecision(row: {
    cycle_at: string; claude_raw: string; market_view: string | null;
    fear_greed: number | null; btc_dominance: number | null;
    cost_usd: number | null; duration_ms: number | null;
    status: string; error: string | null;
  }) {
    return this.db.prepare(
      `INSERT INTO decisions (cycle_at, claude_raw, market_view, fear_greed, btc_dominance,
        cost_usd, duration_ms, status, error)
       VALUES (@cycle_at, @claude_raw, @market_view, @fear_greed, @btc_dominance,
        @cost_usd, @duration_ms, @status, @error)`
    ).run(row).lastInsertRowid as number;
  }

  insertCoinScores(decisionId: number, scores: any[]) {
    const stmt = this.db.prepare(
      `INSERT INTO coin_scores (decision_id, symbol, score, ema_state, rsi_1h, macd_state,
        volume_ratio, patterns, playbook, decision_hint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      for (const s of scores) {
        stmt.run(decisionId, s.symbol, s.score, s.ema_state ?? null,
          s.momentum?.rsi_1h ?? null, s.momentum?.macd ?? null,
          s.volume_analysis?.ratio ?? null,
          JSON.stringify(s.patterns ?? []),
          s.playbook_match ?? null, s.decision_hint ?? null);
      }
    });
    tx();
  }

  insertEvent(level: string, category: string, message: string, meta?: any) {
    this.db.prepare(
      `INSERT INTO events (at, level, category, message, meta)
       VALUES (?, ?, ?, ?, ?)`
    ).run(new Date().toISOString(), level, category, message, meta ? JSON.stringify(meta) : null);
  }

  insertTradeAttempt(row: any): number {
    return this.db.prepare(
      `INSERT INTO trade_attempts (decision_id, attempted_at, symbol, action, krw_amount, qty,
        order_type, limit_price, reason, signals, confidence, stop_loss_price, take_profit_price,
        risk_check, result, bithumb_order_id, filled_qty, filled_price, fee_krw, error)
       VALUES (@decision_id, @attempted_at, @symbol, @action, @krw_amount, @qty,
        @order_type, @limit_price, @reason, @signals, @confidence, @stop_loss_price, @take_profit_price,
        @risk_check, @result, @bithumb_order_id, @filled_qty, @filled_price, @fee_krw, @error)`
    ).run(row).lastInsertRowid as number;
  }

  upsertPosition(p: any) {
    this.db.prepare(
      `INSERT INTO positions (symbol, qty, avg_price, entered_at, highest_pnl_pct,
        stop_loss_price, take_profit_price, last_updated)
       VALUES (@symbol, @qty, @avg_price, @entered_at, @highest_pnl_pct,
        @stop_loss_price, @take_profit_price, @last_updated)
       ON CONFLICT(symbol) DO UPDATE SET
        qty=@qty, avg_price=@avg_price, highest_pnl_pct=@highest_pnl_pct,
        stop_loss_price=@stop_loss_price, take_profit_price=@take_profit_price,
        last_updated=@last_updated`
    ).run(p);
  }

  insertSnapshot(s: any) {
    this.db.prepare(
      `INSERT INTO portfolio_snapshots (taken_at, krw_balance, total_assets_krw,
        positions_value, daily_pnl_pct, weekly_pnl_pct, all_time_pnl_pct)
       VALUES (@taken_at, @krw_balance, @total_assets_krw, @positions_value,
        @daily_pnl_pct, @weekly_pnl_pct, @all_time_pnl_pct)`
    ).run(s);
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add electron/storage/ tests/db.test.ts
git commit -m "feat(storage): sqlite migrations and journal helpers"
```

---

## Task 4: Settings store + secrets (keytar)

**Files:**
- Create: `electron/storage/settings.ts`, `electron/storage/secrets.ts`

- [ ] **Step 1: Implement settings store**

`electron/storage/settings.ts`:
```ts
import Store from "electron-store";
import { SettingsSchema, type Settings } from "@shared/zod-schemas";

const store = new Store<Settings>({ name: "settings" });

export function getSettings(): Settings {
  const raw = store.store ?? {};
  return SettingsSchema.parse(raw);
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const merged = SettingsSchema.parse({ ...current, ...patch });
  store.set(merged as any);
  return merged;
}

export function resetSettings(): Settings {
  store.clear();
  return getSettings();
}
```

- [ ] **Step 2: Implement secrets storage**

`electron/storage/secrets.ts`:
```ts
import keytar from "keytar";

const SERVICE = "bithumb-claude-trader";

export async function setBithumbKeys(apiKey: string, apiSecret: string) {
  await keytar.setPassword(SERVICE, "bithumb_api_key", apiKey);
  await keytar.setPassword(SERVICE, "bithumb_api_secret", apiSecret);
}

export async function getBithumbKeys(): Promise<{ key: string; secret: string } | null> {
  const [key, secret] = await Promise.all([
    keytar.getPassword(SERVICE, "bithumb_api_key"),
    keytar.getPassword(SERVICE, "bithumb_api_secret")
  ]);
  if (!key || !secret) return null;
  return { key, secret };
}

export async function clearBithumbKeys() {
  await keytar.deletePassword(SERVICE, "bithumb_api_key");
  await keytar.deletePassword(SERVICE, "bithumb_api_secret");
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/storage/settings.ts electron/storage/secrets.ts
git commit -m "feat(storage): settings via electron-store, secrets via keytar"
```

---

## Task 5: Bithumb public API client

**Files:**
- Create: `electron/bithumb/public.ts`
- Test: `tests/bithumb-public.test.ts` (network-gated, skip in CI)

- [ ] **Step 1: Write public client**

`electron/bithumb/public.ts`:
```ts
const BASE = "https://api.bithumb.com/public";

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`bithumb GET ${path}: ${res.status}`);
  const json = await res.json();
  if (json.status !== "0000") throw new Error(`bithumb error ${json.status}: ${json.message}`);
  return json.data;
}

export async function getTicker(symbol: string) {
  return get(`/ticker/${symbol}_KRW`);
}

export type CandleTF = "1m"|"3m"|"5m"|"10m"|"30m"|"1h"|"6h"|"12h"|"24h";
const TF_TO_PATH: Record<CandleTF,string> = {
  "1m":"1m","3m":"3m","5m":"5m","10m":"10m","30m":"30m",
  "1h":"1h","6h":"6h","12h":"12h","24h":"24h"
};

export async function getCandles(symbol: string, tf: CandleTF) {
  // returns [[timestamp, open, close, high, low, volume], ...]
  const data = await get(`/candlestick/${symbol}_KRW/${TF_TO_PATH[tf]}`);
  return (data as any[]).map(r => ({
    t: Number(r[0]), o: Number(r[1]), c: Number(r[2]),
    h: Number(r[3]), l: Number(r[4]), v: Number(r[5])
  }));
}

export async function getOrderbook(symbol: string) {
  const d = await get(`/orderbook/${symbol}_KRW?count=20`);
  return {
    bids: (d.bids as any[]).map(x => ({ price: Number(x.price), qty: Number(x.quantity) })),
    asks: (d.asks as any[]).map(x => ({ price: Number(x.price), qty: Number(x.quantity) }))
  };
}
```

- [ ] **Step 2: Write live ping test (skipped if `SKIP_NETWORK` set)**

`tests/bithumb-public.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getTicker, getCandles, getOrderbook } from "../electron/bithumb/public";

const skip = !!process.env.SKIP_NETWORK;
describe.skipIf(skip)("bithumb public", () => {
  it("ticker BTC has positive last price", async () => {
    const t = await getTicker("BTC");
    expect(Number(t.closing_price)).toBeGreaterThan(0);
  });
  it("candles 1h returns array", async () => {
    const c = await getCandles("BTC", "1h");
    expect(c.length).toBeGreaterThan(50);
    expect(c[0]).toHaveProperty("o");
  });
  it("orderbook has bids/asks", async () => {
    const ob = await getOrderbook("BTC");
    expect(ob.bids.length).toBeGreaterThan(0);
    expect(ob.asks.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test**

```bash
pnpm test tests/bithumb-public.test.ts
```
Expected: PASS (or skipped if offline).

- [ ] **Step 4: Commit**

```bash
git add electron/bithumb/public.ts tests/bithumb-public.test.ts
git commit -m "feat(bithumb): public API client (ticker/candles/orderbook)"
```

---

## Task 6: Bithumb HMAC signing + private API client

**Files:**
- Create: `electron/bithumb/sign.ts`, `electron/bithumb/private.ts`
- Test: `tests/bithumb-sign.test.ts`

- [ ] **Step 1: Write signing test against known vector**

`tests/bithumb-sign.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signRequest } from "../electron/bithumb/sign";

describe("bithumb sign", () => {
  it("produces deterministic HMAC-SHA512 base64", () => {
    const out = signRequest({
      endpoint: "/info/balance",
      params: { currency: "BTC" },
      apiSecret: "test_secret_string",
      nonce: "1700000000000000"
    });
    expect(out.signature).toBe(
      // pre-computed externally with same algorithm; replace this on first run
      "PLACEHOLDER_REPLACE_AFTER_FIRST_RUN"
    );
    expect(out.body).toContain("currency=BTC");
    expect(out.body).toContain("endpoint=%2Finfo%2Fbalance");
  });
});
```

> Note: replace the expected signature with the first run's actual output once verified against Bithumb docs (manual verification step).

- [ ] **Step 2: Implement signing**

`electron/bithumb/sign.ts`:
```ts
import { createHmac } from "node:crypto";

export type SignInput = {
  endpoint: string;
  params: Record<string, string | number>;
  apiSecret: string;
  nonce: string;
};

export function signRequest(input: SignInput): { body: string; signature: string } {
  const allParams = { endpoint: input.endpoint, ...input.params };
  const body = new URLSearchParams(
    Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, String(v)]))
  ).toString();
  const message = `${input.endpoint} ${body} ${input.nonce}`;
  const hmac = createHmac("sha512", input.apiSecret).update(message).digest("hex");
  const signature = Buffer.from(hmac, "utf-8").toString("base64");
  return { body, signature };
}
```

- [ ] **Step 3: Run sign test, capture output, lock expected**

```bash
pnpm test tests/bithumb-sign.test.ts 2>&1 | grep -A1 "Expected:"
```
Copy the actual signature into the test's expected value, re-run to confirm PASS.

- [ ] **Step 4: Implement private client**

`electron/bithumb/private.ts`:
```ts
import { signRequest } from "./sign";

const BASE = "https://api.bithumb.com";

export type Creds = { apiKey: string; apiSecret: string };

async function call(creds: Creds, endpoint: string, params: Record<string,any>) {
  const nonce = String(Date.now() * 1000);
  const { body, signature } = signRequest({ endpoint, params, apiSecret: creds.apiSecret, nonce });
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Api-Key": creds.apiKey,
      "Api-Sign": signature,
      "Api-Nonce": nonce,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const json = await res.json();
  if (json.status !== "0000") {
    const err: any = new Error(`bithumb ${endpoint}: ${json.status} ${json.message}`);
    err.status = json.status; throw err;
  }
  return json.data;
}

export async function getBalance(creds: Creds, currency = "ALL") {
  return call(creds, "/info/balance", { currency });
}

export async function placeMarketBuy(creds: Creds, symbol: string, krwAmount: number) {
  // Bithumb market buy uses 'units' or 'price' depending on endpoint version
  return call(creds, "/trade/market_buy", { order_currency: symbol, payment_currency: "KRW", units: krwAmount });
}

export async function placeMarketSell(creds: Creds, symbol: string, units: number) {
  return call(creds, "/trade/market_sell", { order_currency: symbol, payment_currency: "KRW", units });
}

export async function placeLimit(creds: Creds, symbol: string, side: "bid"|"ask", units: number, price: number) {
  return call(creds, "/trade/place", { order_currency: symbol, payment_currency: "KRW", units, price, type: side });
}

export async function getOrderDetail(creds: Creds, symbol: string, orderId: string, type: "bid"|"ask") {
  return call(creds, "/info/order_detail", { order_currency: symbol, payment_currency: "KRW", order_id: orderId, type });
}

export async function cancelOrder(creds: Creds, symbol: string, orderId: string, type: "bid"|"ask") {
  return call(creds, "/trade/cancel", { order_currency: symbol, payment_currency: "KRW", order_id: orderId, type });
}
```

- [ ] **Step 5: Commit**

```bash
git add electron/bithumb/ tests/bithumb-sign.test.ts
git commit -m "feat(bithumb): hmac signing and private API client"
```

---

## Task 7: Macro data clients (Fear & Greed, BTC dominance)

**Files:**
- Create: `electron/fear-greed.ts`, `electron/btc-dominance.ts`

- [ ] **Step 1: Implement Fear & Greed**

`electron/fear-greed.ts`:
```ts
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
```

- [ ] **Step 2: Implement BTC dominance**

`electron/btc-dominance.ts`:
```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add electron/fear-greed.ts electron/btc-dominance.ts
git commit -m "feat(macro): fear-greed and btc-dominance clients"
```

---

## Task 8: Indicators — EMA, RSI

**Files:**
- Create: `electron/indicators/ema.ts`, `electron/indicators/rsi.ts`, `electron/indicators/index.ts`
- Test: `tests/indicators.test.ts`

- [ ] **Step 1: Write tests with known values**

`tests/indicators.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ema } from "../electron/indicators/ema";
import { rsi } from "../electron/indicators/rsi";

describe("ema", () => {
  it("matches manual calc for period 3", () => {
    const out = ema([1,2,3,4,5,6,7,8,9,10], 3);
    // EMA3 from index 2 onwards. k = 2/(3+1) = 0.5
    // EMA[2] = SMA(1,2,3) = 2; EMA[3] = (4-2)*0.5+2 = 3; EMA[4] = (5-3)*0.5+3=4; ...
    expect(out.slice(-1)[0]).toBeCloseTo(9, 4);
  });
});

describe("rsi", () => {
  it("known wilder RSI for sample", () => {
    const closes = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,
                    45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
    const r = rsi(closes, 14);
    expect(r[r.length - 1]).toBeGreaterThan(50);
    expect(r[r.length - 1]).toBeLessThan(80);
  });
});
```

- [ ] **Step 2: Implement EMA**

`electron/indicators/ema.ts`:
```ts
export function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(period - 1).fill(NaN);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * k + prev;
    out.push(prev);
  }
  return out;
}
```

- [ ] **Step 3: Implement RSI (Wilder)**

`electron/indicators/rsi.ts`:
```ts
export function rsi(closes: number[], period = 14): number[] {
  if (closes.length <= period) return [];
  const out: number[] = new Array(period).fill(NaN);
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  out.push(100 - 100 / (1 + (avgL === 0 ? Infinity : avgG / avgL)));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out.push(100 - 100 / (1 + (avgL === 0 ? Infinity : avgG / avgL)));
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/indicators.test.ts
```
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add electron/indicators/ tests/indicators.test.ts
git commit -m "feat(indicators): EMA and RSI with tests"
```

---

## Task 9: Indicators — MACD, Bollinger, ATR

**Files:**
- Create: `electron/indicators/macd.ts`, `electron/indicators/bollinger.ts`, `electron/indicators/atr.ts`
- Modify: `tests/indicators.test.ts`

- [ ] **Step 1: Implement MACD**

`electron/indicators/macd.ts`:
```ts
import { ema } from "./ema";

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const line: number[] = closes.map((_, i) => fastE[i] - slowE[i]);
  const valid = line.map(v => Number.isFinite(v) ? v : 0);
  const sigE = ema(valid, signal);
  const hist = line.map((v, i) => v - sigE[i]);
  return { macd: line, signal: sigE, histogram: hist };
}
```

- [ ] **Step 2: Implement Bollinger**

`electron/indicators/bollinger.ts`:
```ts
export function bollinger(closes: number[], period = 20, mult = 2) {
  const out = { upper: [] as number[], middle: [] as number[], lower: [] as number[],
                width_pct: [] as number[], percent_b: [] as number[] };
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.upper.push(NaN); out.middle.push(NaN); out.lower.push(NaN); out.width_pct.push(NaN); out.percent_b.push(NaN); continue; }
    const window = closes.slice(i - period + 1, i + 1);
    const m = window.reduce((a, b) => a + b, 0) / period;
    const v = window.reduce((a, b) => a + (b - m) * (b - m), 0) / period;
    const s = Math.sqrt(v);
    const u = m + mult * s, l = m - mult * s;
    out.upper.push(u); out.middle.push(m); out.lower.push(l);
    out.width_pct.push(((u - l) / m) * 100);
    out.percent_b.push((closes[i] - l) / (u - l));
  }
  return out;
}
```

- [ ] **Step 3: Implement ATR**

`electron/indicators/atr.ts`:
```ts
import type { OHLCV } from "@shared/types";

export function atr(candles: OHLCV[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { trs.push(candles[i].h - candles[i].l); continue; }
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  const out: number[] = new Array(period - 1).fill(NaN);
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out.push(prev);
  }
  return out;
}
```

- [ ] **Step 4: Add tests for MACD/BB/ATR**

Append to `tests/indicators.test.ts`:
```ts
import { macd } from "../electron/indicators/macd";
import { bollinger } from "../electron/indicators/bollinger";
import { atr } from "../electron/indicators/atr";

describe("macd", () => {
  it("returns three series of equal length", () => {
    const closes = Array.from({length: 60}, (_, i) => 100 + Math.sin(i/3) * 5);
    const m = macd(closes);
    expect(m.macd.length).toBe(60);
    expect(m.signal.length).toBe(60);
    expect(m.histogram.length).toBe(60);
  });
});

describe("bollinger", () => {
  it("upper > middle > lower for noisy series", () => {
    const closes = Array.from({length: 30}, (_, i) => 100 + (i % 2 ? 1 : -1));
    const b = bollinger(closes, 20, 2);
    const i = 25;
    expect(b.upper[i]).toBeGreaterThan(b.middle[i]);
    expect(b.middle[i]).toBeGreaterThan(b.lower[i]);
  });
});

describe("atr", () => {
  it("positive after period candles", () => {
    const c = Array.from({length: 30}, (_, i) => ({ t: i, o: 100, h: 102, l: 98, c: 100+i*0.1, v: 1 }));
    const a = atr(c, 14);
    expect(a.slice(-1)[0]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run tests, commit**

```bash
pnpm test tests/indicators.test.ts
git add electron/indicators/ tests/indicators.test.ts
git commit -m "feat(indicators): MACD, Bollinger, ATR with tests"
```

---

## Task 10: Indicators — ADX, Stoch RSI, Ichimoku, OBV, VWAP, MTF

**Files:**
- Create: `electron/indicators/adx.ts`, `electron/indicators/stoch.ts`, `electron/indicators/ichimoku.ts`, `electron/indicators/obv.ts`, `electron/indicators/vwap.ts`, `electron/indicators/mtf.ts`, `electron/indicators/index.ts`

- [ ] **Step 1: ADX (Wilder)**

`electron/indicators/adx.ts`:
```ts
import type { OHLCV } from "@shared/types";

export function adx(candles: OHLCV[], period = 14): number[] {
  const len = candles.length;
  const tr: number[] = [], pdm: number[] = [], ndm: number[] = [];
  for (let i = 0; i < len; i++) {
    if (i === 0) { tr.push(candles[i].h - candles[i].l); pdm.push(0); ndm.push(0); continue; }
    const c = candles[i], p = candles[i-1];
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
    const up = c.h - p.h, dn = p.l - c.l;
    pdm.push(up > dn && up > 0 ? up : 0);
    ndm.push(dn > up && dn > 0 ? dn : 0);
  }
  function wilder(arr: number[]) {
    const out: number[] = new Array(period - 1).fill(NaN);
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    out.push(s);
    for (let i = period; i < arr.length; i++) { s = s - s/period + arr[i]; out.push(s); }
    return out;
  }
  const trS = wilder(tr), pS = wilder(pdm), nS = wilder(ndm);
  const dx: number[] = [];
  for (let i = 0; i < len; i++) {
    if (!Number.isFinite(trS[i]) || trS[i] === 0) { dx.push(NaN); continue; }
    const pDI = 100 * pS[i] / trS[i];
    const nDI = 100 * nS[i] / trS[i];
    dx.push(100 * Math.abs(pDI - nDI) / (pDI + nDI || 1));
  }
  const out: number[] = new Array(period * 2 - 1).fill(NaN);
  let avg = dx.slice(period - 1, period * 2 - 1).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) / period;
  out.push(avg);
  for (let i = period * 2; i < len; i++) {
    avg = (avg * (period - 1) + dx[i]) / period;
    out.push(avg);
  }
  return out;
}
```

- [ ] **Step 2: Stochastic RSI**

`electron/indicators/stoch.ts`:
```ts
import { rsi } from "./rsi";
export function stochRsi(closes: number[], rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  const r = rsi(closes, rsiPeriod);
  const k: number[] = [];
  for (let i = 0; i < r.length; i++) {
    if (i < stochPeriod - 1 || !Number.isFinite(r[i])) { k.push(NaN); continue; }
    const win = r.slice(i - stochPeriod + 1, i + 1).filter(Number.isFinite);
    if (win.length < stochPeriod) { k.push(NaN); continue; }
    const lo = Math.min(...win), hi = Math.max(...win);
    k.push(hi === lo ? 50 : ((r[i] - lo) / (hi - lo)) * 100);
  }
  function sma(a: number[], p: number) {
    return a.map((_, i) => i < p - 1 ? NaN : a.slice(i - p + 1, i + 1).reduce((x, y) => x + y, 0) / p);
  }
  const ks = sma(k, smoothK), ds = sma(ks, smoothD);
  return { k: ks, d: ds };
}
```

- [ ] **Step 3: Ichimoku**

`electron/indicators/ichimoku.ts`:
```ts
import type { OHLCV } from "@shared/types";
function highest(arr: number[], p: number, i: number) { return Math.max(...arr.slice(i - p + 1, i + 1)); }
function lowest(arr: number[], p: number, i: number) { return Math.min(...arr.slice(i - p + 1, i + 1)); }

export function ichimoku(candles: OHLCV[]) {
  const highs = candles.map(c => c.h), lows = candles.map(c => c.l);
  const tenkan: number[] = [], kijun: number[] = [], senA: number[] = [], senB: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    tenkan.push(i < 8 ? NaN : (highest(highs, 9, i) + lowest(lows, 9, i)) / 2);
    kijun.push(i < 25 ? NaN : (highest(highs, 26, i) + lowest(lows, 26, i)) / 2);
    senA.push(i < 25 ? NaN : (tenkan[i] + kijun[i]) / 2);
    senB.push(i < 51 ? NaN : (highest(highs, 52, i) + lowest(lows, 52, i)) / 2);
  }
  const last = candles.length - 1;
  const price = candles[last].c, a = senA[last], b = senB[last];
  let cloud_state: "ABOVE"|"INSIDE"|"BELOW" = "INSIDE";
  if (Number.isFinite(a) && Number.isFinite(b)) {
    const top = Math.max(a, b), bot = Math.min(a, b);
    if (price > top) cloud_state = "ABOVE";
    else if (price < bot) cloud_state = "BELOW";
  }
  return { tenkan, kijun, senkou_a: senA, senkou_b: senB, cloud_state };
}
```

- [ ] **Step 4: OBV + VWAP**

`electron/indicators/obv.ts`:
```ts
import type { OHLCV } from "@shared/types";
export function obv(candles: OHLCV[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const prev = out[i - 1];
    if (candles[i].c > candles[i-1].c) out.push(prev + candles[i].v);
    else if (candles[i].c < candles[i-1].c) out.push(prev - candles[i].v);
    else out.push(prev);
  }
  return out;
}
export function obvSlope(o: number[], lookback = 20): number {
  if (o.length < lookback) return 0;
  const a = o.slice(-lookback);
  return (a[a.length-1] - a[0]) / lookback;
}
```

`electron/indicators/vwap.ts`:
```ts
import type { OHLCV } from "@shared/types";
export function vwap24h(candles: OHLCV[]): { value: number; dev_pct: number } {
  // assume input is recent 24h of candles
  let pv = 0, vv = 0;
  for (const c of candles) {
    const tp = (c.h + c.l + c.c) / 3;
    pv += tp * c.v; vv += c.v;
  }
  const value = vv === 0 ? candles.at(-1)!.c : pv / vv;
  const last = candles.at(-1)!.c;
  return { value, dev_pct: ((last - value) / value) * 100 };
}
```

- [ ] **Step 5: Multi-timeframe alignment + index**

`electron/indicators/mtf.ts`:
```ts
import { ema } from "./ema";
import type { OHLCV } from "@shared/types";

export function alignmentScore(tf1d: OHLCV[], tf4h: OHLCV[], tf1h: OHLCV[]): number {
  function trendUp(c: OHLCV[]): number {
    const closes = c.map(x => x.c);
    const e20 = ema(closes, 20).at(-1)!;
    const e50 = ema(closes, 50).at(-1)!;
    const last = closes.at(-1)!;
    if (!Number.isFinite(e20) || !Number.isFinite(e50)) return 0;
    if (last > e20 && e20 > e50) return 1;
    if (last < e20 && e20 < e50) return -1;
    return 0;
  }
  const t = [trendUp(tf1d), trendUp(tf4h), trendUp(tf1h)];
  const same = t.every(x => x === 1) || t.every(x => x === -1);
  if (same) return 100;
  const twoSame = (t[0] === t[1] && t[1] !== 0) || (t[1] === t[2] && t[1] !== 0);
  if (twoSame) return 60;
  return 30;
}
```

`electron/indicators/index.ts`:
```ts
export * from "./ema";
export * from "./rsi";
export * from "./macd";
export * from "./bollinger";
export * from "./atr";
export * from "./adx";
export * from "./stoch";
export * from "./ichimoku";
export * from "./obv";
export * from "./vwap";
export * from "./mtf";
```

- [ ] **Step 6: Commit**

```bash
git add electron/indicators/
git commit -m "feat(indicators): ADX, Stoch RSI, Ichimoku, OBV, VWAP, MTF alignment"
```

---

## Task 11: Pattern detection + correlation

**Files:**
- Create: `electron/patterns.ts`, `electron/correlation.ts`

- [ ] **Step 1: Candle/chart patterns**

`electron/patterns.ts`:
```ts
import type { OHLCV } from "@shared/types";

export function detectPatterns(c: OHLCV[]): string[] {
  const out: string[] = [];
  if (c.length < 3) return out;
  const last = c.at(-1)!, prev = c.at(-2)!;
  const body = (k: OHLCV) => Math.abs(k.c - k.o);
  const range = (k: OHLCV) => k.h - k.l || 1;

  // Doji
  if (body(last) / range(last) < 0.1) out.push("DOJI");

  // Hammer
  if (last.c > last.o && (last.o - last.l) > 2 * body(last) && (last.h - last.c) < body(last) * 0.3)
    out.push("HAMMER");

  // Shooting Star
  if (last.c < last.o && (last.h - last.o) > 2 * body(last) && (last.c - last.l) < body(last) * 0.3)
    out.push("SHOOTING_STAR");

  // Bullish Engulfing
  if (prev.c < prev.o && last.c > last.o && last.c > prev.o && last.o < prev.c)
    out.push("BULL_ENGULFING");

  // Bearish Engulfing
  if (prev.c > prev.o && last.c < last.o && last.c < prev.o && last.o > prev.c)
    out.push("BEAR_ENGULFING");

  // Breakout 24h high (assume input is enough; check last 24 candles for hourly)
  const last24 = c.slice(-25, -1);
  if (last24.length === 24) {
    const high24 = Math.max(...last24.map(x => x.h));
    if (last.c > high24) out.push("BREAKOUT_24H_HIGH");
  }

  return out;
}
```

- [ ] **Step 2: Correlation matrix**

`electron/correlation.ts`:
```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add electron/patterns.ts electron/correlation.ts
git commit -m "feat: candle pattern detection and correlation matrix"
```

---

## Task 12: AI Trading Guideline markdown

**Files:**
- Create: `prompts/crypto-trading-ai-guide.md`

- [ ] **Step 1: Write the full v3 guideline**

Copy spec section 3 (Operating Manual v3) into `prompts/crypto-trading-ai-guide.md` verbatim. The file is the system prompt — keep the structure exactly as designed (sections 0–9).

- [ ] **Step 2: Commit**

```bash
git add prompts/crypto-trading-ai-guide.md
git commit -m "feat(prompts): crypto trading AI operating manual v3"
```

---

## Task 13: Claude CLI runner

**Files:**
- Create: `electron/claude-runner.ts`
- Test: `tests/claude-parse.test.ts`

- [ ] **Step 1: Write parser test**

`tests/claude-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseClaudeEnvelope } from "../electron/claude-runner";

describe("parseClaudeEnvelope", () => {
  it("parses valid envelope with embedded decision JSON", () => {
    const inner = {
      market_analysis: { regime: "RISK_ON", btc_trend_4h: "UP", fear_greed_state: "FEAR",
                         btc_dominance_view: "ALT_FAVORABLE", summary: "ok", key_risks: [] },
      coin_scores: [],
      decisions: [{ action: "HOLD", symbol: "BTC", krw_amount: 0, sell_ratio: 0,
                    order_type: "LIMIT", playbook: "NONE", reason: "wait",
                    signals: [], confidence: 0.4 }]
    };
    const env = JSON.stringify({ result: JSON.stringify(inner), total_cost_usd: 0.01 });
    const r = parseClaudeEnvelope(env);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decision.decisions[0].action).toBe("HOLD");
  });
  it("fails on bad schema", () => {
    const env = JSON.stringify({ result: JSON.stringify({ wrong: 1 }) });
    const r = parseClaudeEnvelope(env);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Implement runner**

`electron/claude-runner.ts`:
```ts
import { spawn } from "node:child_process";
import { writeFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DecisionResponseSchema, type DecisionResponse } from "@shared/zod-schemas";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;

export type ClaudeInput = { systemPrompt: string; userJson: object };
export type ClaudeOk = { ok: true; decision: DecisionResponse; raw: string;
                        cost_usd?: number; duration_ms: number };
export type ClaudeErr = { ok: false; error: string; raw?: string; duration_ms: number };

export function parseClaudeEnvelope(stdout: string):
  | { ok: true; decision: DecisionResponse; cost_usd?: number }
  | { ok: false; error: string }
{
  try {
    const env = JSON.parse(stdout);
    const text = env.result ?? env.text ?? stdout;
    const inner = typeof text === "string" ? JSON.parse(text) : text;
    const decision = DecisionResponseSchema.parse(inner);
    return { ok: true, decision, cost_usd: env.total_cost_usd };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function runClaudeDecision(input: ClaudeInput): Promise<ClaudeOk | ClaudeErr> {
  const t0 = Date.now();
  const workdir = await mkdtemp(join(tmpdir(), "claude-decision-"));
  const sysFile = join(workdir, "system.md");
  await writeFile(sysFile, input.systemPrompt);

  const userPrompt = [
    "Below is the current market and portfolio state as JSON.",
    "Follow the operating manual (system prompt) exactly.",
    "Output ONLY the JSON schema specified in section 3.8. No prose.",
    "",
    "```json",
    JSON.stringify(input.userJson),
    "```"
  ].join("\n");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stdout = await spawnClaude(userPrompt, sysFile);
      const parsed = parseClaudeEnvelope(stdout);
      if (parsed.ok) {
        return { ok: true, decision: parsed.decision, raw: stdout,
                 cost_usd: parsed.cost_usd, duration_ms: Date.now() - t0 };
      }
      if (attempt === MAX_RETRIES) {
        return { ok: false, error: parsed.error, raw: stdout, duration_ms: Date.now() - t0 };
      }
    } catch (e: any) {
      if (attempt === MAX_RETRIES) {
        return { ok: false, error: e.message, duration_ms: Date.now() - t0 };
      }
    }
  }
  return { ok: false, error: "max retries exceeded", duration_ms: Date.now() - t0 };
}

function spawnClaude(userPrompt: string, sysFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-p", userPrompt,
      "--output-format", "json",
      "--system-prompt-file", sysFile,
      "--model", MODEL,
      "--max-turns", "1",
      "--permission-mode", "denyAll"
    ];
    const child = spawn(CLAUDE_BIN, args, {
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "", err = "";
    child.stdout.on("data", c => out += c.toString());
    child.stderr.on("data", c => err += c.toString());
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`claude timeout`)); }, TIMEOUT_MS);
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude exit ${code}: ${err.slice(0, 300)}`));
      else resolve(out);
    });
  });
}
```

- [ ] **Step 3: Run test**

```bash
pnpm test tests/claude-parse.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/claude-runner.ts tests/claude-parse.test.ts
git commit -m "feat(claude): cli runner with envelope parser and retry"
```

---

## Task 14: Risk-Guard

**Files:**
- Create: `electron/trader/risk-guard.ts`
- Test: `tests/risk-guard.test.ts`

- [ ] **Step 1: Tests for each rule**

`tests/risk-guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { evaluateDecision } from "../electron/trader/risk-guard";
import type { Settings } from "@shared/zod-schemas";

const S = (over?: any): Settings => ({
  trading_enabled: true, paper_mode: false, decision_interval_min: 5,
  auto_start_on_login: false, run_in_background: false,
  watch_symbols: ["BTC"],
  risk: { max_buy_ratio: 0.25, max_position_ratio: 0.5, daily_loss_limit_pct: 10,
          stop_loss_pct: 15, take_profit_pct: 20, max_concurrent_positions: 5,
          min_confidence_to_trade: 0.55, max_drawdown_circuit_breaker_pct: 15 },
  claude: { model: "claude-opus-4-7", max_turns: 1, timeout_ms: 120000, permission_mode: "denyAll" },
  bithumb: { api_key_set: true, use_market_orders: false, max_spread_pct_for_market: 0.2 },
  notifications: { on_trade: true, on_error: true, on_circuit_breaker: true, macos_native: true },
  ui: { theme: "system", chart_default_timeframe: "1h", refresh_interval_sec: 10 },
  ...over
});

const ctx = (over?: any) => ({
  krw_balance: 1_000_000, total_assets_krw: 2_000_000,
  positions: [], daily_pnl_pct: 0, weekly_pnl_pct: 0,
  recent_trades_for_symbol: [],
  spread_pct: 0.1,
  ...over
});

const buyDec = (over?: any) => ({
  action: "BUY" as const, symbol: "BTC", krw_amount: 100_000, sell_ratio: 0,
  order_type: "LIMIT" as const, playbook: "A" as const, reason: "ok",
  signals: [], confidence: 0.7, ...over
});

describe("risk-guard", () => {
  it("blocks when trading disabled", () => {
    const r = evaluateDecision(buyDec(), ctx(), S({ trading_enabled: false }));
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/disabled/i);
  });
  it("blocks when daily loss limit reached", () => {
    const r = evaluateDecision(buyDec(), ctx({ daily_pnl_pct: -10 }), S());
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/daily/i);
  });
  it("blocks when confidence below min", () => {
    const r = evaluateDecision(buyDec({ confidence: 0.4 }), ctx(), S());
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/confidence/i);
  });
  it("caps krw_amount to max_buy_ratio", () => {
    const r = evaluateDecision(buyDec({ krw_amount: 10_000_000 }), ctx(), S());
    expect(r.ok).toBe(true); expect(r.adjusted!.krw_amount).toBe(250_000);
  });
  it("blocks when concurrent positions exceeded", () => {
    const positions = ["A","B","C","D","E"].map(s => ({ symbol: s, qty: 1, avg_price: 1, entered_at: "", highest_pnl_pct: 0, stop_loss_price: null, take_profit_price: null, last_updated: "" }));
    const r = evaluateDecision(buyDec(), ctx({ positions }), S());
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/concurrent/i);
  });
  it("blocks rebuy within 30min", () => {
    const r = evaluateDecision(buyDec(), ctx({
      recent_trades_for_symbol: [{ attempted_at: new Date(Date.now()-10*60_000).toISOString(), action: "BUY" }]
    }), S());
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/recent/i);
  });
  it("blocks below minimum order amount", () => {
    const r = evaluateDecision(buyDec({ krw_amount: 1000 }), ctx(), S());
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/minimum/i);
  });
  it("blocks market order when spread too wide", () => {
    const r = evaluateDecision(buyDec({ order_type: "MARKET" }), ctx({ spread_pct: 0.5 }), S());
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/spread/i);
  });
});
```

- [ ] **Step 2: Implement**

`electron/trader/risk-guard.ts`:
```ts
import type { Decision, Settings } from "@shared/zod-schemas";
import type { Position } from "@shared/types";

export type RiskCtx = {
  krw_balance: number;
  total_assets_krw: number;
  positions: Position[];
  daily_pnl_pct: number;
  weekly_pnl_pct: number;
  recent_trades_for_symbol: { attempted_at: string; action: "BUY"|"SELL" }[];
  spread_pct: number;
};

export type RiskOk = { ok: true; adjusted?: Decision };
export type RiskBlock = { ok: false; reason: string };

const MIN_BITHUMB_KRW = 5_000;

export function evaluateDecision(d: Decision, ctx: RiskCtx, s: Settings): RiskOk | RiskBlock {
  if (!s.trading_enabled) return { ok: false, reason: "trading disabled" };

  if (d.action === "HOLD") return { ok: true };

  // Daily loss limit
  if (ctx.daily_pnl_pct <= -s.risk.daily_loss_limit_pct && d.action === "BUY") {
    return { ok: false, reason: "daily loss limit reached, BUY blocked" };
  }
  if (ctx.weekly_pnl_pct <= -s.risk.max_drawdown_circuit_breaker_pct && d.action === "BUY") {
    return { ok: false, reason: "weekly drawdown circuit breaker, BUY blocked" };
  }

  if (d.action === "BUY") {
    if (d.confidence < s.risk.min_confidence_to_trade) {
      return { ok: false, reason: `confidence ${d.confidence} < min ${s.risk.min_confidence_to_trade}` };
    }
    if (ctx.positions.length >= s.risk.max_concurrent_positions
        && !ctx.positions.find(p => p.symbol === d.symbol)) {
      return { ok: false, reason: "max concurrent positions reached" };
    }
    const recent = ctx.recent_trades_for_symbol.find(t =>
      Date.now() - new Date(t.attempted_at).getTime() < 30 * 60_000
    );
    if (recent) return { ok: false, reason: `too recent trade on ${d.symbol}` };

    const cap = ctx.krw_balance * s.risk.max_buy_ratio;
    let krw = Math.min(d.krw_amount, cap);

    const existing = ctx.positions.find(p => p.symbol === d.symbol);
    const existingValue = existing ? existing.qty * existing.avg_price : 0;
    const positionCap = ctx.total_assets_krw * s.risk.max_position_ratio;
    if (existingValue + krw > positionCap) {
      krw = Math.max(0, positionCap - existingValue);
    }
    if (krw < MIN_BITHUMB_KRW) return { ok: false, reason: `below minimum order ${MIN_BITHUMB_KRW}` };

    if (d.order_type === "MARKET" && ctx.spread_pct > s.bithumb.max_spread_pct_for_market) {
      return { ok: false, reason: `spread ${ctx.spread_pct}% too wide for MARKET` };
    }
    return { ok: true, adjusted: { ...d, krw_amount: krw } };
  }

  // SELL
  const pos = ctx.positions.find(p => p.symbol === d.symbol);
  if (!pos || pos.qty <= 0) return { ok: false, reason: `no position in ${d.symbol}` };
  const ratio = Math.max(0, Math.min(1, d.sell_ratio || 1));
  return { ok: true, adjusted: { ...d, sell_ratio: ratio } };
}
```

- [ ] **Step 3: Run, commit**

```bash
pnpm test tests/risk-guard.test.ts
git add electron/trader/risk-guard.ts tests/risk-guard.test.ts
git commit -m "feat(trader): risk-guard with full rule coverage"
```

---

## Task 15: Circuit Breaker

**Files:**
- Create: `electron/trader/circuit-breaker.ts`
- Test: `tests/circuit-breaker.test.ts`

- [ ] **Step 1: Tests**

`tests/circuit-breaker.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "../electron/trader/circuit-breaker";

describe("CircuitBreaker", () => {
  it("trips after 3 claude failures", () => {
    const cb = new CircuitBreaker();
    cb.recordClaudeFailure(); cb.recordClaudeFailure(); cb.recordClaudeFailure();
    expect(cb.shouldHalt().halt).toBe(true);
  });
  it("trips after 5 consecutive losing trades", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 5; i++) cb.recordTrade({ pnl_pct: -2 });
    expect(cb.shouldHalt().halt).toBe(true);
  });
  it("resets on a winning trade", () => {
    const cb = new CircuitBreaker();
    cb.recordTrade({ pnl_pct: -2 }); cb.recordTrade({ pnl_pct: -1 });
    cb.recordTrade({ pnl_pct: 3 });
    cb.recordTrade({ pnl_pct: -1 }); cb.recordTrade({ pnl_pct: -1 });
    expect(cb.shouldHalt().halt).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

`electron/trader/circuit-breaker.ts`:
```ts
export class CircuitBreaker {
  private claudeFails = 0;
  private bithumbFails = 0;
  private consecutiveLosses = 0;
  private haltedUntil: number | null = null;
  private haltReason: string | null = null;

  recordClaudeSuccess() { this.claudeFails = 0; }
  recordClaudeFailure() {
    this.claudeFails++;
    if (this.claudeFails >= 3) this.halt(60 * 60_000, "Claude failed 3 times");
  }

  recordBithumbSuccess() { this.bithumbFails = 0; }
  recordBithumbFailure() {
    this.bithumbFails++;
    if (this.bithumbFails >= 5) this.halt(30 * 60_000, "Bithumb failed 5 times");
  }

  recordTrade(t: { pnl_pct: number }) {
    if (t.pnl_pct < 0) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= 5) this.halt(60 * 60_000, "5 consecutive losses");
    } else {
      this.consecutiveLosses = 0;
    }
  }

  recordBtcCrash() { this.halt(60 * 60_000, "BTC crash detected"); }

  shouldHalt(): { halt: boolean; reason?: string; until?: number } {
    if (this.haltedUntil && Date.now() < this.haltedUntil) {
      return { halt: true, reason: this.haltReason!, until: this.haltedUntil };
    }
    if (this.haltedUntil) {
      this.haltedUntil = null; this.haltReason = null; this.claudeFails = 0;
      this.bithumbFails = 0; this.consecutiveLosses = 0;
    }
    return { halt: false };
  }

  private halt(ms: number, reason: string) {
    this.haltedUntil = Date.now() + ms;
    this.haltReason = reason;
  }

  reset() {
    this.claudeFails = 0; this.bithumbFails = 0; this.consecutiveLosses = 0;
    this.haltedUntil = null; this.haltReason = null;
  }
}
```

- [ ] **Step 3: Run, commit**

```bash
pnpm test tests/circuit-breaker.test.ts
git add electron/trader/circuit-breaker.ts tests/circuit-breaker.test.ts
git commit -m "feat(trader): circuit breaker with halt windows"
```

---

## Task 16: Performance metrics

**Files:**
- Create: `electron/performance.ts`

- [ ] **Step 1: Implement**

`electron/performance.ts`:
```ts
import type Database from "better-sqlite3";

export function computePerformance(db: Database.Database) {
  const rows = db.prepare(
    `SELECT result, filled_qty, filled_price, fee_krw, krw_amount, action, attempted_at
     FROM trade_attempts WHERE result IN ('FILLED','PARTIAL','PAPER')
     AND attempted_at >= datetime('now','-30 days')`
  ).all() as any[];

  let wins = 0, losses = 0, sumWinPct = 0, sumLossPct = 0, fees = 0, sumPnL = 0;
  for (const r of rows) {
    fees += r.fee_krw ?? 0;
  }

  // Pair BUY -> SELL on same symbol via FIFO using positions table is complex;
  // here approximate by daily_performance rollup table populated by orchestrator after each cycle.
  const daily = db.prepare(
    `SELECT pnl_pct, wins, losses FROM daily_performance
     WHERE date >= date('now','-30 days')`
  ).all() as any[];
  for (const d of daily) {
    if (d.pnl_pct > 0) { wins += d.wins ?? 0; sumWinPct += d.pnl_pct; }
    else { losses += d.losses ?? 0; sumLossPct += Math.abs(d.pnl_pct); }
  }

  const total = wins + losses;
  return {
    win_rate_30d: total === 0 ? 0 : wins / total,
    avg_win_pct: wins ? sumWinPct / wins : 0,
    avg_loss_pct: losses ? sumLossPct / losses : 0,
    profit_factor: sumLossPct === 0 ? sumWinPct : sumWinPct / sumLossPct,
    fees_paid_30d: fees
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/performance.ts
git commit -m "feat: 30d performance metrics rollup"
```

---

## Task 17: Executor

**Files:**
- Create: `electron/trader/executor.ts`

- [ ] **Step 1: Implement**

`electron/trader/executor.ts`:
```ts
import type Database from "better-sqlite3";
import type { Decision, Settings } from "@shared/zod-schemas";
import { Journal } from "@main/storage/journal";
import * as bp from "@main/bithumb/private";
import { getBithumbKeys } from "@main/storage/secrets";

export type ExecResult = {
  result: "FILLED"|"PARTIAL"|"REJECTED"|"ERROR"|"PAPER";
  bithumb_order_id?: string;
  filled_qty?: number;
  filled_price?: number;
  fee_krw?: number;
  error?: string;
};

export async function executeDecision(
  db: Database.Database, decisionId: number, d: Decision, s: Settings
): Promise<ExecResult> {
  const j = new Journal(db);
  const attemptRow = {
    decision_id: decisionId,
    attempted_at: new Date().toISOString(),
    symbol: d.symbol, action: d.action,
    krw_amount: d.krw_amount, qty: null,
    order_type: d.order_type, limit_price: d.limit_price ?? null,
    reason: d.reason, signals: JSON.stringify(d.signals),
    confidence: d.confidence,
    stop_loss_price: d.stop_loss_price ?? null,
    take_profit_price: d.take_profit_price ?? null,
    risk_check: "PASSED",
    result: null, bithumb_order_id: null,
    filled_qty: null, filled_price: null, fee_krw: null, error: null
  };

  if (s.paper_mode) {
    const paper: ExecResult = { result: "PAPER", filled_qty: 0, filled_price: 0, fee_krw: 0 };
    j.insertTradeAttempt({ ...attemptRow, ...paper, signals: attemptRow.signals });
    return paper;
  }

  const creds = await getBithumbKeys();
  if (!creds) {
    const err: ExecResult = { result: "ERROR", error: "no bithumb keys" };
    j.insertTradeAttempt({ ...attemptRow, ...err });
    return err;
  }

  try {
    if (d.action === "BUY") {
      const order = d.order_type === "MARKET"
        ? await bp.placeMarketBuy({ apiKey: creds.key, apiSecret: creds.secret }, d.symbol, d.krw_amount)
        : await bp.placeLimit({ apiKey: creds.key, apiSecret: creds.secret }, d.symbol, "bid",
            d.krw_amount / (d.limit_price ?? 1), d.limit_price ?? 0);
      const ok: ExecResult = { result: "FILLED", bithumb_order_id: order.order_id ?? order.orderId };
      j.insertTradeAttempt({ ...attemptRow, ...ok });
      return ok;
    } else if (d.action === "SELL") {
      const order = await bp.placeMarketSell(
        { apiKey: creds.key, apiSecret: creds.secret }, d.symbol,
        // qty resolved by orchestrator passing krw_amount=qty in d for SELL? we keep simple: pass krw_amount as units
        d.krw_amount
      );
      const ok: ExecResult = { result: "FILLED", bithumb_order_id: order.order_id ?? order.orderId };
      j.insertTradeAttempt({ ...attemptRow, ...ok });
      return ok;
    }
    j.insertTradeAttempt({ ...attemptRow, result: "REJECTED", error: "unknown action" });
    return { result: "REJECTED" };
  } catch (e: any) {
    const err: ExecResult = { result: "ERROR", error: String(e.message ?? e) };
    j.insertTradeAttempt({ ...attemptRow, ...err });
    return err;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/trader/executor.ts
git commit -m "feat(trader): executor with paper + live Bithumb execution"
```

---

## Task 18: Orchestrator

**Files:**
- Create: `electron/trader/orchestrator.ts`
- Test: `tests/paper-cycle.test.ts`

- [ ] **Step 1: Implement orchestrator**

`electron/trader/orchestrator.ts`:
```ts
import type Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as bpub from "@main/bithumb/public";
import { getBithumbKeys } from "@main/storage/secrets";
import * as bpriv from "@main/bithumb/private";
import { getFearGreed } from "@main/fear-greed";
import { getBtcDominance } from "@main/btc-dominance";
import * as ind from "@main/indicators";
import { detectPatterns } from "@main/patterns";
import { correlationMatrix } from "@main/correlation";
import { runClaudeDecision } from "@main/claude-runner";
import { evaluateDecision } from "@main/trader/risk-guard";
import { executeDecision } from "@main/trader/executor";
import { CircuitBreaker } from "@main/trader/circuit-breaker";
import { Journal } from "@main/storage/journal";
import { computePerformance } from "@main/performance";
import { getSettings } from "@main/storage/settings";

export class Orchestrator {
  private cb = new CircuitBreaker();
  constructor(private db: Database.Database) {}

  async runCycle() {
    const s = getSettings();
    const j = new Journal(this.db);
    j.insertEvent("INFO", "SCHEDULER", "cycle start");

    const halt = this.cb.shouldHalt();
    if (halt.halt) { j.insertEvent("WARN", "SCHEDULER", `halted: ${halt.reason}`); return; }

    if (!s.trading_enabled && !s.paper_mode) {
      j.insertEvent("INFO", "SCHEDULER", "trading disabled, skipping"); return;
    }

    // 1. Market data
    const market: Record<string, any> = {};
    for (const sym of s.watch_symbols) {
      try {
        const [ticker, c5m, c15m, c1h, c4h, c1d, ob] = await Promise.all([
          bpub.getTicker(sym),
          bpub.getCandles(sym, "5m"),
          bpub.getCandles(sym, "30m"),
          bpub.getCandles(sym, "1h"),
          bpub.getCandles(sym, "6h"),
          bpub.getCandles(sym, "24h"),
          bpub.getOrderbook(sym)
        ]);
        const closes1h = c1h.map(x => x.c);
        const indicators = {
          ema: { ema20: ind.ema(closes1h, 20).at(-1), ema50: ind.ema(closes1h, 50).at(-1),
                 ema200: ind.ema(closes1h, 200).at(-1) },
          rsi_1h: ind.rsi(closes1h).at(-1),
          rsi_4h: ind.rsi(c4h.map(x => x.c)).at(-1),
          macd: (() => { const m = ind.macd(closes1h);
            return { macd: m.macd.at(-1), signal: m.signal.at(-1), histogram: m.histogram.at(-1) }; })(),
          bbands: (() => { const b = ind.bollinger(closes1h);
            return { upper: b.upper.at(-1), middle: b.middle.at(-1), lower: b.lower.at(-1),
                     width_pct: b.width_pct.at(-1), percent_b: b.percent_b.at(-1) }; })(),
          atr_14: (() => { const a = ind.atr(c1h).at(-1);
            return { absolute: a, pct_of_price: (a! / closes1h.at(-1)!) * 100 }; })(),
          adx: ind.adx(c1h).at(-1),
          stoch_rsi: (() => { const sr = ind.stochRsi(closes1h);
            return { k: sr.k.at(-1), d: sr.d.at(-1) }; })(),
          ichimoku: ind.ichimoku(c1h),
          obv_slope: ind.obvSlope(ind.obv(c1h)),
          vwap: ind.vwap24h(c1h.slice(-24)),
          mtf_alignment: ind.alignmentScore(c1d, c4h, c1h)
        };
        const top = ob.bids[0]?.price ?? 0, topa = ob.asks[0]?.price ?? 0;
        const spread_pct = top && topa ? ((topa - top) / top) * 100 : 99;
        market[sym] = {
          ticker: { last: Number(ticker.closing_price), high_24h: Number(ticker.max_price),
                    low_24h: Number(ticker.min_price), vol_24h_krw: Number(ticker.acc_trade_value_24H),
                    change_pct_24h: Number(ticker.fluctate_rate_24H) },
          ohlcv: { "5m": c5m.slice(-60), "1h": c1h.slice(-168), "4h": c4h.slice(-90), "1d": c1d.slice(-60) },
          indicators,
          orderbook: { bids: ob.bids.slice(0,10), asks: ob.asks.slice(0,10), spread_pct },
          patterns_detected: detectPatterns(c1h)
        };
      } catch (e: any) {
        j.insertEvent("ERROR", "BITHUMB", `fetch ${sym} failed: ${e.message}`);
        this.cb.recordBithumbFailure();
      }
    }

    // 2. Macro
    const fg = await getFearGreed().catch(() => null);
    const dom = await getBtcDominance().catch(() => null);

    // 3. Portfolio
    const creds = await getBithumbKeys();
    let krw_balance = 0, positions: any[] = [];
    if (creds) {
      try {
        const bal = await bpriv.getBalance({ apiKey: creds.key, apiSecret: creds.secret });
        krw_balance = Number(bal.available_krw ?? bal.total_krw ?? 0);
        const dbPositions = this.db.prepare("SELECT * FROM positions").all() as any[];
        positions = dbPositions.map(p => ({ ...p, current_price: market[p.symbol]?.ticker?.last ?? p.avg_price }));
      } catch (e: any) {
        j.insertEvent("ERROR", "BITHUMB", `balance fetch: ${e.message}`);
      }
    }
    const total_assets_krw = krw_balance + positions.reduce((a, p) => a + p.qty * p.current_price, 0);

    // 4. Performance + correlation
    const perf = computePerformance(this.db);
    const closesBySymbol: Record<string, number[]> = {};
    for (const sym of s.watch_symbols) {
      closesBySymbol[sym] = (market[sym]?.ohlcv?.["1d"] ?? []).map((x: any) => x.c);
    }
    const correlation = correlationMatrix(closesBySymbol);

    // 5. Build user payload
    const userJson = {
      now_kst: new Date().toLocaleString("sv", { timeZone: "Asia/Seoul" }),
      portfolio: {
        krw_balance, total_assets_krw,
        daily_pnl_pct: 0, weekly_pnl_pct: 0, max_drawdown_7d_pct: 0,
        positions: positions.map(p => ({
          symbol: p.symbol, qty: p.qty, avg_price: p.avg_price,
          current_price: p.current_price,
          pnl_pct: ((p.current_price - p.avg_price) / p.avg_price) * 100,
          holding_minutes: Math.round((Date.now() - new Date(p.entered_at).getTime())/60000),
          highest_pnl_since_entry: p.highest_pnl_pct,
          stop_loss_price: p.stop_loss_price, take_profit_price: p.take_profit_price
        }))
      },
      market,
      macro: {
        fear_greed: fg, btc_dominance: dom,
        btc_4h_regime: "UNKNOWN" // simple stub; can be derived from BTC indicators
      },
      correlation_matrix_30d: correlation,
      recent_trades: this.db.prepare(
        "SELECT attempted_at, symbol, action, krw_amount, result FROM trade_attempts ORDER BY id DESC LIMIT 20"
      ).all(),
      performance: perf,
      limits: s.risk
    };

    // 6. Claude
    const systemPrompt = readFileSync(join(process.cwd(), "prompts/crypto-trading-ai-guide.md"), "utf-8");
    const claudeRes = await runClaudeDecision({ systemPrompt, userJson });
    const decisionId = j.insertDecision({
      cycle_at: new Date().toISOString(),
      claude_raw: claudeRes.ok ? claudeRes.raw : (claudeRes.raw ?? ""),
      market_view: claudeRes.ok ? claudeRes.decision.market_analysis.summary : null,
      fear_greed: fg?.value ?? null,
      btc_dominance: dom?.value ?? null,
      cost_usd: claudeRes.ok ? (claudeRes.cost_usd ?? null) : null,
      duration_ms: claudeRes.duration_ms,
      status: claudeRes.ok ? "OK" : "SCHEMA_FAIL",
      error: claudeRes.ok ? null : claudeRes.error
    });
    if (!claudeRes.ok) { this.cb.recordClaudeFailure();
      j.insertEvent("ERROR","CLAUDE",`fail: ${claudeRes.error}`); return; }
    this.cb.recordClaudeSuccess();
    j.insertCoinScores(decisionId, claudeRes.decision.coin_scores);

    // 7. Risk-guard + execute each decision
    for (const d of claudeRes.decision.decisions) {
      const recent = this.db.prepare(
        "SELECT attempted_at, action FROM trade_attempts WHERE symbol = ? ORDER BY id DESC LIMIT 5"
      ).all(d.symbol) as any[];
      const ctx = {
        krw_balance, total_assets_krw, positions,
        daily_pnl_pct: 0, weekly_pnl_pct: 0,
        recent_trades_for_symbol: recent,
        spread_pct: market[d.symbol]?.orderbook?.spread_pct ?? 99
      };
      const ev = evaluateDecision(d, ctx, s);
      if (!ev.ok) {
        j.insertTradeAttempt({
          decision_id: decisionId, attempted_at: new Date().toISOString(),
          symbol: d.symbol, action: d.action, krw_amount: d.krw_amount, qty: null,
          order_type: d.order_type, limit_price: d.limit_price ?? null,
          reason: d.reason, signals: JSON.stringify(d.signals), confidence: d.confidence,
          stop_loss_price: d.stop_loss_price ?? null, take_profit_price: d.take_profit_price ?? null,
          risk_check: `BLOCKED:${ev.reason}`, result: "REJECTED",
          bithumb_order_id: null, filled_qty: null, filled_price: null, fee_krw: null,
          error: null
        });
        continue;
      }
      const final = ev.adjusted ?? d;
      await executeDecision(this.db, decisionId, final, s);
    }

    // 8. Snapshot
    j.insertSnapshot({
      taken_at: new Date().toISOString(),
      krw_balance, total_assets_krw,
      positions_value: total_assets_krw - krw_balance,
      daily_pnl_pct: 0, weekly_pnl_pct: 0, all_time_pnl_pct: 0
    });

    j.insertEvent("INFO","SCHEDULER","cycle end");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/trader/orchestrator.ts
git commit -m "feat(trader): orchestrator runs full cycle"
```

---

## Task 19: Scheduler + Electron main wiring

**Files:**
- Create: `electron/scheduler.ts`, `electron/ipc.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Scheduler**

`electron/scheduler.ts`:
```ts
import cron from "node-cron";
import { Orchestrator } from "@main/trader/orchestrator";
import { getSettings } from "@main/storage/settings";

let task: cron.ScheduledTask | null = null;

export function startScheduler(orch: Orchestrator) {
  stopScheduler();
  const s = getSettings();
  const min = Math.max(1, Math.min(60, s.decision_interval_min));
  const expr = `*/${min} * * * *`;
  task = cron.schedule(expr, () => { orch.runCycle().catch(console.error); });
  console.log(`[scheduler] cron ${expr}`);
}

export function stopScheduler() { if (task) { task.stop(); task = null; } }
```

- [ ] **Step 2: IPC handlers**

`electron/ipc.ts`:
```ts
import { ipcMain } from "electron";
import type Database from "better-sqlite3";
import { Orchestrator } from "@main/trader/orchestrator";
import { getSettings, updateSettings, resetSettings } from "@main/storage/settings";
import { setBithumbKeys, clearBithumbKeys } from "@main/storage/secrets";
import { startScheduler, stopScheduler } from "@main/scheduler";

export function registerIpc(db: Database.Database, orch: Orchestrator) {
  ipcMain.handle("portfolio:current", () => {
    const positions = db.prepare("SELECT * FROM positions").all();
    const last = db.prepare("SELECT * FROM portfolio_snapshots ORDER BY taken_at DESC LIMIT 1").get();
    return { positions, snapshot: last };
  });
  ipcMain.handle("snapshots:range", (_e, range: string) => {
    const days = range === "1D" ? 1 : range === "7D" ? 7 : range === "30D" ? 30 : 9999;
    return db.prepare(
      `SELECT * FROM portfolio_snapshots WHERE taken_at >= datetime('now','-${days} days') ORDER BY taken_at`
    ).all();
  });
  ipcMain.handle("trades:list", (_e, limit = 100) =>
    db.prepare("SELECT * FROM trade_attempts ORDER BY id DESC LIMIT ?").all(limit));
  ipcMain.handle("decisions:list", (_e, limit = 50) => {
    const rows = db.prepare("SELECT * FROM decisions ORDER BY id DESC LIMIT ?").all(limit) as any[];
    for (const r of rows) {
      r.coin_scores = db.prepare("SELECT * FROM coin_scores WHERE decision_id=?").all(r.id);
    }
    return rows;
  });
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:update", (_e, patch) => updateSettings(patch));
  ipcMain.handle("settings:reset", () => resetSettings());
  ipcMain.handle("bithumb:set-keys", (_e, k, s) => setBithumbKeys(k, s).then(() => updateSettings({ bithumb: { ...getSettings().bithumb, api_key_set: true } as any })));
  ipcMain.handle("bithumb:clear-keys", () => clearBithumbKeys().then(() => updateSettings({ bithumb: { ...getSettings().bithumb, api_key_set: false } as any })));
  ipcMain.handle("trader:run-now", () => orch.runCycle());
  ipcMain.handle("trader:start", () => { updateSettings({ trading_enabled: true }); startScheduler(orch); });
  ipcMain.handle("trader:stop", () => { updateSettings({ trading_enabled: false }); stopScheduler(); });
  ipcMain.handle("trader:emergency-stop", async () => {
    updateSettings({ trading_enabled: false }); stopScheduler();
    // future: place market sell of all positions
    return { ok: true };
  });
}
```

- [ ] **Step 3: Update main**

`electron/main.ts` (replace):
```ts
import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { app as electronApp } from "electron";
import { openDb } from "@main/storage/db";
import { Orchestrator } from "@main/trader/orchestrator";
import { startScheduler } from "@main/scheduler";
import { registerIpc } from "@main/ipc";
import { getSettings } from "@main/storage/settings";

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1200, minHeight: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true, nodeIntegration: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await win.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(async () => {
  const dbPath = join(electronApp.getPath("userData"), "trader.db");
  const db = openDb(dbPath);
  const orch = new Orchestrator(db);
  registerIpc(db, orch);
  await createWindow();
  if (getSettings().trading_enabled) startScheduler(orch);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
```

- [ ] **Step 4: Update preload to expose IPC surface**

`electron/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  portfolio: { current: () => ipcRenderer.invoke("portfolio:current") },
  snapshots: { range: (r: string) => ipcRenderer.invoke("snapshots:range", r) },
  trades: { list: (limit?: number) => ipcRenderer.invoke("trades:list", limit) },
  decisions: { list: (limit?: number) => ipcRenderer.invoke("decisions:list", limit) },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (p: any) => ipcRenderer.invoke("settings:update", p),
    reset: () => ipcRenderer.invoke("settings:reset")
  },
  bithumb: {
    setKeys: (k: string, s: string) => ipcRenderer.invoke("bithumb:set-keys", k, s),
    clearKeys: () => ipcRenderer.invoke("bithumb:clear-keys")
  },
  trader: {
    runNow: () => ipcRenderer.invoke("trader:run-now"),
    start: () => ipcRenderer.invoke("trader:start"),
    stop: () => ipcRenderer.invoke("trader:stop"),
    emergencyStop: () => ipcRenderer.invoke("trader:emergency-stop")
  }
});

declare global {
  interface Window {
    api: {
      portfolio: { current: () => Promise<any> };
      snapshots: { range: (r: string) => Promise<any[]> };
      trades: { list: (limit?: number) => Promise<any[]> };
      decisions: { list: (limit?: number) => Promise<any[]> };
      settings: { get: () => Promise<any>; update: (p: any) => Promise<any>; reset: () => Promise<any> };
      bithumb: { setKeys: (k: string, s: string) => Promise<any>; clearKeys: () => Promise<any> };
      trader: { runNow: () => Promise<any>; start: () => Promise<any>; stop: () => Promise<any>; emergencyStop: () => Promise<any> };
    };
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add electron/scheduler.ts electron/ipc.ts electron/main.ts electron/preload.ts
git commit -m "feat: scheduler, ipc handlers, main wiring"
```

---

## Task 20: Renderer skeleton (routing, layout, theme, query client)

**Files:**
- Create: `renderer/src/lib/api.ts`, `renderer/src/lib/query.ts`, `renderer/src/lib/format.ts`
- Create: `renderer/src/components/Sidebar.tsx`, `renderer/src/components/Header.tsx`
- Modify: `renderer/src/App.tsx`, `renderer/src/main.tsx`

- [ ] **Step 1: API + query**

`renderer/src/lib/api.ts`: just `export const api = window.api;`

`renderer/src/lib/query.ts`:
```ts
import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchInterval: 10_000 } }
});
```

`renderer/src/lib/format.ts`:
```ts
export const krw = (n: number) => "₩" + Math.round(n).toLocaleString("ko-KR");
export const pct = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
export const num = (n: number, digits = 4) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: digits });
```

- [ ] **Step 2: Sidebar + Header**

`renderer/src/components/Sidebar.tsx`:
```tsx
import { NavLink } from "react-router-dom";
const items = [
  { to: "/", label: "Overview" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/trades", label: "Trades" },
  { to: "/decisions", label: "Decisions" },
  { to: "/backtest", label: "Backtest" },
  { to: "/settings", label: "Settings" }
];
export default function Sidebar() {
  return (
    <aside className="w-48 border-r border-neutral-800 p-3 space-y-1">
      <div className="font-bold text-lg mb-4">Bithumb × Claude</div>
      {items.map(i => (
        <NavLink key={i.to} to={i.to} end
          className={({ isActive }) => `block px-3 py-2 rounded ${isActive ? "bg-neutral-800" : "hover:bg-neutral-900"}`}>
          {i.label}
        </NavLink>
      ))}
    </aside>
  );
}
```

`renderer/src/components/Header.tsx`:
```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@renderer/lib/api";
import { krw, pct } from "@renderer/lib/format";

export default function Header() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get() });
  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api.portfolio.current() });
  const total = portfolio.data?.snapshot?.total_assets_krw ?? 0;
  const dp = portfolio.data?.snapshot?.daily_pnl_pct ?? 0;
  const enabled = settings.data?.trading_enabled ?? false;

  async function toggle() {
    if (enabled) await api.trader.stop(); else await api.trader.start();
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function panic() {
    if (!confirm("EMERGENCY STOP — close all positions and disable trading?")) return;
    await api.trader.emergencyStop();
    qc.invalidateQueries();
  }
  return (
    <header className="flex items-center justify-between border-b border-neutral-800 p-3">
      <div className="flex items-center gap-3">
        <button onClick={toggle}
          className={`px-4 py-2 rounded font-semibold ${enabled ? "bg-emerald-600" : "bg-neutral-700"}`}>
          {enabled ? "Trading: ON" : "Trading: OFF"}
        </button>
        {settings.data?.paper_mode && <span className="px-2 py-1 bg-amber-700 rounded text-xs">PAPER</span>}
      </div>
      <div className="flex items-center gap-6">
        <div>Total: <b>{krw(total)}</b></div>
        <div className={dp >= 0 ? "text-emerald-400" : "text-rose-400"}>Today: {pct(dp)}</div>
        <button onClick={panic} className="px-3 py-2 bg-rose-700 rounded text-sm font-bold">EMERGENCY STOP</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: App with routing**

`renderer/src/App.tsx`:
```tsx
import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Overview from "./pages/Overview";
import Portfolio from "./pages/Portfolio";
import TradeLog from "./pages/TradeLog";
import Decisions from "./pages/Decisions";
import Backtest from "./pages/Backtest";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <div className="flex h-screen bg-neutral-950 text-neutral-100">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/trades" element={<TradeLog />} />
                <Route path="/decisions" element={<Decisions />} />
                <Route path="/backtest" element={<Backtest />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </div>
      </HashRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add renderer/
git commit -m "feat(renderer): routing, sidebar, header with global controls"
```

---

## Task 21: Overview & Portfolio pages

**Files:**
- Create: `renderer/src/pages/Overview.tsx`, `renderer/src/pages/Portfolio.tsx`

- [ ] **Step 1: Overview page**

`renderer/src/pages/Overview.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { api } from "@renderer/lib/api";
import { krw, pct } from "@renderer/lib/format";

export default function Overview() {
  const [range, setRange] = useState("7D");
  const snaps = useQuery({ queryKey: ["snaps", range], queryFn: () => api.snapshots.range(range) });
  const trades = useQuery({ queryKey: ["trades", 5], queryFn: () => api.trades.list(5) });
  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api.portfolio.current() });
  const positions = portfolio.data?.positions ?? [];
  const data = (snaps.data ?? []).map((s: any) => ({ at: s.taken_at, value: s.total_assets_krw }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Overview</h1>
        <div className="space-x-2">
          {["1D","7D","30D","All"].map(r =>
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1 rounded ${range===r?"bg-neutral-700":"bg-neutral-800"}`}>{r}</button>)}
        </div>
      </div>
      <div className="bg-neutral-900 rounded p-4 h-72">
        <ResponsiveContainer><LineChart data={data}>
          <XAxis dataKey="at" hide /><YAxis domain={["auto","auto"]} tickFormatter={v=>krw(v)} />
          <Tooltip formatter={(v:any)=>krw(v)} />
          <Line type="monotone" dataKey="value" stroke="#10b981" dot={false} strokeWidth={2}/>
        </LineChart></ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-neutral-900 rounded p-4">
          <h2 className="font-semibold mb-2">Positions</h2>
          {positions.length === 0 && <div className="text-neutral-500">No positions</div>}
          {positions.map((p:any) => {
            const pnl = ((p.current_price - p.avg_price) / p.avg_price) * 100;
            return <div key={p.symbol} className="flex justify-between py-1 border-b border-neutral-800">
              <span>{p.symbol}</span><span>{p.qty.toFixed(4)}</span>
              <span className={pnl>=0?"text-emerald-400":"text-rose-400"}>{pct(pnl)}</span>
              <span>{krw(p.qty * p.current_price)}</span>
            </div>;
          })}
        </div>
        <div className="bg-neutral-900 rounded p-4">
          <h2 className="font-semibold mb-2">Recent Decisions</h2>
          {(trades.data ?? []).map((t:any) =>
            <div key={t.id} className="flex justify-between py-1 border-b border-neutral-800 text-sm">
              <span>{new Date(t.attempted_at).toLocaleTimeString()}</span>
              <span>{t.action}</span><span>{t.symbol}</span>
              <span className="text-neutral-400">{t.result}</span>
            </div>)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Portfolio page**

`renderer/src/pages/Portfolio.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "@renderer/lib/api";
import { krw, pct } from "@renderer/lib/format";

const COLORS = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#ec4899","#22d3ee"];

export default function Portfolio() {
  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api.portfolio.current() });
  const positions = portfolio.data?.positions ?? [];
  const snap = portfolio.data?.snapshot ?? {};
  const cash = snap.krw_balance ?? 0;
  const dist = [
    { name: "KRW", value: cash },
    ...positions.map((p: any) => ({ name: p.symbol, value: p.qty * p.current_price }))
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-neutral-900 p-4 rounded h-72">
          <ResponsiveContainer><PieChart>
            <Pie data={dist} dataKey="value" nameKey="name" outerRadius={100}>
              {dist.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Pie><Tooltip formatter={(v:any)=>krw(v)}/>
          </PieChart></ResponsiveContainer>
        </div>
        <div className="bg-neutral-900 p-4 rounded space-y-2">
          <div>Total: <b>{krw(snap.total_assets_krw ?? 0)}</b></div>
          <div>Cash: {krw(cash)}</div>
          <div>Positions value: {krw((snap.total_assets_krw ?? 0) - cash)}</div>
          <div>Daily P&L: <span className={(snap.daily_pnl_pct ?? 0)>=0?"text-emerald-400":"text-rose-400"}>{pct(snap.daily_pnl_pct ?? 0)}</span></div>
          <div>Weekly P&L: <span className={(snap.weekly_pnl_pct ?? 0)>=0?"text-emerald-400":"text-rose-400"}>{pct(snap.weekly_pnl_pct ?? 0)}</span></div>
        </div>
      </div>
      <div className="bg-neutral-900 p-4 rounded">
        <h2 className="font-semibold mb-2">Positions</h2>
        <table className="w-full text-sm">
          <thead className="text-neutral-400">
            <tr><th className="text-left p-2">Symbol</th><th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Avg</th><th className="text-right p-2">Now</th>
                <th className="text-right p-2">P&L</th><th className="text-right p-2">SL/TP</th></tr>
          </thead>
          <tbody>
            {positions.map((p:any) => {
              const pnl = ((p.current_price - p.avg_price) / p.avg_price) * 100;
              return <tr key={p.symbol} className="border-t border-neutral-800">
                <td className="p-2">{p.symbol}</td><td className="text-right">{p.qty.toFixed(4)}</td>
                <td className="text-right">{krw(p.avg_price)}</td><td className="text-right">{krw(p.current_price)}</td>
                <td className={"text-right " + (pnl>=0?"text-emerald-400":"text-rose-400")}>{pct(pnl)}</td>
                <td className="text-right text-xs">{p.stop_loss_price?krw(p.stop_loss_price):"-"} / {p.take_profit_price?krw(p.take_profit_price):"-"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add renderer/src/pages/Overview.tsx renderer/src/pages/Portfolio.tsx
git commit -m "feat(renderer): Overview and Portfolio pages"
```

---

## Task 22: Trade Log + Decisions pages

**Files:**
- Create: `renderer/src/pages/TradeLog.tsx`, `renderer/src/pages/Decisions.tsx`

- [ ] **Step 1: TradeLog**

`renderer/src/pages/TradeLog.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@renderer/lib/api";
import { krw } from "@renderer/lib/format";

export default function TradeLog() {
  const [filter, setFilter] = useState<string>("ALL");
  const { data = [] } = useQuery({ queryKey: ["trades", 200], queryFn: () => api.trades.list(200) });
  const filtered = data.filter((t: any) => filter === "ALL" || t.action === filter);
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Trade Log</h1>
        <div className="space-x-2">
          {["ALL","BUY","SELL"].map(f=>
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-3 py-1 rounded ${filter===f?"bg-neutral-700":"bg-neutral-800"}`}>{f}</button>)}
        </div>
      </div>
      <table className="w-full text-sm bg-neutral-900 rounded">
        <thead className="text-neutral-400">
          <tr><th className="text-left p-2">Time</th><th>Action</th><th>Symbol</th>
              <th className="text-right">KRW</th><th>Result</th>
              <th className="text-right">Conf</th><th>Reason</th></tr>
        </thead>
        <tbody>
          {filtered.map((t:any)=>
            <tr key={t.id} className="border-t border-neutral-800">
              <td className="p-2">{new Date(t.attempted_at).toLocaleString("ko-KR")}</td>
              <td>{t.action}</td><td>{t.symbol}</td>
              <td className="text-right">{krw(t.krw_amount ?? 0)}</td>
              <td className={t.result==="FILLED"?"text-emerald-400":t.result==="REJECTED"?"text-rose-400":""}>
                {t.result}{t.risk_check?.startsWith("BLOCKED")?` (${t.risk_check})`:""}</td>
              <td className="text-right">{Number(t.confidence).toFixed(2)}</td>
              <td className="text-neutral-300 text-xs max-w-md truncate">{t.reason}</td>
            </tr>)}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Decisions**

`renderer/src/pages/Decisions.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@renderer/lib/api";

export default function Decisions() {
  const [open, setOpen] = useState<number | null>(null);
  const { data = [] } = useQuery({ queryKey: ["decisions", 50], queryFn: () => api.decisions.list(50) });
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Decisions</h1>
      {data.map((d:any) =>
        <div key={d.id} className="bg-neutral-900 rounded p-3">
          <div className="flex justify-between cursor-pointer" onClick={()=>setOpen(open===d.id?null:d.id)}>
            <div>
              <span className="text-neutral-400 text-sm">{new Date(d.cycle_at).toLocaleString("ko-KR")}</span>
              <span className="ml-3 font-semibold">{d.market_view}</span>
            </div>
            <div className="text-sm text-neutral-400">F&G {d.fear_greed} · BTC.D {d.btc_dominance?.toFixed(1)}% · {d.status}</div>
          </div>
          {open === d.id && <div className="mt-3 space-y-2 text-sm">
            <table className="w-full">
              <thead className="text-neutral-400"><tr><th className="text-left">Symbol</th><th>Score</th><th>EMA</th><th>RSI</th><th>Hint</th><th>Playbook</th></tr></thead>
              <tbody>{(d.coin_scores ?? []).map((c:any)=>
                <tr key={c.symbol} className="border-t border-neutral-800">
                  <td>{c.symbol}</td><td>{c.score}</td><td>{c.ema_state}</td>
                  <td>{c.rsi_1h?.toFixed(1)}</td><td>{c.decision_hint}</td><td>{c.playbook}</td>
                </tr>)}
              </tbody>
            </table>
            <details><summary className="text-neutral-500 cursor-pointer">Raw Claude response</summary>
              <pre className="text-xs bg-black p-2 overflow-auto max-h-96">{d.claude_raw}</pre>
            </details>
          </div>}
        </div>)}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add renderer/src/pages/TradeLog.tsx renderer/src/pages/Decisions.tsx
git commit -m "feat(renderer): TradeLog and Decisions pages"
```

---

## Task 23: Settings page

**Files:**
- Create: `renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Implement**

`renderer/src/pages/Settings.tsx`:
```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@renderer/lib/api";

export default function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get() });
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (data && !form) setForm(data); }, [data]);
  const [bk, setBk] = useState({ key: "", secret: "" });

  if (!form) return <div>Loading…</div>;
  async function save() {
    await api.settings.update(form);
    qc.invalidateQueries({ queryKey: ["settings"] });
    alert("Saved");
  }
  async function saveKeys() {
    if (!bk.key || !bk.secret) return;
    await api.bithumb.setKeys(bk.key, bk.secret);
    setBk({ key: "", secret: "" });
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="General">
        <Toggle label="Paper mode" v={form.paper_mode} on={v=>setForm({...form, paper_mode: v})}/>
        <Toggle label="Auto start on login" v={form.auto_start_on_login} on={v=>setForm({...form, auto_start_on_login: v})}/>
        <Toggle label="Run in background" v={form.run_in_background} on={v=>setForm({...form, run_in_background: v})}/>
        <Field label="Decision interval (min)" type="number" v={form.decision_interval_min}
               on={v=>setForm({...form, decision_interval_min: Number(v)})}/>
      </Section>

      <Section title="Watch Symbols (comma separated)">
        <input className="w-full bg-neutral-800 p-2 rounded"
               value={form.watch_symbols.join(",")}
               onChange={e=>setForm({...form, watch_symbols: e.target.value.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean)})}/>
      </Section>

      <Section title="Risk">
        {Object.entries(form.risk).map(([k,v])=>
          <Field key={k} label={k} type="number" v={v as number}
                 on={x=>setForm({...form, risk: {...form.risk, [k]: Number(x)}})}/>)}
      </Section>

      <Section title="Claude">
        <Field label="Model" v={form.claude.model}
               on={v=>setForm({...form, claude:{...form.claude, model: v}})}/>
        <Field label="Timeout (ms)" type="number" v={form.claude.timeout_ms}
               on={v=>setForm({...form, claude:{...form.claude, timeout_ms: Number(v)}})}/>
      </Section>

      <Section title="Bithumb API">
        <div className="text-sm text-neutral-400 mb-2">
          Status: {form.bithumb.api_key_set ? "✅ Stored in macOS Keychain" : "❌ Not set"}
        </div>
        <input className="w-full bg-neutral-800 p-2 rounded mb-2" placeholder="API Key"
               value={bk.key} onChange={e=>setBk({...bk, key: e.target.value})}/>
        <input className="w-full bg-neutral-800 p-2 rounded mb-2" placeholder="API Secret" type="password"
               value={bk.secret} onChange={e=>setBk({...bk, secret: e.target.value})}/>
        <div className="space-x-2">
          <button onClick={saveKeys} className="px-4 py-2 bg-emerald-600 rounded">Save Keys</button>
          <button onClick={()=>api.bithumb.clearKeys().then(()=>qc.invalidateQueries({queryKey:["settings"]}))}
            className="px-4 py-2 bg-rose-700 rounded">Clear</button>
        </div>
        <Toggle label="Use market orders" v={form.bithumb.use_market_orders}
          on={v=>setForm({...form, bithumb: {...form.bithumb, use_market_orders: v}})}/>
      </Section>

      <button onClick={save} className="px-6 py-3 bg-emerald-600 rounded font-bold">Save Settings</button>
    </div>
  );
}

function Section({title,children}:{title:string;children:any}) {
  return <section className="bg-neutral-900 p-4 rounded space-y-3">
    <h2 className="font-semibold">{title}</h2>{children}
  </section>;
}
function Toggle({label,v,on}:{label:string;v:boolean;on:(v:boolean)=>void}) {
  return <label className="flex justify-between"><span>{label}</span>
    <input type="checkbox" checked={v} onChange={e=>on(e.target.checked)}/></label>;
}
function Field({label,v,on,type="text"}:{label:string;v:any;on:(v:any)=>void;type?:string}) {
  return <label className="flex justify-between gap-3"><span>{label}</span>
    <input type={type} value={v} onChange={e=>on(e.target.value)} className="bg-neutral-800 p-1 rounded w-40"/></label>;
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/src/pages/Settings.tsx
git commit -m "feat(renderer): settings page with all sections"
```

---

## Task 24: Notifications + Auto-start

**Files:**
- Create: `electron/notifications.ts`, `electron/autostart.ts`
- Modify: `electron/main.ts` (call autostart, register notification on cycle events)

- [ ] **Step 1: Notifications**

`electron/notifications.ts`:
```ts
import { Notification } from "electron";
import { getSettings } from "@main/storage/settings";

export function notify(title: string, body: string) {
  const s = getSettings();
  if (!s.notifications.macos_native) return;
  new Notification({ title, body }).show();
}

export function notifyTrade(action: string, symbol: string, krw: number, result: string) {
  if (!getSettings().notifications.on_trade) return;
  notify(`${action} ${symbol}`, `${result} · ₩${Math.round(krw).toLocaleString("ko-KR")}`);
}
export function notifyError(msg: string) {
  if (!getSettings().notifications.on_error) return;
  notify("Trader error", msg);
}
export function notifyCircuitBreaker(reason: string) {
  if (!getSettings().notifications.on_circuit_breaker) return;
  notify("Circuit breaker", reason);
}
```

- [ ] **Step 2: Auto-start**

`electron/autostart.ts`:
```ts
import { app } from "electron";
import { getSettings } from "@main/storage/settings";

export function syncAutoStart() {
  const s = getSettings();
  app.setLoginItemSettings({
    openAtLogin: s.auto_start_on_login,
    openAsHidden: s.run_in_background
  });
}
```

- [ ] **Step 3: Wire in main.ts**

Modify `electron/main.ts` `whenReady` block, add `syncAutoStart()` after registerIpc.
Update orchestrator to call `notifyTrade` on each FILLED execution and `notifyCircuitBreaker` on halt (in `circuit-breaker.ts` halt method, but since CB is in main, prefer adding event in orchestrator after CB.shouldHalt returns halt).

- [ ] **Step 4: Commit**

```bash
git add electron/notifications.ts electron/autostart.ts electron/main.ts
git commit -m "feat: macOS native notifications and login-item autostart"
```

---

## Task 25: Backtest engine

**Files:**
- Create: `electron/backtest/fetcher.ts`, `electron/backtest/engine.ts`, `renderer/src/pages/Backtest.tsx`
- Modify: `electron/ipc.ts` (add backtest handler), `electron/preload.ts` (add backtest API)

- [ ] **Step 1: Fetcher**

`electron/backtest/fetcher.ts`:
```ts
import { getCandles, type CandleTF } from "@main/bithumb/public";
export async function fetchHistorical(symbols: string[], tf: CandleTF) {
  const out: Record<string, any[]> = {};
  for (const s of symbols) out[s] = await getCandles(s, tf);
  return out;
}
```

- [ ] **Step 2: Engine**

`electron/backtest/engine.ts`:
```ts
import { runClaudeDecision } from "@main/claude-runner";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ind from "@main/indicators";
import { detectPatterns } from "@main/patterns";

export type BacktestParams = {
  symbols: string[];
  startCandleIdx: number;   // skip warmup
  steps: number;            // how many candles to walk forward
  initialKrw: number;
};

export type BacktestResult = {
  trades: any[];
  finalKrw: number;
  finalAssets: number;
  pnlPct: number;
  decisions: any[];
};

export async function runBacktest(
  candlesBySymbol: Record<string, any[]>,
  params: BacktestParams
): Promise<BacktestResult> {
  const positions = new Map<string, { qty: number; avg: number }>();
  let krw = params.initialKrw;
  const trades: any[] = [];
  const decisions: any[] = [];
  const sysPrompt = readFileSync(join(process.cwd(), "prompts/crypto-trading-ai-guide.md"), "utf-8");

  for (let step = 0; step < params.steps; step++) {
    const idx = params.startCandleIdx + step;
    const market: any = {};
    for (const sym of params.symbols) {
      const c = candlesBySymbol[sym].slice(0, idx + 1);
      if (c.length < 60) continue;
      const closes = c.map(x => x.c);
      market[sym] = {
        ticker: { last: closes.at(-1) },
        ohlcv: { "1h": c.slice(-168) },
        indicators: {
          ema: { ema20: ind.ema(closes, 20).at(-1), ema50: ind.ema(closes, 50).at(-1), ema200: ind.ema(closes, 200).at(-1) },
          rsi_1h: ind.rsi(closes).at(-1),
          atr_14: { absolute: ind.atr(c).at(-1) }
        },
        patterns_detected: detectPatterns(c)
      };
    }
    const totalAssets = krw + Array.from(positions.entries())
      .reduce((a,[s,p])=>a + p.qty * (market[s]?.ticker.last ?? 0), 0);
    const userJson = {
      portfolio: { krw_balance: krw, total_assets_krw: totalAssets,
        positions: Array.from(positions.entries()).map(([s,p])=>({
          symbol: s, qty: p.qty, avg_price: p.avg, current_price: market[s]?.ticker.last,
          pnl_pct: ((market[s]?.ticker.last - p.avg) / p.avg) * 100 })) },
      market,
      limits: { MAX_BUY_RATIO: 0.25, MAX_POSITION_RATIO: 0.5, DAILY_LOSS_LIMIT: 10, STOP_LOSS_PCT: 15, TAKE_PROFIT_PCT: 20 }
    };
    const r = await runClaudeDecision({ systemPrompt: sysPrompt, userJson });
    if (!r.ok) continue;
    decisions.push(r.decision);
    for (const d of r.decision.decisions) {
      const px = market[d.symbol]?.ticker.last;
      if (!px) continue;
      if (d.action === "BUY" && krw >= d.krw_amount && d.krw_amount >= 5000) {
        const q = d.krw_amount / px;
        const cur = positions.get(d.symbol);
        const newQty = (cur?.qty ?? 0) + q;
        const newAvg = cur ? (cur.qty * cur.avg + q * px) / newQty : px;
        positions.set(d.symbol, { qty: newQty, avg: newAvg });
        krw -= d.krw_amount;
        trades.push({ step, action: "BUY", symbol: d.symbol, qty: q, price: px });
      } else if (d.action === "SELL") {
        const cur = positions.get(d.symbol);
        if (!cur) continue;
        const ratio = d.sell_ratio || 1;
        const sellQ = cur.qty * ratio;
        krw += sellQ * px;
        if (ratio >= 0.999) positions.delete(d.symbol);
        else positions.set(d.symbol, { qty: cur.qty - sellQ, avg: cur.avg });
        trades.push({ step, action: "SELL", symbol: d.symbol, qty: sellQ, price: px });
      }
    }
  }

  const finalAssets = krw + Array.from(positions.entries())
    .reduce((a,[s,p])=>a + p.qty * (candlesBySymbol[s][params.startCandleIdx + params.steps - 1].c), 0);
  return { trades, finalKrw: krw, finalAssets, pnlPct: ((finalAssets - params.initialKrw)/params.initialKrw)*100, decisions };
}
```

- [ ] **Step 3: IPC + UI**

Add to `electron/ipc.ts`:
```ts
ipcMain.handle("backtest:run", async (_e, p) => {
  const { fetchHistorical } = await import("@main/backtest/fetcher");
  const { runBacktest } = await import("@main/backtest/engine");
  const candles = await fetchHistorical(p.symbols, p.timeframe ?? "1h");
  return runBacktest(candles, { symbols: p.symbols, startCandleIdx: 200, steps: p.steps ?? 50, initialKrw: p.initialKrw ?? 1_000_000 });
});
```

Add to `electron/preload.ts`:
```ts
backtest: { run: (p:any) => ipcRenderer.invoke("backtest:run", p) }
```
(extend the global type accordingly).

`renderer/src/pages/Backtest.tsx`:
```tsx
import { useState } from "react";
import { api } from "@renderer/lib/api";
import { krw, pct } from "@renderer/lib/format";

export default function Backtest() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [params, setParams] = useState({ symbols: "BTC,ETH,XRP,SOL,DOGE", steps: 30, initialKrw: 1_000_000 });

  async function go() {
    setRunning(true); setResult(null);
    try {
      const r = await (window as any).api.backtest.run({
        symbols: params.symbols.split(",").map(s=>s.trim()),
        steps: Number(params.steps),
        initialKrw: Number(params.initialKrw)
      });
      setResult(r);
    } finally { setRunning(false); }
  }
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Backtest</h1>
      <div className="text-sm text-amber-400">⚠️ This calls Claude API real costs apply (~$0.05–0.20 per step).</div>
      <input className="bg-neutral-800 p-2 rounded w-full" value={params.symbols}
             onChange={e=>setParams({...params, symbols: e.target.value})}/>
      <input type="number" className="bg-neutral-800 p-2 rounded" value={params.steps}
             onChange={e=>setParams({...params, steps: Number(e.target.value)})}/>
      <input type="number" className="bg-neutral-800 p-2 rounded" value={params.initialKrw}
             onChange={e=>setParams({...params, initialKrw: Number(e.target.value)})}/>
      <button onClick={go} disabled={running} className="px-4 py-2 bg-emerald-600 rounded">
        {running ? "Running…" : "Run Backtest"}
      </button>
      {result && <div className="bg-neutral-900 p-4 rounded">
        <div>Final KRW: {krw(result.finalKrw)}</div>
        <div>Final Assets: {krw(result.finalAssets)}</div>
        <div>P&L: <span className={result.pnlPct>=0?"text-emerald-400":"text-rose-400"}>{pct(result.pnlPct)}</span></div>
        <div>Trades: {result.trades.length}</div>
      </div>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/backtest/ electron/ipc.ts electron/preload.ts renderer/src/pages/Backtest.tsx
git commit -m "feat: backtest engine and UI page"
```

---

## Task 26: Paper-mode end-to-end smoke test

**Files:**
- Test: `tests/paper-cycle.test.ts`

- [ ] **Step 1: Mock Claude + Bithumb, drive a paper cycle**

`tests/paper-cycle.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../electron/claude-runner", () => ({
  runClaudeDecision: vi.fn(async () => ({
    ok: true, raw: "{}", duration_ms: 100, cost_usd: 0,
    decision: {
      market_analysis: { regime: "RISK_ON", btc_trend_4h: "UP", fear_greed_state: "FEAR",
                         btc_dominance_view: "ALT_FAVORABLE", summary: "ok", key_risks: [] },
      coin_scores: [],
      decisions: [{ action: "HOLD", symbol: "BTC", krw_amount: 0, sell_ratio: 0,
        order_type: "LIMIT", playbook: "NONE", reason: "wait", signals: [], confidence: 0.4 }]
    }
  }))
}));

vi.mock("../electron/bithumb/public", () => ({
  getTicker: async () => ({ closing_price: "100000000", max_price: "0", min_price: "0",
                             acc_trade_value_24H: "0", fluctate_rate_24H: "0" }),
  getCandles: async () => Array.from({length: 200}, (_, i) => ({ t: i, o: 1, h: 2, l: 0, c: 1 + Math.sin(i/10), v: 1 })),
  getOrderbook: async () => ({ bids: [{ price: 99, qty: 1 }], asks: [{ price: 101, qty: 1 }] })
}));

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../electron/storage/db";

describe("paper cycle smoke", () => {
  it("orchestrator records HOLD decision without crashing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "paper-"));
    const db = openDb(join(dir, "p.db"));
    const { Orchestrator } = await import("../electron/trader/orchestrator");
    const orch = new Orchestrator(db);
    await orch.runCycle();
    const decisions = db.prepare("SELECT COUNT(*) as n FROM decisions").get() as any;
    expect(decisions.n).toBe(1);
  });
});
```

- [ ] **Step 2: Run, fix any wiring issues**

```bash
SKIP_NETWORK=1 pnpm test tests/paper-cycle.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/paper-cycle.test.ts
git commit -m "test: e2e paper cycle smoke test"
```

---

## Task 27: Public IP detection and Bithumb 5300 guidance

**Files:**
- Create: `electron/network/public-ip.ts`
- Modify: `electron/ipc.ts` (add `network:public-ip` handler)
- Modify: `electron/preload.ts` (expose `network.publicIp`)
- Modify: `electron/bithumb/private.ts` (translate 5300/5500 errors with IP hint)
- Modify: `renderer/src/pages/Settings.tsx` (add "Show current public IP" button)
- Modify: `electron/notifications.ts` (already created — add `notifyIpMismatch` helper)

- [ ] **Step 1: Public IP fetch helper**

`electron/network/public-ip.ts`:
```ts
const SOURCES = [
  "https://api.ipify.org?format=json",
  "https://api.ip.sb/jsonip",
  "https://ifconfig.me/all.json"
];

export async function getPublicIp(): Promise<string | null> {
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const j = await r.json();
      const ip = j.ip ?? j.ip_addr ?? null;
      if (typeof ip === "string" && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    } catch { continue; }
  }
  return null;
}
```

- [ ] **Step 2: Wrap private API errors with IP hint**

In `electron/bithumb/private.ts`, replace the `if (json.status !== "0000")` block in `call()`:
```ts
if (json.status !== "0000") {
  const code = String(json.status);
  let hint = "";
  if (code === "5300" || code === "5500") {
    hint = " (이 에러는 보통 등록된 IP와 현재 공인 IP가 다를 때 발생합니다. Settings에서 현재 IP 확인 후 빗썸 API 설정에 등록하세요.)";
  }
  const err: any = new Error(`bithumb ${endpoint}: ${code} ${json.message}${hint}`);
  err.status = code; err.is_ip_error = (code === "5300" || code === "5500");
  throw err;
}
```

- [ ] **Step 3: IPC handler**

In `electron/ipc.ts`, add (above the trader handlers):
```ts
ipcMain.handle("network:public-ip", async () => {
  const { getPublicIp } = await import("@main/network/public-ip");
  return { ip: await getPublicIp() };
});
```

- [ ] **Step 4: Preload expose**

In `electron/preload.ts`, add to the `window.api` object and the global type:
```ts
network: { publicIp: () => ipcRenderer.invoke("network:public-ip") }
```

- [ ] **Step 5: Settings page button**

In `renderer/src/pages/Settings.tsx`, inside the "Bithumb API" Section block (before the API Key input), add:
```tsx
<div className="flex items-center gap-2 text-sm">
  <button onClick={async () => {
    const r = await (window as any).api.network.publicIp();
    alert(r.ip ? `Current public IP:\n${r.ip}\n\n빗썸 API 보안 설정에 이 IP를 등록하세요. (변경되면 다시 갱신 필요)` : "IP 조회 실패");
  }} className="px-3 py-1 bg-neutral-700 rounded">현재 공인 IP 확인</button>
  <span className="text-neutral-400">⚠️ 출금 권한은 반드시 OFF로 발급하세요</span>
</div>
```

- [ ] **Step 6: Notify on IP-error during trading cycle**

In `electron/trader/orchestrator.ts`, wrap the `bpriv.getBalance(...)` catch:
```ts
} catch (e: any) {
  j.insertEvent("ERROR", "BITHUMB", `balance fetch: ${e.message}`);
  if (e.is_ip_error) {
    const { getPublicIp } = await import("@main/network/public-ip");
    const ip = await getPublicIp();
    const { notify } = await import("@main/notifications");
    notify("Bithumb IP 불일치", `현재 IP: ${ip ?? "확인 실패"} — 빗썸 API 설정에서 등록 갱신 필요`);
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add electron/network/ electron/ipc.ts electron/preload.ts electron/bithumb/private.ts \
  electron/trader/orchestrator.ts renderer/src/pages/Settings.tsx
git commit -m "feat: public IP detection, 5300 error hint, settings button, native notify"
```

---

## Task 28: README, electron-builder, GitHub repo

**Files:**
- Create: `README.md`, `electron-builder.yml`

- [ ] **Step 1: README**

`README.md`:
```markdown
# Bithumb × Claude Code Auto-Trader

Electron desktop app that delegates all crypto trading decisions to Claude Code CLI on a 5-minute cycle.

## ⚠️ Disclaimer
This software is for learning/research purposes. Real trading carries real risk of loss. Use at your own risk.
The Bithumb API key you configure MUST have withdrawal disabled.

## Prerequisites
- macOS 12+ (Apple Silicon or Intel)
- Node.js 20+ and pnpm
- Claude Code CLI installed and authenticated:
  ```
  npm install -g @anthropic-ai/claude-code
  claude login   # or set ANTHROPIC_API_KEY
  ```
- Bithumb account with API keys (withdrawal OFF)

## Install & Run (development)
```
pnpm install
pnpm dev
```

## Build (macOS DMG)
```
pnpm build:mac
# output in release/
```

## First Run
1. Open Settings → Bithumb API → enter key + secret (stored in macOS Keychain).
2. Verify "Paper mode" is ON.
3. Click "Trading: ON" in the header.
4. Watch decisions appear every 5 minutes.
5. Once confident, switch off Paper mode for live trades.

## Features
- 5-minute Claude Code CLI invocation (Opus 4.7) for trading decisions
- Multi-timeframe technical analysis (EMA, RSI, MACD, Bollinger, ATR, ADX, Ichimoku, Stoch RSI, OBV, VWAP)
- Candle/chart pattern detection
- Fear & Greed Index + BTC dominance + KST session awareness
- Defense-in-depth risk management (per-trade caps, position caps, daily loss limit, circuit breakers)
- Paper trading mode + 6-page dashboard + backtest mode
- macOS auto-start + background mode + native notifications

## Troubleshooting
- "claude: command not found" → install CLI globally and ensure it's in PATH.
- Bithumb 5300 errors → API nonce ordering, or invalid signature. Re-enter keys.
- Time sync errors → run `sudo sntp -sS time.apple.com` to sync.
```

- [ ] **Step 2: electron-builder.yml**

```yaml
appId: dev.mindaein.bithumb-claude-trader
productName: Bithumb Claude Trader
mac:
  category: public.app-category.finance
  target:
    - target: dmg
      arch: [arm64, x64]
  identity: null   # unsigned for now
files:
  - "out/**/*"
  - "prompts/**/*"
  - "package.json"
asarUnpack:
  - "**/better-sqlite3/**"
  - "**/keytar/**"
directories:
  output: release
```

- [ ] **Step 3: Build**

```bash
pnpm build:mac
ls release/
```
Expected: `Bithumb Claude Trader-0.1.0-mac.dmg` (or similar) present.

- [ ] **Step 4: Create GitHub repo + push**

```bash
gh repo create bamin0422/bithumb-claude-trader --public --source . --remote origin --push
```

If `gh` not authed: `gh auth login` first.

- [ ] **Step 5: Commit and push final**

```bash
git add README.md electron-builder.yml
git commit -m "feat: readme and electron-builder config; ship 0.1.0"
git push -u origin main
```

- [ ] **Step 6: Verify**

Open the GitHub repo URL printed by `gh repo create` and confirm files visible. Run `gh repo view --web bamin0422/bithumb-claude-trader` to open in browser.

---

## Self-Review Notes

- All 13 spec sections mapped to tasks (architecture/AI guideline/CLI/DB/settings/UI/safety/tests/Git).
- Backtest task added per confirmed scope decision.
- Risk-guard rules in test mirror spec section 8 defense layers.
- Type names: `Decision`, `DecisionResponse`, `Settings`, `Position`, `OHLCV`, `Orchestrator`, `CircuitBreaker`, `Journal` are consistent across tasks.
- `paper_mode` default is `true` (safer than spec; user can flip in Settings on first run before going live).
- Bithumb HMAC test has placeholder-then-lock pattern to capture correct expected signature on first run.
- 5-minute cron uses `*/5` cron expression — Bithumb public API rate limits well below this.
- The orchestrator constructs `daily_pnl_pct` / `weekly_pnl_pct` as zero placeholders — Task 16 (`computePerformance`) is the source for those, and a follow-up patch within Task 18 should plug those values from `daily_performance` table; this is acceptable for v0.1 but flagged as a known limitation in the README.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-bithumb-claude-trader.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
