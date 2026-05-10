import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@renderer/lib/api";

const RISK_LABELS: Record<string, string> = {
  max_buy_ratio: "1회 최대 매수 비율 (가용 KRW 대비)",
  max_position_ratio: "코인당 최대 보유 비율 (총자산 대비)",
  daily_loss_limit_pct: "일일 손실 한도 (%)",
  stop_loss_pct: "손절 % (-)",
  take_profit_pct: "익절 % (+)",
  max_concurrent_positions: "최대 동시 보유 종목 수",
  min_confidence_to_trade: "거래 최소 신뢰도 (0~1)",
  max_drawdown_circuit_breaker_pct: "주간 MDD 회로차단기 (%)"
};

export default function Settings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get() });
  const [form, setForm] = useState<any>(null);
  const [saved, setSaved] = useState<string>("");
  const [bk, setBk] = useState({ key: "", secret: "" });

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (isLoading) return <div className="p-4 text-neutral-400">설정 불러오는 중…</div>;
  if (error) return <div className="p-4 text-rose-400">설정 로드 실패: {String(error)}</div>;
  if (!form) return <div className="p-4 text-neutral-400">초기화 중…</div>;

  async function save() {
    try {
      await api.settings.update(form);
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved("저장 완료 ✓");
      setTimeout(() => setSaved(""), 2000);
    } catch (e: any) {
      setSaved(`저장 실패: ${e?.message ?? e}`);
    }
  }
  async function saveKeys() {
    if (!bk.key || !bk.secret) { setSaved("API Key와 Secret 둘 다 필요합니다"); return; }
    try {
      await api.bithumb.setKeys(bk.key, bk.secret);
      setBk({ key: "", secret: "" });
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved("API 키가 macOS Keychain에 저장되었습니다 ✓");
      setTimeout(() => setSaved(""), 3000);
    } catch (e: any) {
      setSaved(`키 저장 실패: ${e?.message ?? e}`);
    }
  }
  async function checkIp() {
    try {
      const r = await (window as any).api.network.publicIp();
      if (r.ip) {
        await navigator.clipboard.writeText(r.ip).catch(()=>{});
        alert(`현재 공인 IP:\n\n${r.ip}\n\n(클립보드에 복사됨)\n\n빗썸 API 발급 시 이 IP를 등록하세요.\nIP가 바뀌면 빗썸 보안설정에서 갱신 필요.`);
      } else {
        alert("IP 조회 실패. 인터넷 연결을 확인하세요.");
      }
    } catch (e: any) {
      alert(`IP 조회 실패: ${e?.message ?? e}`);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">설정</h1>
      {saved && <div className="bg-emerald-700 px-3 py-2 rounded">{saved}</div>}

      <Section title="일반">
        <Toggle label="페이퍼 트레이딩 모드 (실거래 안 함, 시뮬만)"
          v={form.paper_mode} on={v=>setForm({...form, paper_mode: v})}/>
        <Toggle label="macOS 로그인 시 자동 실행"
          v={form.auto_start_on_login} on={v=>setForm({...form, auto_start_on_login: v})}/>
        <Toggle label="백그라운드 실행 (창 숨김)"
          v={form.run_in_background} on={v=>setForm({...form, run_in_background: v})}/>
        <Field label="거래 결정 주기 (분, 1~60)" type="number" v={form.decision_interval_min}
          on={v=>setForm({...form, decision_interval_min: Number(v)})}/>
      </Section>

      <Section title="감시 코인 (쉼표로 구분)">
        <input className="w-full bg-neutral-800 p-2 rounded"
          value={form.watch_symbols.join(",")}
          onChange={e=>setForm({...form, watch_symbols: e.target.value.split(",").map((s: string)=>s.trim().toUpperCase()).filter(Boolean)})}/>
        <div className="text-xs text-neutral-500">예: BTC, ETH, XRP, SOL, DOGE, WLD</div>
      </Section>

      <Section title="위험 관리">
        <div className="text-xs text-amber-400 mb-2">⚠️ 현재 기본값은 공격적 설정입니다. 실거래 전 보수적으로 조정 권장.</div>
        {Object.entries(form.risk).map(([k,v])=>
          <Field key={k} label={RISK_LABELS[k] ?? k} type="number" v={v as number}
            on={x=>setForm({...form, risk: {...form.risk, [k]: Number(x)}})}/>)}
      </Section>

      <Section title="Claude CLI">
        <Field label="모델" v={form.claude.model}
          on={v=>setForm({...form, claude:{...form.claude, model: v}})}/>
        <Field label="타임아웃 (ms)" type="number" v={form.claude.timeout_ms}
          on={v=>setForm({...form, claude:{...form.claude, timeout_ms: Number(v)}})}/>
        <div className="text-xs text-neutral-500">claude-opus-4-7 (강력) / claude-sonnet-4-6 (저렴) / claude-haiku-4-5 (최저비용)</div>
      </Section>

      <Section title="빗썸 API">
        <div className={`text-sm mb-2 ${form.bithumb.api_key_set ? "text-emerald-400" : "text-rose-400"}`}>
          상태: {form.bithumb.api_key_set ? "✅ macOS Keychain에 저장됨" : "❌ 미설정"}
        </div>
        <div className="flex items-center gap-2 text-sm mb-3 flex-wrap">
          <button onClick={checkIp} className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded">
            🌐 현재 공인 IP 확인
          </button>
          <span className="text-amber-400">⚠️ 출금 권한 OFF 필수, 등록 IP 5개까지</span>
        </div>
        <div className="space-y-2">
          <input className="w-full bg-neutral-800 p-2 rounded font-mono" placeholder="API Key (Connect Key)"
            value={bk.key} onChange={e=>setBk({...bk, key: e.target.value})}/>
          <input className="w-full bg-neutral-800 p-2 rounded font-mono" placeholder="API Secret (Secret Key)" type="password"
            value={bk.secret} onChange={e=>setBk({...bk, secret: e.target.value})}/>
        </div>
        <div className="space-x-2 mt-2">
          <button onClick={saveKeys} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded">키 저장</button>
          <button onClick={()=>api.bithumb.clearKeys().then(()=>{qc.invalidateQueries({queryKey:["settings"]}); setSaved("API 키가 삭제되었습니다");})}
            className="px-4 py-2 bg-rose-700 hover:bg-rose-600 rounded">키 삭제</button>
        </div>
        <Toggle label="시장가 주문 사용 (off면 지정가)"
          v={form.bithumb.use_market_orders}
          on={v=>setForm({...form, bithumb: {...form.bithumb, use_market_orders: v}})}/>
        <Field label="시장가 사용 가능 최대 스프레드 %" type="number"
          v={form.bithumb.max_spread_pct_for_market}
          on={x=>setForm({...form, bithumb: {...form.bithumb, max_spread_pct_for_market: Number(x)}})}/>
      </Section>

      <Section title="알림">
        <Toggle label="거래 체결 시 알림" v={form.notifications.on_trade}
          on={v=>setForm({...form, notifications: {...form.notifications, on_trade: v}})}/>
        <Toggle label="에러 발생 시 알림" v={form.notifications.on_error}
          on={v=>setForm({...form, notifications: {...form.notifications, on_error: v}})}/>
        <Toggle label="회로차단기 작동 시 알림" v={form.notifications.on_circuit_breaker}
          on={v=>setForm({...form, notifications: {...form.notifications, on_circuit_breaker: v}})}/>
      </Section>

      <div className="sticky bottom-4 flex justify-end">
        <button onClick={save} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold shadow-lg">
          💾 설정 저장
        </button>
      </div>
    </div>
  );
}

function Section({title,children}:{title:string;children:any}) {
  return <section className="bg-neutral-900 p-4 rounded space-y-3 border border-neutral-800">
    <h2 className="font-semibold text-lg">{title}</h2>{children}
  </section>;
}
function Toggle({label,v,on}:{label:string;v:boolean;on:(v:boolean)=>void}) {
  return <label className="flex justify-between items-center cursor-pointer hover:bg-neutral-800/40 rounded px-2 py-1">
    <span className="text-sm">{label}</span>
    <input type="checkbox" checked={v} onChange={e=>on(e.target.checked)} className="h-5 w-5 cursor-pointer"/>
  </label>;
}
function Field({label,v,on,type="text"}:{label:string;v:any;on:(v:any)=>void;type?:string}) {
  return <label className="flex justify-between gap-3 items-center px-2">
    <span className="text-sm">{label}</span>
    <input type={type} value={v} onChange={e=>on(e.target.value)}
      className="bg-neutral-800 p-1 rounded w-44 text-right font-mono"/>
  </label>;
}
