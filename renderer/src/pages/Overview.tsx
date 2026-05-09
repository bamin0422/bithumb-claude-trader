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
