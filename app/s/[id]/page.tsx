'use client';

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

/* =================== Helpers & konstante =================== */

const RATIO = 0.65;
const COLORS = ['#2563eb','#f59e0b','#10b981','#ef4444'] as const; // 1S..4S
const fmt0 = (n:number)=>new Intl.NumberFormat('hr-HR',{maximumFractionDigits:0}).format(Math.round(n||0));

type TypeState = { id:string; code:string; neto:number; share:number; locked?: boolean; desc?: string };
type ConfRow = {
  id: string;
  name: string;
  created_at: string;
  project_id?: string | null;
  brp_limit?: number | null;
  ratio?: number | null;
  tolerance?: number | null;
  source?: string | null;
  client_key?: string | null;
  client_name?: string | null;
};

function defaultDesc(code: string) {
  switch (code) {
    case '1S': return 'Studio / garsonjera (bez spavaće sobe)';
    case '2S': return 'Dnevni + 1 spavaća';
    case '3S': return 'Dnevni + 2 spavaće';
    case '4S': return 'Dnevni + 3 spavaće';
    default:   return '';
  }
}
function netoRange(code: string): [number, number] {
  switch (code) {
    case '1S': return [25, 35];
    case '2S': return [35, 55];
    case '3S': return [55, 75];
    case '4S': return [75, 120];
    default:   return [20, 200];
  }
}
function normalizeShares(arr: TypeState[], pinnedId?: string) {
  const lockedSum = arr.filter(t => t.locked).reduce((s, t) => s + (Number(t.share)||0), 0);
  const pinned = pinnedId ? arr.find(t => t.id === pinnedId) : undefined;
  const pinnedShare = pinned && !pinned.locked ? (Number(pinned.share)||0) : 0;
  const free = arr.filter(t => !t.locked && t.id !== pinnedId);
  const freeSum = free.reduce((s, t) => s + (Number(t.share)||0), 0);
  const targetFree = Math.max(0, 100 - lockedSum - pinnedShare);
  if (free.length === 0 || freeSum === 0) return arr;
  return arr.map(t => (t.locked || t.id === pinnedId)
    ? t
    : { ...t, share: (Number(t.share)||0) / freeSum * targetFree }
  );
}
function LockIcon({ locked, className }: { locked: boolean; className?: string }) {
  return locked ? (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M12 1a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v3h6V6a3 3 0 0 0-3-3Z"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M17 9h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h9V6a3 3 0 0 0-5.464-1.732 1 1 0 0 1-1.732-1A5 5 0 0 1 17 6v3Z"/>
    </svg>
  );
}

/* =================== Komponenta =================== */

export default function SharePage({ params }: { params: { id: string } }) {
  const projectId = params.id;

  const [name, setName] = useState("Projekt");
  const [brpLimit, setBrpLimit] = useState(12500);
  const [types, setTypes] = useState<TypeState[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  const [clientKey, setClientKey] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');

  const [confs, setConfs] = useState<ConfRow[]>([]);
  const [loadingConfs, setLoadingConfs] = useState(false);
  const [notice, setNotice] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);

  /* --- client key/name --- */
  useEffect(() => {
    let key = localStorage.getItem('client_key');
    if (!key) {
      key = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())+Math.random().toString(36).slice(2);
      localStorage.setItem('client_key', key);
    }
    setClientKey(key);
    setClientName(localStorage.getItem('client_name') || '');
  }, []);

  /* --- fetch projekt + tipovi --- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true); setErr(null);

        const { data: proj, error: ep } = await supabase
          .from("projects")
          .select("name, brp_limit")
          .eq("id", projectId)
          .single();
        if (ep) throw ep;

        const { data, error } = await supabase
          .from("project_unit_types")
          .select("id, code, description, neto, share, idx")
          .eq("project_id", projectId)
          .order("idx", { ascending: true });
        if (error) throw error;

        const rows = (data ?? []) as Array<{id:string; code:string; description:string|null; neto:number; share:number}>;

        const initial: TypeState[] = rows.map(r => {
          const [minN, maxN] = netoRange(r.code);
          const netoClamped = Math.max(minN, Math.min(maxN, Math.round(r.neto)));
          return {
            id: r.id,
            code: r.code,
            neto: netoClamped,
            share: Number(r.share) || 0,
            locked: false,
            desc: r.description ?? defaultDesc(r.code)
          };
        });

        const initialNormalized = normalizeShares(initial);
        setName(proj.name);
        setBrpLimit(proj.brp_limit ?? 12500);
        if (!alive) return;
        setTypes(initialNormalized);

      } catch (e:any) {
        if (alive) setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  /* --- fetch konfiguracije --- */
  async function fetchConfs() {
    try {
      setLoadingConfs(true);
      const { data, error } = await supabase
        .from("configurations")
        .select("id, name, created_at, project_id, brp_limit, ratio, tolerance, source, client_key, client_name")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setConfs(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingConfs(false);
    }
  }
  useEffect(() => { fetchConfs(); }, [projectId]);

  /* --- kalkulacija --- */
  const calc = useMemo(() => {
    const items = types.map(t => {
      const brpPerUnit   = Math.max(1, Math.round((t.neto||0)/RATIO));
      const netoPerUnit  = Math.round(brpPerUnit*RATIO);
      const brpTarget    = brpLimit * ((Number(t.share)||0) / 100);
      const units        = Math.max(0, Math.round(brpTarget / brpPerUnit));
      const achievedBrp  = units * brpPerUnit;
      return { ...t, brpPerUnit, netoPerUnit, brpTarget, units, achievedBrp, share: Number(t.share)||0 };
    });
    return {
      items,
      totalAchieved: items.reduce((s,i)=>s+i.achievedBrp,0),
      totalNeto:     items.reduce((s,i)=>s+i.netoPerUnit*i.units,0)
    };
  }, [types, brpLimit]);

  /* --- promjene --- */
  function changeUnits(id: string, unitsIn: number) {
    const targetUnits = Math.max(0, Math.round(Number(unitsIn) || 0));
    setTypes(prev => {
      const t = prev.find(x => x.id === id);
      if (!t) return prev;
      const bpu = Math.max(1, Math.round((t.neto || 0) / RATIO));
      const newShare = (bpu * targetUnits) / Math.max(1, brpLimit) * 100;

      const updated = prev.map(x => x.id === id ? { ...x, share: newShare } : x);
      const normalized = normalizeShares(updated, id)
        .map(y => ({ ...y, share: Math.round((Number(y.share)||0) * 100) / 100 }));
      return normalized;
    });
  }
  function changeNetoStep(id: string, delta: number) {
    setTypes(prev => {
      const t = prev.find(x => x.id===id);
      if (!t) return prev;
      const [minN, maxN] = netoRange(t.code);
      const next = Math.max(minN, Math.min(maxN, Math.round(t.neto + delta)));
      return prev.map(x => x.id===id ? { ...x, neto: next } : x);
    });
  }

  /* --- XLS export --- */
  async function exportXLS() {
    try {
      const XLSX = await import('xlsx');
      const rows = calc.items.map(i => ({
        TIP: i.code,
        NETO_po_stanu_m2: i.netoPerUnit,
        BRP_po_stanu_m2: i.brpPerUnit,
        "UDJEL_%": Math.round(i.share),
        BROJ_STANOVA: i.units,
        NETO_ukupno_m2: i.netoPerUnit * i.units,
        BRP_ukupno_m2: i.achievedBrp
      }));
      rows.push({ TIP: 'UKUPNO', NETO_ukupno_m2: calc.totalNeto, BRP_ukupno_m2: calc.totalAchieved } as any);
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Konfiguracija');
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buf], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(name || 'projekt').replace(/\s+/g,'_')}_klijent.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  /* --- klijent konfiguracije (save/load/rename/delete) --- */
  async function saveClientConfig() {
    try {
      const defaultName = `Konfiguracija ${new Date().toLocaleString('hr-HR')}`;
      const confName = window.prompt("Naziv konfiguracije:", defaultName);
      if (!confName) return;

      localStorage.setItem('client_name', clientName || '');

      setSaving(true); setNotice(null);

      const { data: conf, error: e1 } = await supabase
        .from("configurations")
        .insert({
          project_id: projectId,
          name: confName,
          brp_limit: brpLimit,
          ratio: RATIO,
          tolerance: 50,
          source: 'client',
          client_key: clientKey || null,
          client_name: clientName || null
        })
        .select("id, name, created_at, project_id, brp_limit, ratio, tolerance, source, client_key, client_name")
        .single();
      if (e1) throw e1;

      const itemsPayload = calc.items.map(i => ({
        configuration_id: conf.id,
        project_unit_type_id: i.id,
        share: Math.round((i.share||0)*100)/100,
        units: i.units,
        neto_per_unit: i.netoPerUnit,
        brp_per_unit: i.brpPerUnit
      }));
      const { error: e2 } = await supabase.from("configuration_items").insert(itemsPayload);
      if (e2) throw e2;

      setNotice("Konfiguracija spremljena.");
      await fetchConfs();
    } catch (e:any) {
      setNotice(`Greška pri spremanju: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(()=>setNotice(null),3500);
    }
  }
  async function loadConfig(conf: ConfRow) {
    try {
      const { data: items, error } = await supabase
        .from("configuration_items")
        .select("project_unit_type_id, units, neto_per_unit")
        .eq("configuration_id", conf.id);
      if (error) throw error;

      const byId = new Map(items?.map((r:any)=>[r.project_unit_type_id, r]));
      setBrpLimit(conf.brp_limit ?? brpLimit);

      setTypes(prev => {
        const next = prev.map(t => {
          const row = byId.get(t.id);
          if (!row) return t;
          const [minN, maxN] = netoRange(t.code);
          const netoClamped = Math.max(minN, Math.min(maxN, Math.round(Number(row.neto_per_unit) || t.neto)));
          const bpu = Math.max(1, Math.round(netoClamped / RATIO));
          const share = (Math.max(0, Math.round(Number(row.units) || 0)) * bpu) / Math.max(1, (conf.brp_limit ?? brpLimit)) * 100;
          return { ...t, neto: netoClamped, share };
        });
        return normalizeShares(next);
      });

      setNotice(`Učitana: ${conf.name}`);
      setTimeout(()=>setNotice(null),2500);
    } catch (e:any) {
      setNotice(`Greška pri učitavanju: ${e?.message ?? e}`);
      setTimeout(()=>setNotice(null),3500);
    }
  }
  async function deleteConfig(conf: ConfRow) {
    if (!clientKey || conf.client_key !== clientKey) return;
    if (!window.confirm("Obrisati konfiguraciju?")) return;
    try {
      const { error } = await supabase
        .from("configurations")
        .delete()
        .eq("id", conf.id)
        .eq("client_key", clientKey);
      if (error) throw error;

      setConfs(prev => prev.filter(x => x.id !== conf.id));
      setNotice("Konfiguracija obrisana.");
      setTimeout(() => setNotice(null), 2500);
    } catch (e: any) {
      setNotice(`Greška pri brisanju: ${e?.message ?? e}`);
      setTimeout(() => setNotice(null), 3500);
    }
  }
  async function renameConfig(c: ConfRow) {
    const current = c.name || "Konfiguracija";
    const nextName = window.prompt("Novi naziv konfiguracije:", current)?.trim();
    if (!nextName || nextName === current) return;

    try {
      const { error } = await supabase
        .from("configurations")
        .update({ name: nextName })
        .eq("id", c.id)
        .eq("client_key", clientKey);
      if (error) throw error;

      setConfs(prev => prev.map(x => (x.id === c.id ? { ...x, name: nextName } : x)));
      setNotice("Naziv promijenjen.");
      setTimeout(() => setNotice(null), 2500);
    } catch (e: any) {
      setNotice(`Greška pri preimenovanju: ${e?.message ?? e}`);
      setTimeout(() => setNotice(null), 4000);
    }
  }

  /* =================== RENDER =================== */

  if (loading) return <main className="p-4">Učitavanje…</main>;
  if (err)     return <main className="p-4 text-red-700">Greška: {err}</main>;

  return (
    <main className="grid gap-4">
      {/* HEADER — responzivno */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
          <h2 className="text-xl font-semibold leading-none">{name}</h2>
          <label className="text-xs text-gray-500 flex items-center gap-2">
            <span>Moje ime (opcionalno)</span>
            <input
              className="px-2 py-1 border rounded-lg w-40 sm:w-56"
              value={clientName}
              onChange={e=>setClientName(e.target.value)}
              placeholder="npr. Ivan / Invest A"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="text-sm text-gray-500">BRP stambenog dijela zgrade</div>
          <div className="px-3 py-2 border rounded-xl w-28 sm:w-32 md:w-40 text-right">{fmt0(brpLimit)}</div>
          <button onClick={exportXLS} className="px-3 py-2 rounded-xl border">Preuzmi XLS</button>
          <button
            onClick={saveClientConfig}
            disabled={saving}
            className={`px-3 py-2 rounded-xl text-white ${saving?"bg-gray-400":"bg-black hover:opacity-90"}`}
          >
            {saving ? "Spremam…" : "Spremi moju konfiguraciju"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl p-3 bg-emerald-50 text-emerald-800 border border-emerald-200">
          {notice}
        </div>
      )}

      {/* KONFIGURACIJE */}
      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Sačuvane konfiguracije</h3>
          <div className="text-xs text-gray-500">{loadingConfs ? "Učitavanje…" : `(${confs.length})`}</div>
        </div>
        {confs.length === 0 ? (
          <div className="text-sm text-gray-500">Još nema sačuvanih konfiguracija.</div>
        ) : (
          <div className="grid gap-2">
            {confs.map(c => {
              const mine = !!clientKey && c.client_key === clientKey;
              return (
                <div key={c.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between border rounded-xl px-3 py-2 gap-2">
                  <div className="text-sm">
                    <div className="font-medium break-words">{c.name}</div>
                    <div className="text-gray-500">
                      {new Date(c.created_at).toLocaleString('hr-HR')} • {c.source === 'client' ? (c.client_name || 'klijent') : 'admin'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={()=>loadConfig(c)} className="px-3 py-1 rounded-lg border hover:bg-gray-50">Učitaj</button>
                    <button
                      onClick={()=>mine && renameConfig(c)}
                      disabled={!mine}
                      className={`px-3 py-1 rounded-lg border ${mine?'hover:bg-gray-50':'opacity-50 cursor-not-allowed'}`}
                    >
                      Preimenuj
                    </button>
                    <button
                      onClick={()=>mine && deleteConfig(c)}
                      disabled={!mine}
                      className={`px-3 py-1 rounded-lg border bg-red-600 text-white ${mine?'hover:opacity-90':'opacity-50 cursor-not-allowed'}`}
                    >
                      Obriši
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SAŽETAK + GRAFOVI */}
      <section className="card">
        <h3 className="font-semibold mb-2">Sažetak</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl p-3 bg-green-50 text-green-900">
            <div>ukupno NETO: <b>{fmt0(calc.totalNeto)}</b> m²</div>
            <div className="mt-1">ukupno BRP: <b>{fmt0(calc.totalAchieved)}</b> m²</div>
          </div>
          <div className="md:col-span-1">
            <div style={{height:220}}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top:8, right:8, bottom:32, left:8 }}>
                  <Pie
                    data={calc.items.map((i)=>({name:i.code, value:Math.round(i.share)}))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {calc.items.map((_,idx)=><Cell key={idx} fill={COLORS[idx%COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v:any)=>`${v}%`} />
                  <Legend verticalAlign="bottom" height={24} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="md:col-span-1">
            <div style={{height:180}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calc.items.map((i,idx)=>({name:i.code, units:i.units, color:COLORS[idx%COLORS.length]}))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="units" radius={[8,8,0,0]}>
                    {calc.items.map((_, idx) => (<Cell key={idx} fill={COLORS[idx % COLORS.length]} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* TIPOVI — mobile-first; na desktopu poravnanje preko istog 2-col grida */}
      <section className="card">
        <h3 className="font-semibold mb-2">Struktura po tipu</h3>
        <div className="grid gap-6">
          {calc.items.map((i, idx) => {
            const t = types[idx];
            const [minN, maxN] = netoRange(t.code);
            const color = COLORS[idx % COLORS.length];

            // max broj stanova uz uvažavanje zaključanih
            const brpLocked = calc.items.filter((x,k)=>k!==idx && x.locked)
              .reduce((s,x)=>s + x.units * x.brpPerUnit, 0);
            const brpFree = Math.max(0, brpLimit - brpLocked);
            const maxUnits = Math.max(0, Math.floor(brpFree / i.brpPerUnit));

            // obojana traka (fallback uz accent-color)
            const fillPct = maxUnits > 0 ? Math.round((i.units / maxUnits) * 100) : 0;
            const sliderStyle: React.CSSProperties = {
              accentColor: color,
              background: `linear-gradient(to right, ${color} ${fillPct}%, #e5e7eb ${fillPct}%)`,
              WebkitAppearance: 'none',
              height: '6px',
              borderRadius: '9999px'
            };

            return (
              /* desktop: 2 stupca → lijevo info, desno slider; NETO i BRP su zasebni grid-itemi (3. i 4.) pa se poravnaju */
              <div key={t.id} className="grid gap-4 md:grid-cols-[minmax(360px,560px)_1fr] md:items-center">
                {/* Lijevi blok: oznaka + opis + NETO kontrola */}
                <div>
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-bold w-10">{t.code}</div>
                    <button
                      onClick={()=>setTypes(prev=>prev.map(x=>x.id===t.id?({...x,locked:!x.locked}):x))}
                      className={`p-1 rounded-md border ${t.locked?'bg-red-50 text-red-600':'bg-gray-50 text-gray-600'}`}
                      title={t.locked?'Otključaj broj stanova':'Zaključaj broj stanova'}
                    >
                      <LockIcon locked={!!t.locked} className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">{t.desc || defaultDesc(t.code)}</div>

                  {/* NETO: samo − / + (korak 1 m²) */}
                  <div className="flex flex-col gap-2">
                    <div className="text-xs text-gray-500">NETO po stanu (m²)</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={()=>changeNetoStep(t.id, -1)}
                        className="px-2 py-1 rounded-md border"
                        aria-label="Smanji NETO"
                      >−</button>
                      <div className="px-3 py-1 rounded-md border min-w-[52px] text-center font-medium tabular-nums">
                        {fmt0(t.neto)}
                      </div>
                      <button
                        onClick={()=>changeNetoStep(t.id, +1)}
                        className="px-2 py-1 rounded-md border"
                        aria-label="Povećaj NETO"
                      >+</button>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      [{minN}–{maxN}] • BRP po stanu: <b>{fmt0(i.brpPerUnit)}</b> m²
                    </div>
                  </div>
                </div>

                {/* Desni blok: slider udjela (broj stanova) */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-xs text-gray-500">
                      Udio (%) <b className="text-slate-700">{Math.round(i.share)}%</b>
                    </div>
                    <div className="text-xs text-slate-700">
                      Broj stanova: <b className="tabular-nums">{fmt0(i.units)}</b>
                    </div>
                  </div>
                  <input
                    className="w-full mt-2"
                    type="range"
                    min={0}
                    max={maxUnits}
                    step={1}
                    value={i.units}
                    onChange={(e)=>changeUnits(t.id, Number(e.target.value))}
                    style={sliderStyle}
                    aria-label="Broj stanova"
                  />
                  <div className="sr-only">Maksimalno: {fmt0(maxUnits)} stanova</div>
                </div>

                {/* --- SUMARNI RED --- */}
                {/* mobitel: jedan red s dvije kolone */}
                <div className="md:hidden grid grid-cols-2 gap-3 text-xs text-slate-700 mt-1">
                  <div>NETO: <b className="tabular-nums">{fmt0(i.netoPerUnit * i.units)}</b> m²</div>
                  <div className="text-right">BRP: <b className="tabular-nums">{fmt0(i.achievedBrp)}</b> m²</div>
                </div>
                {/* desktop: dva odvojena itema poravnata ispod odgovarajućih stupaca */}
                <div className="hidden md:block text-xs text-slate-700">
                  NETO: <b className="tabular-nums">{fmt0(i.netoPerUnit * i.units)}</b> m²
                </div>
                <div className="hidden md:block text-xs text-slate-700 text-right">
                  BRP: <b className="tabular-nums">{fmt0(i.achievedBrp)}</b> m²
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-right text-sm text-slate-700">
          Ukupno stanova: <b>{fmt0(calc.items.reduce((s,i)=>s+i.units,0))}</b>
        </div>
      </section>
    </main>
  );
}
