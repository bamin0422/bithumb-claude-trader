import { useState } from "react";
import { api } from "@renderer/lib/api";
import { krw, pct } from "@renderer/lib/format";

export default function Backtest() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [params, setParams] = useState({
    symbols: "BTC,ETH,XRP,SOL,DOGE,WLD",
    steps: 30,
    initialKrw: 1_000_000
  });

  async function go() {
    setRunning(true); setResult(null); setError("");
    try {
      const r = await (window as any).api.backtest.run({
        symbols: params.symbols.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean),
        steps: Number(params.steps),
        initialKrw: Number(params.initialKrw)
      });
      setResult(r);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setRunning(false); }
  }

  const estimatedCost = (Number(params.steps) * 0.10).toFixed(2);

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">백테스트</h1>
      <div className="bg-amber-900/30 border border-amber-700 rounded p-3 text-sm">
        ⚠️ <b>주의:</b> 백테스트는 과거 데이터에 Claude API를 실제로 호출하므로 <b>비용이 발생</b>합니다.
        <br/>스텝 수 × 약 $0.05~0.20 (Opus 모델 기준) — 현재 설정 예상 비용: <b>~${estimatedCost}</b>
      </div>

      <div className="bg-neutral-900 p-4 rounded space-y-3">
        <label className="block">
          <span className="text-sm text-neutral-400">테스트할 코인 (쉼표 구분)</span>
          <input className="bg-neutral-800 p-2 rounded w-full mt-1" value={params.symbols}
            onChange={e=>setParams({...params, symbols: e.target.value})}/>
        </label>
        <label className="block">
          <span className="text-sm text-neutral-400">시뮬레이션 스텝 수 (각 스텝 = 1캔들 진행)</span>
          <input type="number" className="bg-neutral-800 p-2 rounded w-full mt-1" value={params.steps}
            onChange={e=>setParams({...params, steps: Number(e.target.value)})}/>
        </label>
        <label className="block">
          <span className="text-sm text-neutral-400">초기 자본 (KRW)</span>
          <input type="number" className="bg-neutral-800 p-2 rounded w-full mt-1" value={params.initialKrw}
            onChange={e=>setParams({...params, initialKrw: Number(e.target.value)})}/>
        </label>
        <button onClick={go} disabled={running}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded font-bold">
          {running ? "백테스트 실행 중…" : "▶ 백테스트 시작"}
        </button>
      </div>

      {error && (
        <div className="bg-rose-900/40 border border-rose-700 p-3 rounded text-sm text-rose-200">
          백테스트 실패: {error}
        </div>
      )}

      {result && (
        <div className="bg-neutral-900 p-4 rounded space-y-2">
          <h2 className="font-semibold mb-2">결과</h2>
          <div className="flex justify-between"><span>최종 원화 잔고</span><b>{krw(result.finalKrw)}</b></div>
          <div className="flex justify-between"><span>최종 총자산 (코인 평가 포함)</span><b>{krw(result.finalAssets)}</b></div>
          <div className="flex justify-between"><span>수익률</span>
            <b className={result.pnlPct>=0?"text-emerald-400 text-lg":"text-rose-400 text-lg"}>
              {pct(result.pnlPct)}
            </b>
          </div>
          <div className="flex justify-between"><span>총 거래 수</span><b>{result.trades.length}</b></div>
          {result.trades.length > 0 && (
            <details className="mt-3">
              <summary className="text-sm text-neutral-400 cursor-pointer">거래 상세 보기</summary>
              <table className="w-full text-xs mt-2">
                <thead className="text-neutral-400">
                  <tr><th className="text-left">스텝</th><th>구분</th><th>코인</th><th>수량</th><th>가격</th></tr>
                </thead>
                <tbody>
                  {result.trades.map((t: any, i: number) =>
                    <tr key={i} className="border-t border-neutral-800">
                      <td>{t.step}</td>
                      <td className={t.action==="BUY"?"text-emerald-400":"text-rose-400"}>
                        {t.action==="BUY"?"매수":"매도"}
                      </td>
                      <td>{t.symbol}</td>
                      <td>{Number(t.qty).toFixed(4)}</td>
                      <td>{krw(t.price)}</td>
                    </tr>)}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
