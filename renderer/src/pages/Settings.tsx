import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@renderer/lib/api";

export default function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get() });
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (data && !form) setForm(data); }, [data]);
  const [bk, setBk] = useState({ key: "", secret: "" });

  if (!form) return <div>Loading…</div>;
  async function save() {
    await api.settings.update(form);
    qc.invalidateQueries({ queryKey: ["settings"] });
    alert("Saved");
  }
  async function saveKeys() {
    if (!bk.key || !bk.secret) return;
    await api.bithumb.setKeys(bk.key, bk.secret);
    setBk({ key: "", secret: "" });
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="General">
        <Toggle label="Paper mode" v={form.paper_mode} on={v=>setForm({...form, paper_mode: v})}/>
        <Toggle label="Auto start on login" v={form.auto_start_on_login} on={v=>setForm({...form, auto_start_on_login: v})}/>
        <Toggle label="Run in background" v={form.run_in_background} on={v=>setForm({...form, run_in_background: v})}/>
        <Field label="Decision interval (min)" type="number" v={form.decision_interval_min}
               on={v=>setForm({...form, decision_interval_min: Number(v)})}/>
      </Section>

      <Section title="Watch Symbols (comma separated)">
        <input className="w-full bg-neutral-800 p-2 rounded"
               value={form.watch_symbols.join(",")}
               onChange={e=>setForm({...form, watch_symbols: e.target.value.split(",").map((s: string)=>s.trim().toUpperCase()).filter(Boolean)})}/>
      </Section>

      <Section title="Risk">
        {Object.entries(form.risk).map(([k,v])=>
          <Field key={k} label={k} type="number" v={v as number}
                 on={x=>setForm({...form, risk: {...form.risk, [k]: Number(x)}})}/>)}
      </Section>

      <Section title="Claude">
        <Field label="Model" v={form.claude.model}
               on={v=>setForm({...form, claude:{...form.claude, model: v}})}/>
        <Field label="Timeout (ms)" type="number" v={form.claude.timeout_ms}
               on={v=>setForm({...form, claude:{...form.claude, timeout_ms: Number(v)}})}/>
      </Section>

      <Section title="Bithumb API">
        <div className="text-sm text-neutral-400 mb-2">
          Status: {form.bithumb.api_key_set ? "✅ Stored in macOS Keychain" : "❌ Not set"}
        </div>
        <input className="w-full bg-neutral-800 p-2 rounded mb-2" placeholder="API Key"
               value={bk.key} onChange={e=>setBk({...bk, key: e.target.value})}/>
        <input className="w-full bg-neutral-800 p-2 rounded mb-2" placeholder="API Secret" type="password"
               value={bk.secret} onChange={e=>setBk({...bk, secret: e.target.value})}/>
        <div className="space-x-2">
          <button onClick={saveKeys} className="px-4 py-2 bg-emerald-600 rounded">Save Keys</button>
          <button onClick={()=>api.bithumb.clearKeys().then(()=>qc.invalidateQueries({queryKey:["settings"]}))}
            className="px-4 py-2 bg-rose-700 rounded">Clear</button>
        </div>
        <Toggle label="Use market orders" v={form.bithumb.use_market_orders}
          on={v=>setForm({...form, bithumb: {...form.bithumb, use_market_orders: v}})}/>
      </Section>

      <button onClick={save} className="px-6 py-3 bg-emerald-600 rounded font-bold">Save Settings</button>
    </div>
  );
}

function Section({title,children}:{title:string;children:any}) {
  return <section className="bg-neutral-900 p-4 rounded space-y-3">
    <h2 className="font-semibold">{title}</h2>{children}
  </section>;
}
function Toggle({label,v,on}:{label:string;v:boolean;on:(v:boolean)=>void}) {
  return <label className="flex justify-between"><span>{label}</span>
    <input type="checkbox" checked={v} onChange={e=>on(e.target.checked)}/></label>;
}
function Field({label,v,on,type="text"}:{label:string;v:any;on:(v:any)=>void;type?:string}) {
  return <label className="flex justify-between gap-3"><span>{label}</span>
    <input type={type} value={v} onChange={e=>on(e.target.value)} className="bg-neutral-800 p-1 rounded w-40"/></label>;
}
