import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@renderer/lib/api";
import { krw } from "@renderer/lib/format";

export default function TradeLog() {
  const [filter, setFilter] = useState<string>("ALL");
  const { data = [] } = useQuery({ queryKey: ["trades", 200], queryFn: () => api.trades.list(200) });
  const filtered = (data as any[]).filter((t: any) => filter === "ALL" || t.action === filter);
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
