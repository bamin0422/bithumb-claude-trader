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
