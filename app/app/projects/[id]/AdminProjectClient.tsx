"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

/** DODANO: tip server akcije koju primamo kroz props */
type LinkAction = (state: any, formData: FormData) => Promise<{link?: string; error?: string}>;
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

/** DODANO: minimalni hook da pozovemo server action i kopiramo link */
function useCopyLink(action: LinkAction, projectId: string, scope: "view"|"edit") {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  async function run(copyNotice: (msg: string)=>void) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("scope", scope);
      const res = await action({}, fd);        // poziv server actiona
      if (res?.error) throw new Error(res.error);
      if (!res?.link) throw new Error("Nema linka");
      await navigator.clipboard.writeText(res.link);
      copyNotice(scope === "view" ? "VIEW link kopiran." : "EDIT link kopiran.");
    } catch (e:any) {
      setErr(e?.message || String(e));
      copyNotice("Greška pri generiranju linka.");
    } finally { setBusy(false); }
  }
  return { run, busy, err };
}

export default function ProjectPage({ paramsId, makeViewLink, makeEditLink }: Props) {
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

  // === GENERIRANJE LINKOVA – 2 gumba ===
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

  // … (ostatak TVOG koda ostaje isti – samo tamo gdje koristiš `params.id` zamijeni s `paramsId`)

  // ---------- RENDER (samo gumbi dio izmijenjen) ----------
  if (loading) return <main className="p-4">Učitavanje…</main>;
  if (err)     return <main className="p-4 text-red-700">Greška: {err}</main>;

  // … sav TVOJ JSX do dijela s gumbima (ostaje kako je)

  return (
    <main className="grid gap-4">
      {/* … tvoj gornji header … */}
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

        {/* STARI gumb za kopiranje javnog linka može ostati po želji */}
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

        {/* NOVO: dva gumba koja zovu server action i odmah kopiraju */}
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

      {/* … sve ostalo iz tvog rendera ostaje nepromijenjeno … */}
    </main>
  );
}
