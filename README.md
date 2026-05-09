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

## IP Whitelisting (Bithumb API Security)

Bithumb requires you to register your server's public IP address in the API settings before the key will work.

- **Max 5 IPs** can be registered per API key on Bithumb.
- To find your current public IP: open Settings → Bithumb API section → click **"현재 공인 IP 확인"** (Check current public IP). The app fetches your IP from multiple sources and displays it in an alert.
- After finding your IP, go to [Bithumb API Management](https://www.bithumb.com/user/membership/management_api) and add the IP under "허용 IP 주소".
- If your ISP assigns a dynamic IP (most home connections), your IP may change. Re-check and update after any network change.

## Troubleshooting
- "claude: command not found" → install CLI globally and ensure it's in PATH.
- Bithumb **5300 / 5500 errors** → Your current public IP is not whitelisted. Open Settings → click "현재 공인 IP 확인" to see your current IP, then register it in the [Bithumb API settings](https://www.bithumb.com/user/membership/management_api). The app will also send a macOS notification with your current IP when this error is detected during a trading cycle.
- Bithumb 5100 errors → API nonce ordering, or invalid signature. Re-enter keys.
- Time sync errors → run `sudo sntp -sS time.apple.com` to sync.
