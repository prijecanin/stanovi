'use client';

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

const RATIO = 0.65;
const COLORS = ['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#14b8a6'] as const;
const fmt0 = (n:number)=>new Intl.NumberFormat('hr-HR',{maximumFractionDigits:0}).format(Math.round(n||0));

const brpPerUnit = (neto:number) => Math.max(1, Math.round((neto||0)/RATIO));

function totalAchieved(list: {units:number; neto:number}[]) {
  return list.reduce((s, t) => s + t.units * brpPerUnit(t.neto), 0);
}

/**
 * Rebalance: drži ukupni BRP = brpLimit.
 * - 'pinnedId' je tip koji je upravo promijenjen (njega ne skaliramo).
 * - zaključane tipove ne diramo.
 */
// umjesto dosadašnje verzije:
function rebalanceUnits<T extends { id: string; neto: number; units: number; locked?: boolean }>(
  arr: T[],
  brpLimit: number,
  pinnedId?: string
): T[] {
  const items = arr.map(t => ({ ...t, bpu: Math.max(1, Math.round((t.neto || 0) / RATIO)) }));
  const isLocked = (t: any) => !!t.locked;

  const pinned = pinnedId ? items.find(t => t.id === pinnedId) : undefined;
  const lockedSum = items.filter(isLocked).reduce((s, t) => s + t.units * t.bpu, 0);
  const pinnedSum = pinned ? pinned.units * pinned.bpu : 0;

  const free = items.filter(t => !isLocked(t) && t.id !== pinnedId);
  const freeSum = free.reduce((s, t) => s + t.units * t.bpu, 0);
  const targetFree = Math.max(0, brpLimit - lockedSum - pinnedSum);

  const nextUnits = new Map<string, number>(items.map(t => [t.id, t.units]));
  if (free.length > 0) {
    if (freeSum > 0) {
      const factor = targetFree / freeSum;
      free.forEach(t => nextUnits.set(t.id, Math.max(0, Math.round(t.units * factor))));
    } else {
      let left = targetFree;
      const sorted = [...free].sort((a, b) => a.bpu - b.bpu);
      outer: while (left >= (sorted[0]?.bpu ?? Infinity)) {
        for (const t of sorted) {
          if (left >= t.bpu) {
            nextUnits.set(t.id, (nextUnits.get(t.id) || 0) + 1);
            left -= t.bpu;
          }
          if (left < (sorted[0]?.bpu ?? Infinity)) break outer;
        }
      }
    }
  }

  // fina korekcija
  const achieved = items.reduce((s, t) => s + (nextUnits.get(t.id) || 0) * t.bpu, 0);
  let diff = brpLimit - achieved;
  if (free.length > 0 && diff !== 0) {
    if (diff > 0) {
      const asc = [...free].sort((a, b) => a.bpu - b.bpu);
      let guard = 10000;
      while (diff >= asc[0].bpu && guard--) {
        for (const t of asc) {
          if (diff >= t.bpu) {
            nextUnits.set(t.id, (nextUnits.get(t.id) || 0) + 1);
            diff -= t.bpu;
          }
          if (diff < asc[0].bpu) break;
        }
      }
    } else {
      const desc = [...free].sort((a, b) => b.bpu - a.bpu);
      let guard = 10000;
      while (diff < 0 && guard--) {
        let changed = false;
        for (const t of desc) {
          const cur = nextUnits.get(t.id) || 0;
          if (cur > 0) {
            nextUnits.set(t.id, cur - 1);
            diff += t.bpu;
            changed = true;
            if (diff >= 0) break;
          }
        }
        if (!changed) break;
      }
    }
  }

  // ⬅️ vratimo ISTE objekte, samo s novim units
  return arr.map(t => ({ ...t, units: Math.max(0, nextUnits.get(t.id) || 0) }));
}

type ConfRow = {
  id: string;
  name: string;
  created_at: string;
  project_id: string;
  brp_limit: number | null;
  ratio: number | null;
  tolerance: number | null;
  source: string | null;
  client_key: string | null;
  client_name: string | null;
};



type TypeState = { id:string; code:string; neto:number; units:number; locked?: boolean; desc?: string };

type ConfRow = {
  id: string;
  name: string;
  created_at: string;
  project_id: string;
  brp_limit: number | null;
  ratio: number | null;
  tolerance: number | null;
  source: string | null;
  client_key: string | null;
  client_name: string | null;
};

function netoRange(code: string): [number, number] {
  switch (code) {
    case '1S': return [25, 35];
    case '2S': return [35, 55];
    case '3S': return [55, 75];
    case '4S': return [75, 120];
    default:   return [20, 200];
  }
}
function defaultDesc(code: string) {
  switch (code) {
    case '1S': return 'Studio / garsonjera';
    case '2S': return 'Dnevni + 1 spavaća soba';
    case '3S': return 'Dnevni + 2 spavaće sobe';
    case '4S': return 'Dnevni + 3 spavaće sobe';
    default:   return '';
  }
}

// SVG lokot
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

  // init client key/name
  useEffect(() => {
    let key = localStorage.getItem('client_key');
    if (!key) {
      key = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())+Math.random().toString(36).slice(2);
      localStorage.setItem('client_key', key);
    }
    setClientKey(key);
    setClientName(localStorage.getItem('client_name') || '');
  }, []);

  // fetch projekt + tipovi
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
          const brpPerUnit  = Math.max(1, Math.round(netoClamped / RATIO));
          const brpTarget   = (proj.brp_limit ?? 12500) * (Number(r.share)||0) / 100;
          const units       = Math.max(0, Math.round(brpTarget / brpPerUnit));
          return { id: r.id, code: r.code, neto: netoClamped, units, locked:false, desc: r.description ?? defaultDesc(r.code) };
        });

        if (!alive) return;
        setName(proj.name);
        setBrpLimit(proj.brp_limit ?? 12500);
        setTypes(initial);
      } catch (e:any) {
        if (alive) setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  // fetch svih konfiguracija projekta
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

  // kalkulacija iz lokalnog stanja
  const calc = useMemo(() => {
    const items = types.map(t => {
      const brpPerUnit   = Math.max(1, Math.round((t.neto||0)/RATIO));
      const netoPerUnit  = Math.round(brpPerUnit*RATIO);
      const achievedBrp  = t.units*brpPerUnit;
      const share        = brpLimit>0 ? (achievedBrp/brpLimit*100) : 0;
      return { ...t, brpPerUnit, netoPerUnit, achievedBrp, share };
    });
    return {
      items,
      totalAchieved: items.reduce((s,i)=>s+i.achievedBrp,0),
      totalNeto:     items.reduce((s,i)=>s+i.netoPerUnit*i.units,0)
    };
  }, [types, brpLimit]);

  // promjene
  function changeNeto(id: string, raw: string) {
setTypes(prev => {
  const t = prev.find(x => x.id===id)!;
  const [minN,maxN] = netoRange(t.code);
  const n = Math.max(minN, Math.min(maxN, Math.round(Number(raw) || t.neto)));
  const next = prev.map(x => x.id===id ? ({ ...x, neto: n }) : x);
  return rebalanceUnits(next, brpLimit, id);   // ✔ ovo sada vraća TypeState[]
});

}

function changeUnits(id: string, unitsIn: number) {
  setTypes(prev => {
    const pinned = prev.find(t => t.id === id);
    if (!pinned) return prev;

    const bpuPinned = brpPerUnit(pinned.neto);

    // BRP ostalih tipova (bez "pinned")
    const others = prev.filter(t => t.id !== id);
    const othersAchieved = others.reduce((s, t) => s + t.units * brpPerUnit(t.neto), 0);

    // maksimalan broj stanova za pinned tako da ostavljamo mjesta za ostalo
    const maxUnitsByRest = Math.max(0, Math.floor((brpLimit - othersAchieved) / bpuPinned));

    const nextPinnedUnits = Math.min(
      Math.max(0, Math.round(Number(unitsIn) || 0)),
      maxUnitsByRest
    );

    const withPinned = prev.map(t => t.id === id ? { ...t, units: nextPinnedUnits } : t);

    // redistribuiraj slobodne tipove da zbroj BRP ostane = brpLimit
    return rebalanceUnits(withPinned, brpLimit, id);
  });
}



  // XLS export
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

  // spremi / učitaj / preimenuj / obriši klijent konfiguracije
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
    setTypes(prev => {
      const next = prev.map(t => {
        const row = byId.get(t.id);
        if (!row) return t;
        const [minN, maxN] = netoRange(t.code);
        const netoClamped = Math.max(minN, Math.min(maxN, Math.round(Number(row.neto_per_unit) || t.neto)));
        return {
          ...t,
          neto: netoClamped,
          units: Math.max(0, Math.round(Number(row.units) || 0))
        };
      });
      // ⬇️ važan dio: vrati ukupni BRP na cilj
      return rebalanceUnits(next, brpLimit);
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
      setConfs(prev => prev.map(x => (x.id === c.id ? { ...x, name: next } : x)));
    } catch (e:any) {
      setNotice(`Greška pri brisanju: ${e?.message ?? e}`);
      setTimeout(()=>setNotice(null),3500);
    }
  }

async function renameConfig(c: ConfRow) {
  const current = c.name || "Konfiguracija";
  const next = window.prompt("Novi naziv konfiguracije:", current)?.trim();
  if (!next || next === current) return;

  try {
    const { error } = await supabase
      .from("configurations")
      .update({ name: next })
      .eq("id", c.id);

    if (error) throw error;

    // lokalno ažuriraj prikaz
    setConfigs(prev => prev.map(x => (x.id === c.id ? { ...x, name: next } : x)));

    // (opcionalno) kratka poruka korisniku
    setNotice?.("Naziv promijenjen.");
    setTimeout?.(() => setNotice?.(null), 2500);
  } catch (e: any) {
    setNotice?.(`Greška pri preimenovanju: ${e?.message ?? e}`);
    setTimeout?.(() => setNotice?.(null), 4000);
  }
}


  // ---- render
  if (loading) return <main className="p-4">Učitavanje…</main>;
  if (err)     return <main className="p-4 text-red-700">Greška: {err}</main>;

  return (
    <main className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-end gap-4">
          <h2 className="text-xl font-semibold leading-none">{name}</h2>
          <div className="text-xs text-gray-500">
            Moje ime (opcionalno)
            <input
              className="ml-2 px-2 py-1 border rounded-lg"
              value={clientName}
              onChange={e=>setClientName(e.target.value)}
              placeholder="npr. Ivan / Invest A"
            />
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="text-sm text-gray-500">BRP stambenog dijela zgrade</div>
          <div className="px-3 py-2 border rounded-xl w-40 text-right">{fmt0(brpLimit)}</div>
          <button onClick={exportXLS} className="px-4 py-2 rounded-xl border">Preuzmi XLS</button>
          <button
            onClick={saveClientConfig}
            disabled={saving}
            className={`px-4 py-2 rounded-xl text-white ${saving?"bg-gray-400":"bg-black hover:opacity-90"}`}
            title="Spremi moju konfiguraciju"
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

      {/* Popis konfiguracija */}
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
                <div key={c.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
                  <div className="text-sm">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-gray-500">
                      {new Date(c.created_at).toLocaleString('hr-HR')} • {c.source === 'client' ? (c.client_name || 'klijent') : 'admin'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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

      {/* Sažetak + grafovi */}
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
                  <Pie data={calc.items.map((i)=>({name:i.code, value:Math.round(i.share)}))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
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
                    {calc.items.map((_,idx)=><Cell key={idx} fill={COLORS[idx%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Struktura po tipu */}
      <section className="card">
        <h3 className="font-semibold mb-2">Struktura po tipu</h3>
        <div className="grid gap-3">
          {calc.items.map((i, idx) => {
            const [minN, maxN] = netoRange(i.code);
            const othersAchieved = calc.totalAchieved - (i.units * i.brpPerUnit);
            const maxUnits = Math.max(0, Math.floor((brpLimit - othersAchieved) / i.brpPerUnit));
            const rawValue = types[idx].units;
            const safeValue = Math.min(rawValue, maxUnits);               // <= NOVO
            const pct = maxUnits > 0 ? Math.round((safeValue / maxUnits) * 100) : 0;  // <= izmjena
            const color = COLORS[idx % COLORS.length];
            const locked = !!types[idx].locked;
            return (
              <div key={i.id} className="grid items-center gap-3" style={{gridTemplateColumns:'140px 1.1fr 4.5fr 1.2fr'}}>
                {/* oznaka + lokot + opis */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <div className="font-bold">{i.code}</div>
                    <button
                      type="button"
                      onClick={() => setTypes(prev => prev.map(t => t.id===i.id ? ({...t, locked: !t.locked}) : t))}
                      className={`p-1.5 rounded-lg border transition ${locked ? 'bg-slate-200' : 'bg-white hover:bg-slate-50'}`}
                      title={locked ? 'Otključaj broj stanova' : 'Zaključaj broj stanova'}
                      style={{ color }}
                    >
                      <LockIcon locked={locked} className="w-4 h-4" />
                    </button>
                  </div>
                  {types[idx].desc ? (
                    <div className="text-[11px] leading-tight text-gray-500 font-light mt-0.5">
                      {types[idx].desc}
                    </div>
                  ) : null}
                </div>

                {/* NETO */}
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    NETO po stanu (m²) <span className="text-gray-400">[{minN}–{maxN}]</span>
                  </div>
                  <input
                    className="px-3 py-2 border rounded-xl w-full"
                    type="number"
                    min={minN}
                    max={maxN}
                    value={types[idx].neto}
                    onChange={e=>changeNeto(i.id, e.target.value)}
                  />
                  <div className="text-xs text-gray-500 mt-1">BRP po stanu: <b>{fmt0(i.brpPerUnit)}</b> m²</div>
                </div>

                {/* slider BROJ STANOVA */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-xs text-gray-500">Udio (%) <b className="text-slate-700">{Math.round(i.share)}%</b></div>
                    <div className="text-xs text-slate-700">Broj stanova: <b>{fmt0(safeValue)}</b></div>
                  </div>
                  <input
                  className="w-full mt-2 h-2 rounded-full appearance-none"
                  type="range"
                  min={0}
  		  max={maxUnits}
  		  step={1}
  value={safeValue}                                    // <= umjesto types[idx].units
  onChange={e=>changeUnits(i.id, Number(e.target.value))}
  disabled={locked}
  style={{
    background:`linear-gradient(to right, ${color} ${pct}%, #e5e7eb ${pct}%)`,
    color,
    accentColor: color as any,                         // boja thumb-a (opcionalno)
    opacity: locked ? 0.6 : 1,
    cursor: locked ? 'not-allowed' : 'pointer'
  }}
/>

                </div>

                {/* ukupno po tipu */}
                <div>
                  <div className="text-xs text-slate-700">NETO: <b>{fmt0(i.netoPerUnit * i.units)}</b> m²</div>
                  <div className="text-xs text-slate-700 mt-1">BRP: <b>{fmt0(i.achievedBrp)}</b> m²</div>
                </div>
              </div>
            );
          })}
          <div className="text-right text-sm text-slate-700">
            Ukupno stanova: <b>{fmt0(calc.items.reduce((s,i)=>s+i.units,0))}</b>
          </div>
        </div>
      </section>
    </main>
  );
}
