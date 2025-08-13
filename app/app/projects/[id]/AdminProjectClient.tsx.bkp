"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

type LinkAction = (state: any, formData: FormData) => Promise<{ link?: string; error?: string; shortUrl?: string }>;
type Props = {
  paramsId: string;
  makeViewLink: LinkAction;
  makeEditLink: LinkAction;
  makeShortViewLink: LinkAction;  // s TTL-om
  makeShortEditLink: LinkAction;  // s TTL-om
};

const RATIO = 0.65;
const COLORS = ['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#14b8a6'] as const;

type UnitType = { id: string; code: string; desc: string; neto: number; share: number; locked: boolean; };
type Snapshot = { id: string; name: string; created_at: string; brp_limit: number; ratio: number; tolerance: number; };

const fmt0 = (n:number)=>new Intl.NumberFormat('hr-HR',{maximumFractionDigits:0}).format(Math.round(n||0));

// helper: slugify
function slugify(s: string) {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** server‑akcija + kopiranje dugog linka (s TTL-om) */
function useCopyLink(action: LinkAction, projectId: string, scope: "view"|"edit") {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  async function run(copyNotice: (msg: string)=>void, hours: number) {
    if (!projectId) { copyNotice("Nedostaje projectId."); return; }
    const safeHours = Math.max(1, Math.round(hours)||1);
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("hours", String(safeHours));
      const res = await action({}, fd);
      if (res?.error) throw new Error(res.error);
      if (!res?.link) throw new Error("Server nije vratio link.");
      await navigator.clipboard.writeText(res.link);
      copyNotice(`${scope.toUpperCase()} link (${safeHours}h) kopiran.`);
    } catch (e:any) {
      const msg = e?.message || String(e);
      setErr(msg);
      copyNotice(`Greška: ${msg}`);
    } finally { setBusy(false); }
  }
  return { run, busy, err };
}

/** server‑akcija + kreiranje kratkog linka i kopiranje (s TTL-om) */
function useCreateShort(action: LinkAction, projectId: string, scope: "view"|"edit") {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  async function run(slugIn: string, notify: (m:string)=>void, hours: number) {
    if (!projectId) { notify("Nedostaje projectId."); return; }
    const slug = slugify(slugIn);
    if (!slug) { notify("Upiši kratko ime (slug)."); return; }
    const safeHours = Math.max(1, Math.round(hours)||1);
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("slug", slug);
      fd.set("hours", String(safeHours));
      const res = await action({}, fd);
      if (res?.error) throw new Error(res.error);
      if (!res?.shortUrl) throw new Error("Server nije vratio shortUrl.");
      await navigator.clipboard.writeText(res.shortUrl);
      notify(`Kratki ${scope.toUpperCase()} link (${safeHours}h) kopiran: ${res.shortUrl}`);
    } catch (e:any) {
      const msg = e?.message || String(e);
      setErr(msg);
      notify(`Greška: ${msg}`);
    } finally { setBusy(false); }
  }
  return { run, busy, err };
}

export default function AdminProjectClient({ paramsId, makeViewLink, makeEditLink, makeShortViewLink, makeShortEditLink }: Props) {
  const [name, setName] = useState("Projekt");
  const [brpLimit, setBrpLimit] = useState(12500);
  const [types, setTypes] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  const [tolerance, setTolerance] = useState(50);
  const [projectId, setProjectId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string|null>(null);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loadingSnaps, setLoadingSnaps] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // TTL za linkove (sati)
  const [hours, setHours] = useState<number>(168); // default 7 dana

  // linkovi
  const copyView  = useCopyLink(makeViewLink,  projectId || "", "view");
  const copyEdit  = useCopyLink(makeEditLink,  projectId || "", "edit");
  const shortView = useCreateShort(makeShortViewLink, projectId || "", "view");
  const shortEdit = useCreateShort(makeShortEditLink, projectId || "", "edit");

  const [slug, setSlug] = useState("");

  // ---------- FETCH: projekt + tipovi ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true); setErr(null);
        let pid = paramsId;
        if (pid === "demo-1") {
          const { data: first, error: e1 } = await supabase.from("projects").select("id").order("created_at",{ascending:true}).limit(1).maybeSingle();
          if (e1) throw e1; if (!first) throw new Error("Nema projekata u bazi."); pid = first.id;
        }
        const { data: proj, error: ep } = await supabase.from("projects").select("name, brp_limit, ratio, tolerance").eq("id", pid).single();
        if (ep) throw ep;
        const { data: rows, error: et } = await supabase
          .from("project_unit_types")
          .select("id, code, description, neto, share, locked, idx")
          .eq("project_id", pid)
          .order("idx", { ascending: true });
        if (et) throw et;

        if (!alive) return;
        setProjectId(pid);
        setName(proj.name);
        setNameDraft(proj.name);
        setBrpLimit(proj.brp_limit ?? 12500);
        setTolerance(proj.tolerance ?? 50);
        setTypes((rows ?? []).map(r => ({ id:r.id, code:r.code, desc:r.description, neto:r.neto, share:Number(r.share)||0, locked:!!r.locked })));
      } catch (e:any) { if (alive) setErr(e?.message ?? String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [paramsId]);

  // ---------- FETCH: konfiguracije ----------
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    (async () => {
      try {
        setLoadingSnaps(true);
        const { data, error } = await supabase
          .from("configurations")
          .select("id, name, created_at, brp_limit, ratio, tolerance")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (alive) setSnapshots(data ?? []);
      } catch (e) { console.error(e); }
      finally { if (alive) setLoadingSnaps(false); }
    })();
    return () => { alive = false; };
  }, [projectId]);

  // ---------- helpers ----------
  function normalizeShares(arr: UnitType[], pinnedId?: string) {
    const lockedSum = arr.filter(t => t.locked).reduce((s,t)=>s+(Number(t.share)||0),0);
    const pinned = pinnedId ? arr.find(t=>t.id===pinnedId) : undefined;
    const pinnedShare = pinned && !pinned.locked ? (Number(pinned.share)||0) : 0;
    const free = arr.filter(t=>!t.locked && t.id!==pinnedId);
    const freeSum = free.reduce((s,t)=>s+(Number(t.share)||0),0);
    const targetFree = Math.max(0, 100-lockedSum-pinnedShare);
    if (free.length===0 || freeSum===0) return arr;
    return arr.map(t => (t.locked || t.id===pinnedId) ? t : ({...t, share:(t.share/freeSum)*targetFree}));
  }

  const base = useMemo(() => {
    const items = types.map(t => {
      const brpPerUnit = Math.max(1, Math.round((t.neto||0)/RATIO));
      const netoPerUnit = Math.round(brpPerUnit*RATIO);
      const brpTarget = brpLimit*(Number(t.share)||0)/100;
      const units = Math.max(0, Math.round(brpTarget/brpPerUnit));
      const achievedBrp = units*brpPerUnit;
      return { ...t, brpPerUnit, netoPerUnit, brpTarget, units, achievedBrp };
    });
    return {
      items,
      totalAchieved: items.reduce((s,i)=>s+i.achievedBrp,0),
      totalNeto:     items.reduce((s,i)=>s+i.netoPerUnit*i.units,0)
    };
  }, [types, brpLimit]);

  const barData = base.items.map((i,idx)=>({ name:i.code, units:i.units, color:COLORS[idx%COLORS.length] }));

  // ---------- autosave BRP ----------
  const brpInitial = useRef(true);
  useEffect(() => {
    if (!projectId) return;
    if (brpInitial.current) { brpInitial.current=false; return; }
    const h = setTimeout(async ()=>{
      try {
        const { error } = await supabase.from("projects").update({ brp_limit: brpLimit }).eq("id", projectId);
        if (error) console.error("Spremanje BRP nije uspjelo:", error.message);
      } catch(e){ console.error(e); }
    }, 500);
    return ()=>clearTimeout(h);
  }, [brpLimit, projectId]);

  // ---------- save shares (debounced) ----------
  const saveSharesTimer = useRef<number|null>(null);
  function saveSharesDebounced(next: UnitType[]) {
    if (!projectId) return;
    if (saveSharesTimer.current) window.clearTimeout(saveSharesTimer.current);
    saveSharesTimer.current = window.setTimeout(async ()=>{
      try{
        const payload = next.map(t=>({ id:t.id, share: Math.round((t.share||0)*100)/100 }));
        const results = await Promise.all(payload.map(p=>supabase.from("project_unit_types").update({share:p.share}).eq("id", p.id)));
        const firstErr = results.find(r=>(r as any).error)?.error;
        if (firstErr) console.error("Spremanje udjela nije uspjelo:", firstErr.message);
      }catch(e){ console.error(e); }
    },500);
  }

  // ---------- save single field (debounced) ----------
  const saveTypeTimers = useRef<Record<string,number>>({});
  function saveTypeDebounced(id:string, patch: Partial<Pick<UnitType,"neto"|"locked"|"share">>) {
    if (!projectId) return;
    const key = id+":"+Object.keys(patch).sort().join(",");
    if (saveTypeTimers.current[key]) window.clearTimeout(saveTypeTimers.current[key]);
    saveTypeTimers.current[key] = window.setTimeout(async ()=>{
      try{ const { error } = await supabase.from("project_unit_types").update(patch).eq("id", id); if (error) console.error(error.message); }
      catch(e){ console.error(e); }
    },400);
  }

  // ---------- UI akcije ----------
  function changeUnits(id:string, unitsIn:number){
    const targetUnits = Math.max(0, Math.round(Number(unitsIn)||0));
    setTypes(prev=>{
      const t = prev.find(x=>x.id===id); if(!t) return prev;
      const brpPerUnit = Math.max(1, Math.round((t.neto||0)/RATIO));
      const newShare = (brpPerUnit*targetUnits)/Math.max(1,brpLimit)*100;
      const updated = prev.map(x=>x.id===id?{...x,share:newShare}:x);
      const normalized = normalizeShares(updated, id).map(y=>({...y, share:Math.round(y.share*100)/100}));
      saveSharesDebounced(normalized);
      return normalized;
    });
  }
  function changeNeto(id:string, value:string){
    const n = Math.max(10, Math.round(Number(value)||0));
    setTypes(prev=>prev.map(x=>x.id===id?{...x,neto:n}:x));
    saveTypeDebounced(id,{neto:n});
  }
  function toggleLock(id:string){
    setTypes(prev=>prev.map(x=>x.id===id?{...x,locked:!x.locked}:x));
    const nextLocked = !(types.find(x=>x.id===id)?.locked);
    saveTypeDebounced(id,{locked:nextLocked});
  }

  // ---------- rename projekta ----------
  async function saveProjectName() {
    if (!projectId) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) { setEditingName(false); setNameDraft(name); return; }
    try {
      const { error } = await supabase.from("projects").update({ name: trimmed }).eq("id", projectId);
      if (error) throw error;
      setName(trimmed);
      setEditingName(false);
      setNotice("Naziv projekta ažuriran.");
      setTimeout(()=>setNotice(null),2500);
    } catch (e:any) {
      setNotice(`Greška pri promjeni naziva: ${e?.message ?? e}`);
      setTimeout(()=>setNotice(null),3500);
    }
  }

  // ---------- XLS export ----------
  async function exportXLS() {
    try {
      const XLSX = await import("xlsx");
      const rows = base.items.map(i => ({
        TIP: i.code,
        NETO_po_stanu_m2: i.netoPerUnit,
        BRP_po_stanu_m2: i.brpPerUnit,
        "UDJEL_%": Math.round(i.share),
        BROJ_STANOVA: i.units,
        NETO_ukupno_m2: i.netoPerUnit * i.units,
        BRP_ukupno_m2: i.achievedBrp,
      }));
      rows.push({ TIP: "UKUPNO", NETO_ukupno_m2: base.totalNeto, BRP_ukupno_m2: base.totalAchieved } as any);

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Konfiguracija");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "projekt").replace(/\s+/g,"_")}_konfiguracija.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e:any) {
      setNotice(`Export nije uspio: ${e?.message ?? e}`);
      setTimeout(()=>setNotice(null),3500);
    }
  }

  // ---------- SNAPSHOTI ----------
  async function saveSnapshot(){
    try{
      if(!projectId) return;
      const defaultName = `Konfiguracija ${new Date().toLocaleString('hr-HR')}`;
      const name = window.prompt("Naziv konfiguracije:", defaultName);
      if(!name) return;
      setSaving(true); setNotice(null);
      const { data: conf, error: e1 } = await supabase.from("configurations")
        .insert({ project_id:projectId, name, brp_limit:brpLimit, ratio:RATIO, tolerance })
        .select("id, name, created_at, brp_limit, ratio, tolerance").single();
      if (e1) throw e1;
      const itemsPayload = base.items.map(i=>({
        configuration_id: conf.id, project_unit_type_id:i.id,
        share: Math.round((i.share||0)*100)/100, units:i.units,
        neto_per_unit:i.netoPerUnit, brp_per_unit:i.brpPerUnit
      }));
      const { error: e2 } = await supabase.from("configuration_items").insert(itemsPayload);
      if (e2) throw e2;
      setSnapshots(prev=>[conf as Snapshot, ...prev]);
      setNotice("Konfiguracija spremljena.");
    }catch(e:any){ setNotice(`Greška pri spremanju: ${e?.message ?? e}`); }
    finally{ setSaving(false); setTimeout(()=>setNotice(null),4000); }
  }
  async function renameSnapshot(conf:Snapshot){
    const newName = window.prompt("Novi naziv konfiguracije:", conf.name);
    if(!newName || newName===conf.name) return;
    try{
      const { error } = await supabase.from("configurations").update({ name:newName }).eq("id", conf.id);
      if (error) throw error;
      setSnapshots(prev=>prev.map(s=>s.id===conf.id?{...s,name:newName}:s));
    }catch(e:any){ setNotice(`Greška pri preimenovanju: ${e?.message ?? e}`); setTimeout(()=>setNotice(null),4000); }
  }
  async function loadSnapshot(confId:string){
    try{
      if(!projectId) return;
      setNotice(null);
      const { data: conf, error: e0 } = await supabase.from("configurations").select("id, brp_limit, ratio, tolerance").eq("id",confId).single();
      if (e0) throw e0;
      const { data: items, error: e1 } = await supabase.from("configuration_items")
        .select("project_unit_type_id, share, neto_per_unit, brp_per_unit").eq("configuration_id", confId);
      if (e1) throw e1;
      const byId = new Map(items?.map((r:any)=>[r.project_unit_type_id,r]));
      setBrpLimit(conf.brp_limit ?? brpLimit); setTolerance(conf.tolerance ?? tolerance);
      setTypes(prev=>prev.map(t=>{
        const row = byId.get(t.id); if(!row) return t;
        return { ...t, share:Number(row.share)||0, neto:Math.max(10, Math.round(Number(row.neto_per_unit)||t.neto)) };
      }));
      setNotice("Konfiguracija učitana."); setTimeout(()=>setNotice(null),3000);
    }catch(e:any){ setNotice(`Greška pri učitavanju: ${e?.message ?? e}`); setTimeout(()=>setNotice(null),4000); }
  }
  async function deleteSnapshot(confId:string){
    if(!window.confirm("Obrisati konfiguraciju? Ova radnja je trajna.")) return;
    try{
      const { error } = await supabase.from("configurations").delete().eq("id", confId);
      if (error) throw error;
      setSnapshots(prev=>prev.filter(s=>s.id!==confId));
    }catch(e:any){ setNotice(`Greška pri brisanju: ${e?.message ?? e}`); setTimeout(()=>setNotice(null),4000); }
  }

  // ---------- RENDER ----------
  if (loading) return <main className="p-4">Učitavanje…</main>;
  if (err)     return <main className="p-4 text-red-700">Greška: {err}</main>;

  return (
    <main className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/app/projects" className="text-sm text-blue-600 hover:underline" title="Natrag na listu projekata">
            ← Projekti
          </Link>
          <div className="text-sm text-gray-500 mt-1">Projekt</div>

          {!editingName ? (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{name}</h2>
              <button className="px-2 py-1 rounded-lg border text-xs" onClick={()=>{ setEditingName(true); setNameDraft(name); }} title="Preimenuj projekt">
                Uredi
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input className="px-3 py-2 border rounded-xl" value={nameDraft} autoFocus
                     onChange={e=>setNameDraft(e.target.value)}
                     onKeyDown={e=>{ if (e.key==='Enter') saveProjectName(); if (e.key==='Escape'){ setEditingName(false); setNameDraft(name); } }} />
              <button className="px-3 py-2 rounded-xl border bg-black text-white" onClick={saveProjectName}>Spremi</button>
              <button className="px-3 py-2 rounded-xl border" onClick={()=>{ setEditingName(false); setNameDraft(name); }}>Odustani</button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="text-sm text-gray-500">BRP stambenog dijela zgrade</div>
          <input className="px-3 py-2 border rounded-xl w-40" type="number" value={brpLimit} onChange={e=>setBrpLimit(Number(e.target.value)||0)} />
          <button onClick={exportXLS} className="px-4 py-2 rounded-xl border">Preuzmi XLS</button>
          <button
            onClick={saveSnapshot}
            disabled={saving||!projectId}
            className={`px-4 py-2 rounded-xl text-white ${saving?"bg-gray-400":"bg-black hover:opacity-90"}`}
            title="Spremi aktualnu raspodjelu kao konfiguraciju"
          >
            {saving ? "Spremam…" : "Spremi konfiguraciju"}
          </button>

          {/* trajanje tokena */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Trajanje tokena (sati)</label>
              <input
                className="px-3 py-2 border rounded-xl w-28"
                type="number"
                min={1}
                value={hours}
                onChange={e=>setHours(Math.max(1, Number(e.target.value)||1))}
              />
            </div>
          </div>

          {/* dugi token linkovi */}
          <button
            disabled={!projectId || copyView.busy}
            onClick={() => projectId && copyView.run((m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); }, hours)}
            className="px-4 py-2 rounded-xl border"
            title="Generiraj i kopiraj VIEW link"
          >
            {copyView.busy ? "…" : "Kopiraj VIEW link"}
          </button>
          <button
            disabled={!projectId || copyEdit.busy}
            onClick={() => projectId && copyEdit.run((m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); }, hours)}
            className="px-4 py-2 rounded-xl border bg-amber-500 text-white"
            title="Generiraj i kopiraj EDIT link"
          >
            {copyEdit.busy ? "…" : "Kopiraj EDIT link"}
          </button>

          {/* kratki linkovi */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Kratko ime (slug)</label>
              <input
                className="px-3 py-2 border rounded-xl w-48"
                placeholder="npr. ivan"
                value={slug}
                onChange={e=>setSlug(slugify(e.target.value))}
              />
            </div>
            <button
              disabled={!projectId || shortView.busy}
              onClick={()=> shortView.run(slug, (m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); }, hours)}
              className="px-4 py-2 rounded-xl border"
              title="Kreiraj i kopiraj KRATKI VIEW link (r/{slug})"
            >
              {shortView.busy ? "…" : "Kratki VIEW"}
            </button>
            <button
              disabled={!projectId || shortEdit.busy}
              onClick={()=> shortEdit.run(slug, (m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); }, hours)}
              className="px-4 py-2 rounded-xl border bg-amber-500 text-white"
              title="Kreiraj i kopiraj KRATKI EDIT link (r/{slug})"
            >
              {shortEdit.busy ? "…" : "Kratki EDIT"}
            </button>
          </div>
        </div>
      </div>

      {notice && <div className="rounded-xl p-3 bg-emerald-50 text-emerald-800 border border-emerald-200">{notice}</div>}

      {/* Sačuvane konfiguracije */}
      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Sačuvane konfiguracije</h3>
          <div className="text-xs text-gray-500">{loadingSnaps ? "Učitavanje…" : `(${snapshots.length})`}</div>
        </div>
        {snapshots.length===0 ? (
          <div className="text-sm text-gray-500">Još nema sačuvanih konfiguracija.</div>
        ) : (
          <div className="grid gap-2">
            {snapshots.map(s=>(
              <div key={s.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
                <div className="text-sm">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-gray-500">{new Date(s.created_at).toLocaleString('hr-HR')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>loadSnapshot(s.id)} className="px-3 py-1 rounded-lg border hover:bg-gray-50">Učitaj</button>
                  <button onClick={()=>renameSnapshot(s)} className="px-3 py-1 rounded-lg border hover:bg-gray-50">Preimenuj</button>
                  <button onClick={()=>deleteSnapshot(s.id)} className="px-3 py-1 rounded-lg border bg-red-600 text-white hover:opacity-90">Obriši</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tipovi i udjeli */}
      <section className="card">
        <h3 className="font-semibold mb-2">Tipovi i udjeli</h3>
        <div className="grid gap-3">
          {base.items.map((i, idx) => {
            const t = types[idx]; const maxUnits = Math.max(0, Math.floor(brpLimit / i.brpPerUnit));
            return (
              <div key={t.id} className="grid items-center gap-3" style={{gridTemplateColumns:'100px 1.1fr 4.5fr 1.2fr'}}>
                <div className="flex items-center gap-2">
                  <div className="font-bold">{t.code}</div>
                  <button onClick={()=>toggleLock(t.id)} className={`px-2 py-1 rounded-lg border text-sm ${t.locked?"bg-red-100":"bg-gray-100"}`} title={t.locked?"Otključaj udio":"Zaključaj udio"}>{t.locked?"🔒":"🔓"}</button>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">NETO po stanu (m²)</div>
                  <input className="px-3 py-2 border rounded-xl w-full" type="number" min={10} value={t.neto} onChange={e=>changeNeto(t.id, e.target.value)} />
                  <div className="text-xs text-gray-500 mt-1">BRP po stanu: <b>{fmt0(i.brpPerUnit)}</b> m²</div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-xs text-gray-500">Udio (%) <b className="text-slate-700">{Math.round(t.share)}%</b></div>
                    <div className="text-xs text-slate-700">Broj stanova: <b>{fmt0(i.units)}</b></div>
                  </div>
                  <input className="w-full mt-2" type="range" min={0} max={maxUnits} step={1} value={i.units} onChange={e=>changeUnits(t.id, Number(e.target.value))} />
                </div>
                <div>
                  <div className="text-xs text-slate-700">NETO: <b>{fmt0(i.netoPerUnit*i.units)}</b> m²</div>
                  <div className="text-xs text-slate-700 mt-1">BRP: <b>{fmt0(i.achievedBrp)}</b> m²</div>
                </div>
              </div>
            );
          })}
          <div className="text-right text-sm text-slate-700">Ukupno stanova: <b>{fmt0(base.items.reduce((s,i)=>s+i.units,0))}</b></div>
        </div>
      </section>

      {/* kartice s grafikonima */}
      <section className="card">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl p-3 bg-green-50 text-green-900">
            <div>ukupno NETO: <b>{fmt0(base.totalNeto)}</b> m²</div>
            <div className="mt-1">ukupno BRP: <b>{fmt0(base.totalAchieved)}</b> m²</div>
          </div>
          <div className="md:col-span-1">
            <div style={{height:220}}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top:8, right:8, bottom:32, left:8 }}>
                  <Pie data={types.map((t,i)=>({name:t.code, value:Math.round(t.share)}))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                    {types.map((_,idx)=><Cell key={idx} />)}
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
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="units" radius={[8,8,0,0]}>
                    {barData.map((_,idx)=><Cell key={idx} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
