'use client';

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

/* =================== Helpers & konstante =================== */

const RATIO = 0.65;
const COLORS = ['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#14b8a6','#e11d48','#0ea5e9'] as const;
const fmt0 = (n:number)=>new Intl.NumberFormat('hr-HR',{maximumFractionDigits:0}).format(Math.round(n||0));

type TypeState = {
  id: string;           // LOKALNI red (UUID za duplikate)
  baseId: string;       // ID tipa iz project_unit_types (isti za sve varijante)
  code: string;         // npr. "3S"
  label?: string|null;  // npr. "A", "B" → prikaz "3S-A"
  desc: string;
  neto: number;
  neto_min: number | null;
  neto_max: number | null;
  neto_default: number | null;
  share: number;
  locked?: boolean;
};

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

function fallbackDesc(code: string) {
  switch (code) {
    case '1S': return 'Studio / garsonjera (bez spavaće sobe)';
    case '2S': return 'Dnevni + 1 spavaća';
    case '3S': return 'Dnevni + 2 spavaće';
    case '4S': return 'Dnevni + 3 spavaće';
    default:   return '';
  }
}
function fallbackRange(code: string): [number, number] {
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

function nextLabelFor(baseId: string, rows: TypeState[]) {
  const used = new Set(
    rows.filter(r => r.baseId === baseId && r.label)
        .map(r => (r.label as string).toUpperCase())
  );
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const ch of alphabet) if (!used.has(ch)) return ch;
  let i = 1;
  while (used.has("A"+i)) i++;
  return "A"+i;
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

  const [canEdit, setCanEdit] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
    const t = url?.searchParams.get("t");
    if (!t) { setToken(null); setCanEdit(false); return; }
    setToken(t);
    (async () => {
      try {
        const res = await fetch(`/api/check-token?t=${encodeURIComponent(t)}`);
        const j = await res.json();
        if (j?.valid && j?.scope === "edit" && j?.projectId === params.id) {
          setCanEdit(true);
        } else {
          setCanEdit(false);
        }
      } catch {
        setCanEdit(false);
      }
    })();
  }, [params.id]);

  const [lockTipId, setLockTipId] = useState<string|null>(null);

  useEffect(() => {
    let key = localStorage.getItem('client_key');
    if (!key) {
      key = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())+Math.random().toString(36).slice(2);
      localStorage.setItem('client_key', key);
    }
    setClientKey(key);
    setClientName(localStorage.getItem('client_name') || '');
  }, []);

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
          .select("id, code, description, neto, share, idx, neto_min, neto_max, neto_default")
          .eq("project_id", projectId)
          .order("idx", { ascending: true })
          .order("code", { ascending: true });
        if (error) throw error;

        const rows = (data ?? []) as Array<{
          id:string; code:string; description:string|null; neto:number; share:number;
          neto_min: number|null; neto_max: number|null; neto_default:number|null;
        }>;

        const initial: TypeState[] = rows.map(r => {
          const [fbMin, fbMax] = fallbackRange(r.code);
          const minN = r.neto_min ?? fbMin;
          const maxN = r.neto_max ?? fbMax;
          const baseDefault = r.neto_default ?? r.neto ?? Math.round((fbMin+fbMax)/2);
          const netoClamped = Math.max(minN, Math.min(maxN, Math.round(baseDefault)));
          return {
            id: r.id,
            baseId: r.id,
            code: r.code,
            label: null,
            desc: (r.description ?? fallbackDesc(r.code)),
            neto: netoClamped,
            neto_min: r.neto_min,
            neto_max: r.neto_max,
            neto_default: r.neto_default,
            share: Number(r.share) || 0,
            locked: false
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

  /* =================== Interakcije (VIEW smije sve lokalno!) =================== */

  function changeUnits(id: string, unitsIn: number, allowedMax?: number) {
    const desired = Math.max(0, Math.round(Number(unitsIn) || 0));
    const cap = (typeof allowedMax === 'number') ? Math.max(0, Math.floor(allowedMax)) : desired;
    const targetUnits = Math.min(desired, cap);

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
      const [fbMin, fbMax] = fallbackRange(t.code);
      const minN = (t.neto_min ?? fbMin);
      const maxN = (t.neto_max ?? fbMax);
      const next = Math.max(minN, Math.min(maxN, Math.round((t.neto ?? (t.neto_default ?? minN)) + delta)));
      return prev.map(x => x.id===id ? { ...x, neto: next } : x);
    });
  }

  function duplicateRow(id: string) {
    setTypes(prev => {
      const src = prev.find(r => r.id === id);
      if (!src) return prev;
      const label = nextLabelFor(src.baseId, prev);
      const clone: TypeState = {
        ...src,
        id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${src.baseId}-${Date.now()}`,
        label,
        locked: false,
        share: 0,
      };
      const next = [...prev, clone];
      return normalizeShares(next);
    });
  }

  function renameRow(id: string) {
    setTypes(prev => {
      const row = prev.find(r => r.id === id);
      if (!row) return prev;
      const current = row.label || "";
      const next = window.prompt("Dodatak nazivu (npr. A, B, C):", current)?.trim();
      if (next === undefined) return prev;
      return prev.map(r => r.id === id ? { ...r, label: next || null } : r);
    });
  }

  function deleteRow(id: string) {
    setTypes(prev => {
      const next = prev.filter(r => r.id !== id);
      return normalizeShares(next);
    });
  }

  /* --- zaključavanje: blokiraj “predzadnjeg” (uvijek moraju ostati ≥ 2 otključana) --- */
  const toggleLock = (id: string) => {
    setTypes(prev => {
      const curr = prev.find(x=>x.id===id);
      if (!curr) return prev;
      if (!curr.locked) {
        const unlockedCount = prev.filter(x => !x.locked).length;
        if (unlockedCount <= 2) {
          // ostavi kratku vizualnu poruku preko state-a (možeš po želji)
          return prev;
        }
      }
      return prev.map(x => x.id===id ? ({...x, locked: !x.locked}) : x);
    });
  };

  /* =================== XLS export =================== */
  async function exportXLS() {
    try {
      const XLSX = await import('xlsx');
      const rows = calc.items.map(i => ({
        TIP: i.code + (i.label ? `-${i.label}` : ""),
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

  /* =================== SPREMANJE/IME KONFIGURACIJE (samo za EDIT) =================== */

  async function saveClientConfig() {
    if (!canEdit || !token) {
      setNotice("Read-only link – spremanje nije dozvoljeno.");
      setTimeout(()=>setNotice(null),3000);
      return;
    }
    try {
      const defaultName = `Konfiguracija ${new Date().toLocaleString('hr-HR')}`;
      const confName = window.prompt("Naziv konfiguracije:", defaultName);
      if (!confName) return;

      localStorage.setItem('client_name', clientName || '');

      setSaving(true); setNotice(null);

      const body = {
        // oboje šaljemo radi kompatibilnosti s API-jem
        projectId,
        name: confName,
        brpLimit,               // ako API čita camelCase
        brp_limit: brpLimit,    // ako API očekuje snake_case
        ratio: RATIO,           // << KLJUČNO: više neće biti NULL u bazi
        // (opcionalno) tolerance: 50,
        source: 'client',
        clientKey,
        clientName,
        items: calc.items.map(i => ({
          project_unit_type_id: i.baseId,
          label: i.label ?? null,
          share: i.share,
          units: i.units,
          neto_per_unit: i.netoPerUnit,
          brp_per_unit: i.brpPerUnit,
        }))
      };

      const res = await fetch(`/api/save?t=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Greška pri spremanju");

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
        .select("project_unit_type_id, units, neto_per_unit, label")
        .eq("configuration_id", conf.id);
      if (error) throw error;

      const baseMap = new Map<string, TypeState>();
      types.forEach(r => { if (!baseMap.has(r.baseId)) baseMap.set(r.baseId, r); });

      setBrpLimit(conf.brp_limit ?? brpLimit);

      const out: TypeState[] = [];
      for (const row of (items ?? [])) {
        const base = baseMap.get(row.project_unit_type_id);
        if (!base) continue;

        const [fbMin, fbMax] = fallbackRange(base.code);
        const minN = (base.neto_min ?? fbMin);
        const maxN = (base.neto_max ?? fbMax);

        const netoClamped = Math.max(minN, Math.min(maxN, Math.round(Number(row.neto_per_unit) || base.neto)));
        const bpu = Math.max(1, Math.round(netoClamped / RATIO));
        const share = (Math.max(0, Math.round(Number(row.units) || 0)) * bpu) / Math.max(1, (conf.brp_limit ?? brpLimit)) * 100;

        out.push({
          ...base,
          id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${base.baseId}-${Math.random()}`,
          label: row.label ?? null,
          neto: netoClamped,
          share,
          locked: false,
        });
      }

      if (out.length === 0) {
        setNotice(`Nema stavki za učitati u "${conf.name}".`);
        setTimeout(()=>setNotice(null),2500);
        return;
      }

      setTypes(normalizeShares(out));
      setNotice(`Učitana: ${conf.name}`);
      setTimeout(()=>setNotice(null),2500);
    } catch (e:any) {
      setNotice(`Greška pri učitavanju: ${e?.message ?? e}`);
      setTimeout(()=>setNotice(null),3500);
    }
  }

  async function deleteConfig(conf: ConfRow) {
    if (!canEdit) { setNotice("Read-only link – brisanje nije dozvoljeno."); setTimeout(()=>setNotice(null),3000); return; }
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
    if (!canEdit) { setNotice("Read-only link – preimenovanje nije dozvoljeno."); setTimeout(()=>setNotice(null),3000); return; }
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

  const displayName = (t: TypeState) => t.code + (t.label ? `-${t.label}` : "");

  return (
    <main className="grid gap-4">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
          <h2 className="text-xl font-semibold leading-none">{name}</h2>
          {!canEdit && (
            <span className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">
              Read-only link (lokalne promjene nisu vidljive drugima)
            </span>
          )}
        </div>

        {/* Desktop: akcije gore desno */}
        <div className="hidden md:flex flex-wrap items-center gap-2 md:gap-3">
          <div className="text-sm text-gray-500">BRP stambenog dijela zgrade</div>
          <div className="px-3 py-2 border rounded-xl w-28 sm:w-32 md:w-40 text-right">{fmt0(brpLimit)}</div>
          <button onClick={exportXLS} className="px-3 py-2 rounded-xl border">Preuzmi XLS</button>
          <button
            onClick={saveClientConfig}
            disabled={saving || !canEdit}
            title={!canEdit ? "Read-only link – spremanje nije dozvoljeno." : "Spremi moju konfiguraciju"}
            className={`px-3 py-2 rounded-xl text-white ${saving||!canEdit?"bg-gray-400 cursor-not-allowed":"bg-black hover:opacity-90"}`}
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

      {/* KONFIGURACIJE — DESKTOP */}
      <section className="card hidden md:block">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Sačuvane konfiguracije</h3>
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
                      disabled={!mine || !canEdit}
                      title={!canEdit ? "Read-only link – preimenovanje nije dozvoljeno." : (mine ? "" : "Samo autor može preimenovati")}
                      className={`px-3 py-1 rounded-lg border ${(mine && canEdit)?'hover:bg-gray-50':'opacity-50 cursor-not-allowed'}`}
                    >
                      Preimenuj
                    </button>
                    <button
                      onClick={()=>mine && deleteConfig(c)}
                      disabled={!mine || !canEdit}
                      title={!canEdit ? "Read-only link – brisanje nije dozvoljeno." : (mine ? "" : "Samo autor može brisati")}
                      className={`px-3 py-1 rounded-lg border bg-red-600 text-white ${(mine && canEdit)?'hover:opacity-90':'opacity-50 cursor-not-allowed'}`}
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
                    data={calc.items.map((i)=>({name:displayName(i), value:Math.round(i.share)}))}
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
                <BarChart data={calc.items.map((i,idx)=>({name:displayName(i), units:i.units, color:COLORS[idx%COLORS.length]}))}>
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

      {/* TIPOVI */}
      <section className="card">
        <h3 className="font-semibold mb-2">Struktura po tipu</h3>
        <div className="grid gap-6">
          {calc.items.map((i, idx) => {
            const t = types[idx];
            const [fbMin, fbMax] = fallbackRange(t.code);
            const minN = (t.neto_min ?? fbMin);
            const maxN = (t.neto_max ?? fbMax);
            const color = COLORS[idx % COLORS.length];

            const brpLocked = calc.items.filter((x,k)=>k!==idx && x.locked)
              .reduce((s,x)=>s + x.units * x.brpPerUnit, 0);
            const allowedMax = Math.max(0, Math.floor((brpLimit - brpLocked) / i.brpPerUnit));
            const visualMax = Math.max(i.units, Math.floor(brpLimit / i.brpPerUnit));

            const fillPct = visualMax > 0 ? Math.round((i.units / visualMax) * 100) : 0;
            const sliderStyle: React.CSSProperties = {
              accentColor: color,
              background: `linear-gradient(to right, ${color} ${fillPct}%, #e5e7eb ${fillPct}%)`,
              WebkitAppearance: 'none',
              height: '6px',
              borderRadius: '9999px'
            };

            return (
              <div key={t.id} className="grid gap-4 md:grid-cols-[minmax(360px,560px)_1fr] md:items-center">
                <div className="relative">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-lg font-bold">{t.code}{t.label ? `-${t.label}` : ""}</div>
                    <button
                      onClick={()=>toggleLock(t.id)}
                      className={`p-1 rounded-md border ${t.locked?'bg-red-50 text-red-600':'bg-gray-50 text-gray-600'}`}
                      title={t.locked?'Otključaj broj stanova':'Zaključaj broj stanova'}
                    >
                      <LockIcon locked={!!t.locked} className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2 ml-2">
                      <button className="px-2 py-1 rounded-md border" onClick={()=>duplicateRow(t.id)}>Dupliciraj</button>
                      <button className="px-2 py-1 rounded-md border" onClick={()=>renameRow(t.id)}>Preimenuj</button>
                      <button className="px-2 py-1 rounded-md border bg-red-50 text-red-600" onClick={()=>deleteRow(t.id)}>Obriši</button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">{t.desc || fallbackDesc(t.code)}</div>

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
                    max={visualMax}
                    step={1}
                    value={i.units}
                    onChange={(e)=>changeUnits(t.id, Number(e.target.value), allowedMax)}
                    style={sliderStyle}
                    aria-label="Broj stanova"
                    disabled={!!t.locked}
                  />
                  <div className="sr-only">Maksimalno: {fmt0(allowedMax)} stanova</div>
                </div>

                <div className="md:hidden grid grid-cols-2 gap-3 text-xs text-slate-700 mt-1">
                  <div>NETO: <b className="tabular-nums">{fmt0(i.netoPerUnit * i.units)}</b> m²</div>
                  <div className="text-right">BRP: <b className="tabular-nums">{fmt0(i.brpPerUnit * i.units)}</b> m²</div>
                </div>
                <div className="hidden md:block text-xs text-slate-700">
                  NETO: <b className="tabular-nums">{fmt0(i.netoPerUnit * i.units)}</b> m²
                </div>
                <div className="hidden md:block text-xs text-slate-700 text-right">
                  BRP: <b className="tabular-nums">{fmt0(i.brpPerUnit * i.units)}</b> m²
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-right text-sm text-slate-700">
          Ukupno stanova: <b>{fmt0(calc.items.reduce((s,i)=>s+i.units,0))}</b>
        </div>

        {/* Mobile akcije */}
        <div className="md:hidden mt-6 flex flex-col gap-2">
          <div className="text-sm text-gray-500">BRP stambenog dijela zgrade</div>
          <div className="px-3 py-2 border rounded-xl w-full text-right">{fmt0(brpLimit)}</div>
          <button onClick={exportXLS} className="px-3 py-2 rounded-xl border w-full">Preuzmi XLS</button>
          <button
            onClick={saveClientConfig}
            disabled={saving || !canEdit}
            title={!canEdit ? "Read-only link – spremanje nije dozvoljeno." : "Spremi moju konfiguraciju"}
            className={`px-3 py-2 rounded-xl text-white w-full ${(saving||!canEdit)?"bg-gray-400 cursor-not-allowed":"bg-black hover:opacity-90"}`}
          >
            {saving ? "Spremam…" : "Spremi moju konfiguraciju"}
          </button>
        </div>
      </section>

      {/* KONFIGURACIJE — MOBITEL */}
      <section className="card md:hidden">
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
                      disabled={!mine || !canEdit}
                      title={!canEdit ? "Read-only link – preimenovanje nije dozvoljeno." : (mine ? "" : "Samo autor može preimenovati")}
                      className={`px-3 py-1 rounded-lg border ${(mine && canEdit)?'hover:bg-gray-50':'opacity-50 cursor-not-allowed'}`}
                    >
                      Preimenuj
                    </button>
                    <button
                      onClick={()=>mine && deleteConfig(c)}
                      disabled={!mine || !canEdit}
                      title={!canEdit ? "Read-only link – brisanje nije dozvoljeno." : (mine ? "" : "Samo autor može brisati")}
                      className={`px-3 py-1 rounded-lg border bg-red-600 text-white ${(mine && canEdit)?'hover:opacity-90':'opacity-50 cursor-not-allowed'}`}
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
    </main>
  );
}
