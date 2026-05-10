import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@renderer/lib/api";
import { krw } from "@renderer/lib/format";

const ACTION_LABEL: Record<string,string> = { ALL:"전체", BUY:"매수", SELL:"매도", HOLD:"보류" };
const RESULT_LABEL: Record<string,string> = {
  FILLED:"체결", PARTIAL:"부분체결", REJECTED:"거부", ERROR:"오류", PAPER:"페이퍼"
};

export default function TradeLog() {
  const [filter, setFilter] = useState<string>("ALL");
  const { data = [] } = useQuery({ queryKey: ["trades", 200], queryFn: () => api.trades.list(200) });
  const filtered = (data as any[]).filter((t: any) => filter === "ALL" || t.action === filter);
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">거래 내역</h1>
        <div className="space-x-2">
          {["ALL","BUY","SELL"].map(f=>
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-3 py-1 rounded ${filter===f?"bg-neutral-700":"bg-neutral-800"}`}>
              {ACTION_LABEL[f]}
            </button>)}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="bg-neutral-900 rounded p-8 text-center text-neutral-500">
          거래 기록 없음
        </div>
      ) : (
        <table className="w-full text-sm bg-neutral-900 rounded">
          <thead className="text-neutral-400">
            <tr>
              <th className="text-left p-2">시각</th>
              <th>구분</th>
              <th>코인</th>
              <th className="text-right">금액 (KRW)</th>
              <th>결과</th>
              <th className="text-right">신뢰도</th>
              <th>근거</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t:any)=>
              <tr key={t.id} className="border-t border-neutral-800">
                <td className="p-2 text-xs">{new Date(t.attempted_at).toLocaleString("ko-KR")}</td>
                <td className={t.action==="BUY"?"text-emerald-400 font-semibold":t.action==="SELL"?"text-rose-400 font-semibold":""}>
                  {ACTION_LABEL[t.action] ?? t.action}
                </td>
                <td className="font-semibold">{t.symbol}</td>
                <td className="text-right">{krw(t.krw_amount ?? 0)}</td>
                <td className={t.result==="FILLED"?"text-emerald-400":t.result==="REJECTED"?"text-rose-400":"text-neutral-400"}>
                  {RESULT_LABEL[t.result] ?? t.result}
                  {t.risk_check?.startsWith("BLOCKED")?<div className="text-xs text-rose-300">{t.risk_check.replace("BLOCKED:","")}</div>:""}
                </td>
                <td className="text-right">{Number(t.confidence).toFixed(2)}</td>
                <td className="text-neutral-300 text-xs max-w-md truncate" title={t.reason}>{t.reason}</td>
              </tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}
