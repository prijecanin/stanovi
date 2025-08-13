"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

type LinkAction = (state: any, formData: FormData) => Promise<{ link?: string; error?: string }>;
type Props = {
  paramsId: string;
  makeViewLink: LinkAction;
  makeEditLink: LinkAction;
};

const RATIO = 0.65;
const COLORS = ['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#14b8a6'] as const;

type UnitType = { id: string; code: string; desc: string; neto: number; share: number; locked: boolean; };
type Snapshot = { id: string; name: string; created_at: string; brp_limit: number; ratio: number; tolerance: number; };

const fmt0 = (n:number)=>new Intl.NumberFormat('hr-HR',{maximumFractionDigits:0}).format(Math.round(n||0));

function useCopyLink(action: LinkAction, projectId: string, scope: "view"|"edit") {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  async function run(copyNotice: (msg: string)=>void) {
    if (!projectId) {
      copyNotice("Nedostaje projectId (stranica još učitava projekt).");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);       // server action će i bez ovoga pasti na params.id, ali šaljemo eksplicitno
      const res = await action({}, fd);
      if (res?.error) throw new Error(res.error);
      if (!res?.link) throw new Error("Server nije vratio link.");
      await navigator.clipboard.writeText(res.link);
      copyNotice(scope === "view" ? "VIEW link kopiran." : "EDIT link kopiran.");
    } catch (e:any) {
      const msg = e?.message || String(e);
      setErr(msg);
      copyNotice(`Greška: ${msg}`);
      console.error("generate link error:", msg);
    } finally { setBusy(false); }
  }
  return { run, busy, err };
}

export default function AdminProjectClient({ paramsId, makeViewLink, makeEditLink }: Props) {
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

  const copyView = useCopyLink(makeViewLink, projectId || "", "view");
  const copyEdit = useCopyLink(makeEditLink, projectId || "", "edit");

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

  async function saveSnapshot(){ /* isti kod kao prije */ }
  async function renameSnapshot(conf:Snapshot){ /* isti kod kao prije */ }
  async function loadSnapshot(confId:string){ /* isti kod kao prije */ }
  async function deleteSnapshot(confId:string){ /* isti kod kao prije */ }

  if (loading) return <main className="p-4">Učitavanje…</main>;
  if (err)     return <main className="p-4 text-red-700">Greška: {err}</main>;

  return (
    <main className="grid gap-4">
      {/* header… */}
      <div className="flex items-end gap-3">
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

        {/* “stari” javni view link po želji */}
        <button
          onClick={() => {
            if (!projectId) return;
            const url = `${window.location.origin}/s/${projectId}`;
            navigator.clipboard.writeText(url).then(
              () => { setNotice("Link za klijenta je kopiran u clipboard."); setTimeout(()=>setNotice(null), 2500); },
              () => { setNotice("Ne mogu kopirati link. Probaj ručno."); setTimeout(()=>setNotice(null), 3500); },
            );
          }}
          className="px-4 py-2 rounded-xl border"
          title="Kopiraj javni read-only link"
        >
          Kopiraj link (view – bez uređivanja)
        </button>

        {/* NOVO: generiraj i kopiraj VIEW/EDIT token linkove */}
        <button
          disabled={!projectId || copyView.busy}
          onClick={() => projectId && copyView.run((m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); })}
          className="px-4 py-2 rounded-xl border"
          title="Generiraj i kopiraj VIEW link"
        >
          {copyView.busy ? "…" : "Kopiraj VIEW link"}
        </button>

        <button
          disabled={!projectId || copyEdit.busy}
          onClick={() => projectId && copyEdit.run((m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); })}
          className="px-4 py-2 rounded-xl border bg-amber-500 text-white"
          title="Generiraj i kopiraj EDIT link"
        >
          {copyEdit.busy ? "…" : "Kopiraj EDIT link"}
        </button>
      </div>

      {notice && <div className="rounded-xl p-3 bg-emerald-50 text-emerald-800 border border-emerald-200">{notice}</div>}

      {/* … ostatak tvoje stranice (grafovi, tipovi, snapshoti) ostaje isti … */}
    </main>
  );
}
