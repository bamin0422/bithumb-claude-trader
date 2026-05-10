import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@renderer/lib/api";

const STATUS_LABEL: Record<string,string> = {
  OK: "정상", SCHEMA_FAIL: "스키마 실패", TIMEOUT: "시간 초과", BUDGET_BLOCKED: "비용 한도"
};
const HINT_LABEL: Record<string,string> = { BUY: "매수", SELL: "매도", HOLD: "보류" };

export default function Decisions() {
  const [open, setOpen] = useState<number | null>(null);
  const { data = [] } = useQuery({ queryKey: ["decisions", 50], queryFn: () => api.decisions.list(50) });
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">AI 판단 기록</h1>
      <div className="text-sm text-neutral-500">5분마다 Claude가 시장을 분석한 결과입니다. 클릭하면 상세 정보가 펼쳐집니다.</div>
      {(data as any[]).length === 0 ? (
        <div className="bg-neutral-900 rounded p-8 text-center text-neutral-500">
          판단 기록 없음. 거래를 시작하거나 헤더의 "▶ 지금 1회 실행" 버튼을 눌러보세요.
        </div>
      ) : (data as any[]).map((d:any) =>
        <div key={d.id} className="bg-neutral-900 rounded p-3 hover:bg-neutral-900/70 transition">
          <div className="flex justify-between cursor-pointer items-center" onClick={()=>setOpen(open===d.id?null:d.id)}>
            <div className="flex items-center gap-3">
              <span className="text-neutral-400 text-sm">{new Date(d.cycle_at).toLocaleString("ko-KR")}</span>
              <span className="font-semibold">{d.market_view ?? "(요약 없음)"}</span>
              {d.status !== "OK" && <span className="px-2 py-0.5 bg-rose-700 rounded text-xs">{STATUS_LABEL[d.status] ?? d.status}</span>}
            </div>
            <div className="text-sm text-neutral-400">
              공포탐욕 <b>{d.fear_greed ?? "-"}</b>
              {d.btc_dominance != null && <> · BTC도미넌스 <b>{Number(d.btc_dominance).toFixed(1)}%</b></>}
              {d.cost_usd != null && <> · ${Number(d.cost_usd).toFixed(3)}</>}
            </div>
          </div>
          {open === d.id && <div className="mt-3 space-y-3 text-sm">
            {d.error && <div className="bg-rose-900/40 p-2 rounded text-rose-200 text-xs whitespace-pre-wrap">{d.error}</div>}
            {(d.coin_scores ?? []).length > 0 && (
              <table className="w-full">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="text-left">코인</th>
                    <th>점수</th>
                    <th>EMA 상태</th>
                    <th>RSI</th>
                    <th>판단</th>
                    <th>플레이북</th>
                  </tr>
                </thead>
                <tbody>{(d.coin_scores ?? []).map((c:any)=>
                  <tr key={c.symbol} className="border-t border-neutral-800">
                    <td className="font-semibold">{c.symbol}</td>
                    <td className="text-center">{c.score}</td>
                    <td className="text-center text-xs">{c.ema_state}</td>
                    <td className="text-center">{c.rsi_1h?.toFixed?.(1) ?? "-"}</td>
                    <td className="text-center">{HINT_LABEL[c.decision_hint] ?? c.decision_hint}</td>
                    <td className="text-center text-xs">{c.playbook ?? "-"}</td>
                  </tr>)}
                </tbody>
              </table>
            )}
            <details>
              <summary className="text-neutral-500 cursor-pointer text-xs">Claude 원본 응답 보기</summary>
              <pre className="text-xs bg-black p-2 overflow-auto max-h-96 mt-1">{d.claude_raw}</pre>
            </details>
          </div>}
        </div>)}
    </div>
  );
}
