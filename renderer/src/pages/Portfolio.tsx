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
    { name: "원화 (KRW)", value: cash },
    ...positions.map((p: any) => ({ name: p.symbol, value: p.qty * p.current_price }))
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">포트폴리오</h1>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-neutral-900 p-4 rounded h-72">
          <h2 className="text-sm text-neutral-400 mb-2">자산 분포</h2>
          {dist.length === 0 ? (
            <div className="flex items-center justify-center h-full text-neutral-500">자산 정보 없음</div>
          ) : (
            <ResponsiveContainer><PieChart>
              <Pie data={dist} dataKey="value" nameKey="name" outerRadius={90}>
                {dist.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie><Tooltip formatter={(v:any)=>krw(v)}/>
            </PieChart></ResponsiveContainer>
          )}
        </div>
        <div className="bg-neutral-900 p-4 rounded space-y-2">
          <h2 className="text-sm text-neutral-400 mb-2">자산 요약</h2>
          <div className="flex justify-between"><span>총자산</span><b className="text-lg">{krw(snap.total_assets_krw ?? 0)}</b></div>
          <div className="flex justify-between"><span>원화 잔고</span><span>{krw(cash)}</span></div>
          <div className="flex justify-between"><span>코인 평가액</span><span>{krw((snap.total_assets_krw ?? 0) - cash)}</span></div>
          <div className="flex justify-between"><span>일일 수익률</span>
            <span className={(snap.daily_pnl_pct ?? 0)>=0?"text-emerald-400":"text-rose-400"}>{pct(snap.daily_pnl_pct ?? 0)}</span>
          </div>
          <div className="flex justify-between"><span>주간 수익률</span>
            <span className={(snap.weekly_pnl_pct ?? 0)>=0?"text-emerald-400":"text-rose-400"}>{pct(snap.weekly_pnl_pct ?? 0)}</span>
          </div>
        </div>
      </div>
      <div className="bg-neutral-900 p-4 rounded">
        <h2 className="font-semibold mb-2">보유 포지션</h2>
        {positions.length === 0 ? (
          <div className="text-neutral-500 text-sm py-4 text-center">보유 코인 없음</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="text-left p-2">코인</th>
                <th className="text-right p-2">수량</th>
                <th className="text-right p-2">평단가</th>
                <th className="text-right p-2">현재가</th>
                <th className="text-right p-2">수익률</th>
                <th className="text-right p-2">손절/익절</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p:any) => {
                const pnl = ((p.current_price - p.avg_price) / p.avg_price) * 100;
                return <tr key={p.symbol} className="border-t border-neutral-800">
                  <td className="p-2 font-semibold">{p.symbol}</td>
                  <td className="text-right">{Number(p.qty).toFixed(4)}</td>
                  <td className="text-right">{krw(p.avg_price)}</td>
                  <td className="text-right">{krw(p.current_price)}</td>
                  <td className={"text-right " + (pnl>=0?"text-emerald-400":"text-rose-400")}>{pct(pnl)}</td>
                  <td className="text-right text-xs text-neutral-400">
                    {p.stop_loss_price?krw(p.stop_loss_price):"-"} / {p.take_profit_price?krw(p.take_profit_price):"-"}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
