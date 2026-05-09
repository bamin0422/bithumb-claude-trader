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
