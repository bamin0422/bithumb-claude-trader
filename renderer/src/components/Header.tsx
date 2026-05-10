import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@renderer/lib/api";
import { krw, pct } from "@renderer/lib/format";

export default function Header() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get() });
  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api.portfolio.current() });
  const total = portfolio.data?.snapshot?.total_assets_krw ?? 0;
  const dp = portfolio.data?.snapshot?.daily_pnl_pct ?? 0;
  const enabled = settings.data?.trading_enabled ?? false;
  const paper = settings.data?.paper_mode ?? false;

  async function toggle() {
    if (enabled) await api.trader.stop(); else await api.trader.start();
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function runNow() {
    setRunning(true);
    try {
      await api.trader.runNow();
      qc.invalidateQueries();
    } catch (e: any) {
      alert(`수동 실행 실패: ${e?.message ?? e}`);
    } finally {
      setRunning(false);
    }
  }
  async function panic() {
    if (!confirm("긴급 정지 — 모든 거래를 즉시 중지하고 거래를 비활성화합니다.\n\n계속하시겠습니까?")) return;
    await api.trader.emergencyStop();
    qc.invalidateQueries();
  }
  return (
    <header className="flex items-center justify-between border-b border-neutral-800 p-3">
      <div className="flex items-center gap-3">
        <button onClick={toggle}
          className={`px-4 py-2 rounded font-semibold ${enabled ? "bg-emerald-600" : "bg-neutral-700"}`}>
          {enabled ? "🟢 거래: ON" : "⚫ 거래: OFF"}
        </button>
        {paper && <span className="px-2 py-1 bg-amber-700 rounded text-xs font-semibold">📝 페이퍼</span>}
        <button onClick={runNow} disabled={running}
          className="px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded text-sm">
          {running ? "분석 중…" : "▶ 지금 1회 실행"}
        </button>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-sm">총자산: <b className="text-base">{krw(total)}</b></div>
        <div className={`text-sm ${dp >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          오늘: <b>{pct(dp)}</b>
        </div>
        <button onClick={panic} className="px-3 py-2 bg-rose-700 hover:bg-rose-600 rounded text-sm font-bold">
          🚨 긴급 정지
        </button>
      </div>
    </header>
  );
}
