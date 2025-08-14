"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

type LinkAction = (state: any, formData: FormData) => Promise<{ link?: string; error?: string; shortUrl?: string }>;
type ServerAction = (state: any, formData: FormData) => Promise<{ ok?: boolean; error?: string }>;

type Props = {
  paramsId: string;
  makeViewLink: LinkAction;
  makeEditLink: LinkAction;
  makeShortViewLink: LinkAction; // ostavljamo u propovima radi kompatibilnosti (ne koristimo)
  makeShortEditLink: LinkAction; // —||—
  upsertUnitTypes: ServerAction;
  deleteUnitType: ServerAction;
};

const RATIO = 0.65;

type UnitType = {
  id: string;
  code: string;
  desc: string;
  neto: number;
  share: number;
  locked: boolean;
  description?: string | null;
  neto_min?: number | null;
  neto_max?: number | null;
  neto_default?: number | null;
  idx?: number | null;
};
type Snapshot = { id: string; name: string; created_at: string; brp_limit: number; ratio: number; tolerance: number; };

const fmt0 = (n:number)=>new Intl.NumberFormat('hr-HR',{maximumFractionDigits:0}).format(Math.round(n||0));

function slugify(s: string) {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 48);
}

/* -------------------- Basic Auth helper + API short link helper -------------------- */
function ensureAdminAuthHeader(force = false): string | null {
  if (!force) {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("admin_basic_auth") : null;
    if (saved) return saved;
  }
  const user = typeof window !== "undefined" ? window.prompt("Admin korisničko ime:") : null;
  if (user == null) return null;
  const pass = typeof window !== "undefined" ? window.prompt("Admin lozinka:") : null;
  if (pass == null) return null;
  const hdr = "Basic " + btoa(`${user}:${pass}`);
  sessionStorage.setItem("admin_basic_auth", hdr);
  return hdr;
}

function useCreateShortAPI(projectId: string, scope: "view"|"edit") {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  async function run(slugIn: string, notify: (m:string)=>void, hours: number) {
    if (!projectId) { notify("Nedostaje projectId."); return; }
    const slug = slugify(slugIn);
    if (!slug) { notify("Upiši kratko ime (slug)."); return; }
    const ttl = Math.max(1, Math.round(hours)||1);

    setBusy(true); setErr(null);
    try {
      let auth = ensureAdminAuthHeader();
      if (!auth) throw new Error("Nisu uneseni admin kredencijali.");

      const res = await fetch("/api/admin/create-short-link", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: auth },
        body: JSON.stringify({ projectId, scope, slug, ttlHours: ttl }),
      });

      if (res.status === 401) {
        sessionStorage.removeItem("admin_basic_auth");
        auth = ensureAdminAuthHeader(true);
        if (!auth) throw new Error("Nisu uneseni admin kredencijali.");
        const retry = await fetch("/api/admin/create-short-link", {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: auth },
          body: JSON.stringify({ projectId, scope, slug, ttlHours: ttl }),
        });
        if (!retry.ok) {
          const j = await retry.json().catch(()=>({}));
          throw new Error(j?.error || `Greška ${retry.status}`);
        }
        const j2 = await retry.json();
        await navigator.clipboard.writeText(j2.shortUrl);
        notify(`Kratki ${scope.toUpperCase()} link (${ttl}h) kopiran: ${j2.shortUrl}`);
        return;
      }

      if (!res.ok) {
        const j = await res.json().catch(()=>({}));
        throw new Error(j?.error || `Greška ${res.status}`);
      }

      const j = await res.json();
      await navigator.clipboard.writeText(j.shortUrl);
      notify(`Kratki ${scope.toUpperCase()} link (${ttl}h) kopiran: ${j.shortUrl}`);
    } catch (e:any) {
      const msg = e?.message || String(e);
      setErr(msg);
      notify(`Greška: ${msg}`);
    } finally { setBusy(false); }
  }

  return { run, busy, err };
}

/* -------------------- Hook za DUGE linkove (server akcije – ostaju) -------------------- */
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

/* -------------------- ADMIN KOMPONENTA -------------------- */
export default function AdminProjectClient({
  paramsId, makeViewLink, makeEditLink, makeShortViewLink, makeShortEditLink, upsertUnitTypes, deleteUnitType
}: Props) {
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

  const [hours, setHours] = useState<number>(168); // TTL za linkove
  const [slug, setSlug] = useState("");            // slug za kratke linkove

  // dugi linkovi (server akcije)
  const copyView  = useCopyLink(makeViewLink,  projectId || "", "view");
  const copyEdit  = useCopyLink(makeEditLink,  projectId || "", "edit");

  // kratki linkovi (API)
  const shortView = useCreateShortAPI(projectId || "", "view");
  const shortEdit = useCreateShortAPI(projectId || "", "edit");

  /* -------- FETCH: projekt + tipovi -------- */
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
          .select("id, code, description, neto, share, locked, idx, neto_min, neto_max, neto_default")
          .eq("project_id", pid)
          .order("idx", { ascending: true })
          .order("code", { ascending: true });
        if (et) throw et;

        if (!alive) return;
        setProjectId(pid);
        setName(proj.name);
        setNameDraft(proj.name);
        setBrpLimit(proj.brp_limit ?? 12500);
        setTolerance(proj.tolerance ?? 50);
        setTypes((rows ?? []).map(r => ({
          id:r.id, code:r.code, desc:r.description ?? "", neto:r.neto,
          share:Number(r.share)||0, locked:!!r.locked,
          description:r.description ?? null,
          neto_min: r.neto_min ?? null,
          neto_max: r.neto_max ?? null,
          neto_default: r.neto_default ?? (r.neto ?? null),
          idx: r.idx ?? null
        })));
      } catch (e:any) { if (alive) setErr(e?.message ?? String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [paramsId]);

  /* -------- FETCH: konfiguracije -------- */
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

  /* ---------- Matematika ---------- */
  const base = useMemo(() => {
    const items = types.map(t => {
      const netoPerUnit = Math.round(Number((t.neto_default ?? t.neto) || 0));
      const brpPerUnit  = Math.max(1, Math.round(netoPerUnit / RATIO));
      const brpTarget   = brpLimit * (Number(t.share)||0) / 100;
      const units       = Math.max(0, Math.round(brpTarget / brpPerUnit));
      const achievedBrp = units * brpPerUnit;
      return { ...t, netoPerUnit, brpPerUnit, brpTarget, units, achievedBrp };
    });
    return {
      items,
      totalAchieved: items.reduce((s,i)=>s+i.achievedBrp,0),
      totalNeto:     items.reduce((s,i)=>s+i.netoPerUnit*i.units,0)
    };
  }, [types, brpLimit]);

  /* ---------- Debounce za inline spremanja ---------- */
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

  /* ---------- Admin uređivanje tipova ---------- */
  function addEmptyType() {
    if (!projectId) return;
    setTypes(prev => [
      ...prev,
      {
        id: "new:"+crypto.randomUUID(),
        code: "",
        desc: "",
        neto: 50,
        share: 0,
        locked: false,
        description: "",
        neto_min: null,
        neto_max: null,
        neto_default: null,
        idx: (prev.length ? (prev[prev.length-1].idx ?? prev.length-1)+1 : 0)
      }
    ]);
  }

  function updateTypeLocal(id:string, patch: Partial<UnitType>) {
    setTypes(prev => prev.map(t => t.id === id ? {...t, ...patch} : t));
  }

  async function saveAllTypes() {
    if (!projectId) return;
    for (const t of types) {
      if (!t.code?.trim()) { setNotice(`Kod je obavezan (prazan red).`); return; }
      if (t.neto_min!=null && t.neto_max!=null && Number(t.neto_min)>Number(t.neto_max)) {
        setNotice(`Greška raspona za ${t.code}: neto_min > neto_max`); return;
      }
      if (t.neto_default!=null) {
        if (t.neto_min!=null && Number(t.neto_default)<Number(t.neto_min)) { setNotice(`Greška raspona za ${t.code}: default ispod min`); return; }
        if (t.neto_max!=null && Number(t.neto_default)>Number(t.neto_max)) { setNotice(`Greška raspona za ${t.code}: default iznad max`); return; }
      }
    }
    const payload = types.map(t => ({
      id: t.id.startsWith("new:") ? null : t.id,
      project_id: projectId!,
      code: t.code.trim(),
      description: (t.description ?? t.desc ?? "").trim() || null,
      neto_min: t.neto_min!=null ? Number(t.neto_min) : null,
      neto_max: t.neto_max!=null ? Number(t.neto_max) : null,
      neto_default: t.neto_default!=null ? Number(t.neto_default) : (t.neto ?? null),
      share: Number.isFinite(t.share) ? Number(t.share) : 0,
      locked: !!t.locked,
      idx: t.idx ?? null
    }));
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    const res = await upsertUnitTypes({}, fd);
    if (res?.error) { setNotice(`Greška pri spremanju: ${res.error}`); setTimeout(()=>setNotice(null),4000); return; }

    const { data: rows, error } = await supabase
      .from("project_unit_types")
      .select("id, code, description, neto, share, locked, idx, neto_min, neto_max, neto_default")
      .eq("project_id", projectId)
      .order("idx", { ascending: true })
      .order("code", { ascending: true });
    if (error) { setNotice(`Spremanje ok, ali ponovni dohvat nije uspio: ${error.message}`); return; }

    setTypes((rows ?? []).map(r => ({
      id:r.id, code:r.code, desc:r.description ?? "", neto:r.neto,
      share:Number(r.share)||0, locked:!!r.locked,
      description:r.description ?? null,
      neto_min: r.neto_min ?? null,
      neto_max: r.neto_max ?? null,
      neto_default: r.neto_default ?? (r.neto ?? null),
      idx: r.idx ?? null
    })));
    setNotice("Tipovi spremljeni."); setTimeout(()=>setNotice(null),2500);
  }

  async function removeType(id:string) {
    if (id.startsWith("new:")) {
      setTypes(prev => prev.filter(t => t.id !== id));
      return;
    }
    const fd = new FormData(); fd.set("id", id);
    const res = await deleteUnitType({}, fd);
    if (res?.error) { setNotice(`Greška pri brisanju: ${res.error}`); setTimeout(()=>setNotice(null),4000); return; }
    setTypes(prev => prev.filter(t => t.id !== id));
  }

  async function saveProjectName() {
    if (!projectId) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) { setEditingName(false); setNameDraft(name); return; }
    try {
      const { error } = await supabase.from("projects").update({ name: trimmed }).eq("id", projectId);
      if (error) throw error;
      setName(trimmed); setEditingName(false);
      setNotice("Naziv projekta ažuriran."); setTimeout(()=>setNotice(null),2500);
    } catch (e:any) {
      setNotice(`Greška pri promjeni naziva: ${e?.message ?? e}`); setTimeout(()=>setNotice(null),3500);
    }
  }

  if (loading) return <main className="p-4">Učitavanje…</main>;
  if (err)     return <main className="p-4 text-red-700">Greška: {err}</main>;

  return (
    <main className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/app/projects" className="text-sm text-blue-600 hover:underline">← Projekti</Link>
          <div className="text-sm text-gray-500 mt-1">Projekt</div>
          {!editingName ? (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{name}</h2>
              <button className="px-2 py-1 rounded-lg border text-xs" onClick={()=>{ setEditingName(true); setNameDraft(name); }}>Uredi</button>
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Trajanje tokena (sati)</label>
            <input className="px-3 py-2 border rounded-xl w-28" type="number" min={1}
                   value={hours} onChange={e=>setHours(Math.max(1, Number(e.target.value)||1))}/>
          </div>
          {/* DUGI linkovi (server akcije – ostaju) */}
          <button disabled={!projectId || copyView.busy}
                  onClick={() => projectId && copyView.run((m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); }, hours)}
                  className="px-4 py-2 rounded-xl border"> {copyView.busy ? "…" : "Kopiraj VIEW link"} </button>
          <button disabled={!projectId || copyEdit.busy}
                  onClick={() => projectId && copyEdit.run((m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); }, hours)}
                  className="px-4 py-2 rounded-xl border bg-amber-500 text-white"> {copyEdit.busy ? "…" : "Kopiraj EDIT link"} </button>

          {/* KRATKI linkovi (preko API-ja) */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Kratko ime (slug)</label>
              <input className="px-3 py-2 border rounded-xl w-48" placeholder="npr. ivan"
                     value={slug} onChange={e=>setSlug(slugify(e.target.value))}/>
            </div>
            <button disabled {!projectId || shortView.busy}
                    onClick={()=> shortView.run(slug, (m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); }, hours)}
                    className="px-4 py-2 rounded-xl border"> {shortView.busy ? "…" : "Kratki VIEW"} </button>
            <button disabled={!projectId || shortEdit.busy}
                    onClick={()=> shortEdit.run(slug, (m)=>{ setNotice(m); setTimeout(()=>setNotice(null),2500); }, hours)}
                    className="px-4 py-2 rounded-xl border bg-amber-500 text-white"> {shortEdit.busy ? "…" : "Kratki EDIT"} </button>
          </div>
        </div>
      </div>

      {notice && <div className="rounded-xl p-3 bg-emerald-50 text-emerald-800 border border-emerald-200">{notice}</div>}

      {/* ---------------- Admin – Tipovi stanova ---------------- */}
      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Tipovi stanova (admin)</h3>
          <div className="flex gap-2">
            <button onClick={addEmptyType} className="px-3 py-2 rounded-xl border">Dodaj tip</button>
            <button onClick={saveAllTypes} className="px-3 py-2 rounded-xl border bg-black text-white">Spremi sve</button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-separate" style={{borderSpacing:"0 8px"}}>
            <thead>
              <tr className="text-left text-gray-600">
                <th className="px-3">Kod</th>
                <th className="px-3">Naziv / opis</th>
                <th className="px-3">NETO min</th>
                <th className="px-3">NETO default</th>
                <th className="px-3">NETO max</th>
                <th className="px-3">Udio %</th>
                <th className="px-3">Zaključan</th>
                <th className="px-3"></th>
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t.id} className="bg-white border rounded-xl">
                  <td className="px-3 py-2">
                    <input className="px-2 py-1 border rounded-lg w-28"
                           value={t.code} onChange={e=>updateTypeLocal(t.id, { code: e.target.value })}/>
                  </td>
                  <td className="px-3 py-2">
                    <input className="px-2 py-1 border rounded-lg w-80"
                           value={t.description ?? t.desc ?? ""}
                           onChange={e=>updateTypeLocal(t.id, { description: e.target.value })}/>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className="px-2 py-1 border rounded-lg w-28"
                           value={t.neto_min ?? ""} onChange={e=>updateTypeLocal(t.id, { neto_min: e.target.value === "" ? null : Number(e.target.value) })}/>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className="px-2 py-1 border rounded-lg w-28"
                           value={t.neto_default ?? ""} onChange={e=>updateTypeLocal(t.id, { neto_default: e.target.value === "" ? null : Number(e.target.value) })}/>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className="px-2 py-1 border rounded-lg w-28"
                           value={t.neto_max ?? ""} onChange={e=>updateTypeLocal(t.id, { neto_max: e.target.value === "" ? null : Number(e.target.value) })}/>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className="px-2 py-1 border rounded-lg w-24"
                           value={Math.round(t.share||0)} onChange={e=>updateTypeLocal(t.id, { share: Number(e.target.value)||0 })}/>
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={!!t.locked}
                           onChange={e=>updateTypeLocal(t.id, { locked: e.target.checked })}/>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={()=>removeType(t.id)} className="px-3 py-1 rounded-lg border bg-red-600 text-white">Obriši</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-gray-500 mt-2">
            Validacija: min ≤ default ≤ max (ako su polja popunjena).
          </div>
        </div>
      </section>

      {/* Ostatak tvog prikaza (grafovi, slajderi…) ostaje isti; ako ga imaš ispod, ne diramo ga. */}
    </main>
  );
}
