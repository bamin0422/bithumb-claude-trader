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
