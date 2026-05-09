import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@renderer/lib/api";

export default function Decisions() {
  const [open, setOpen] = useState<number | null>(null);
  const { data = [] } = useQuery({ queryKey: ["decisions", 50], queryFn: () => api.decisions.list(50) });
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Decisions</h1>
      {(data as any[]).map((d:any) =>
        <div key={d.id} className="bg-neutral-900 rounded p-3">
          <div className="flex justify-between cursor-pointer" onClick={()=>setOpen(open===d.id?null:d.id)}>
            <div>
              <span className="text-neutral-400 text-sm">{new Date(d.cycle_at).toLocaleString("ko-KR")}</span>
              <span className="ml-3 font-semibold">{d.market_view}</span>
            </div>
            <div className="text-sm text-neutral-400">F&amp;G {d.fear_greed} · BTC.D {d.btc_dominance?.toFixed?.(1)}% · {d.status}</div>
          </div>
          {open === d.id && <div className="mt-3 space-y-2 text-sm">
            <table className="w-full">
              <thead className="text-neutral-400"><tr><th className="text-left">Symbol</th><th>Score</th><th>EMA</th><th>RSI</th><th>Hint</th><th>Playbook</th></tr></thead>
              <tbody>{(d.coin_scores ?? []).map((c:any)=>
                <tr key={c.symbol} className="border-t border-neutral-800">
                  <td>{c.symbol}</td><td>{c.score}</td><td>{c.ema_state}</td>
                  <td>{c.rsi_1h?.toFixed?.(1)}</td><td>{c.decision_hint}</td><td>{c.playbook}</td>
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
