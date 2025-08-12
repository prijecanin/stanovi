'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

type Project = {
  id: string;
  name: string;
  brp_limit: number;
};

const DEFAULT_SHARE = [
  { code: "1S", share: 9,  idx: 0 },
  { code: "2S", share: 50, idx: 1 },
  { code: "3S", share: 32, idx: 2 },
  { code: "4S", share: 9,  idx: 3 },
];

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, brp_limit")
      .order("created_at", { ascending: true });
    if (error) setErr(error.message);
    else setProjects(data ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function createProject() {
    const name = window.prompt("Naziv novog projekta:", "Novi projekt");
    if (!name) return;
    try {
      setBusy(true);
      // 1) kreiraj projekt
      const { data: proj, error: ep } = await supabase
        .from("projects")
        .insert({ name, brp_limit: 12500, ratio: 0.65, tolerance: 50 })
        .select("id")
        .single();
      if (ep) throw ep;

      // 2) dohvati bazne tipove (1S–4S) s default NETO
      const { data: base, error: eb } = await supabase
        .from("unit_base_types")
        .select("code, description, default_neto, active");
      if (eb) throw eb;

      const byCode: Record<string, {code:string;description:string;default_neto:number}> = {};
      (base ?? []).forEach(b => { if (b.active !== false) byCode[b.code] = b; });

      // 3) pripremi početne redove za project_unit_types
      const rows = DEFAULT_SHARE
        .filter(s => byCode[s.code])
        .map(s => ({
          project_id: proj.id,
          code: s.code,
          description: byCode[s.code].description,
          neto: byCode[s.code].default_neto,
          share: s.share,
          locked: false,
          idx: s.idx
        }));

      if (rows.length === 0) {
        // fallback ako iz nekog razloga nema base tipova
        rows.push(
          { project_id: proj.id, code: "1S", description: "Studio / garsonjera", neto: 28, share: 9,  locked: false, idx: 0 },
          { project_id: proj.id, code: "2S", description: "Dnevni + 1 spavaća", neto: 45, share: 50, locked: false, idx: 1 },
          { project_id: proj.id, code: "3S", description: "Dnevni + 2 spavaće", neto: 65, share: 32, locked: false, idx: 2 },
          { project_id: proj.id, code: "4S", description: "Dnevni + 3 spavaće", neto: 90, share: 9,  locked: false, idx: 3 },
        );
      }

      const { error: ei } = await supabase.from("project_unit_types").insert(rows);
      if (ei) throw ei;

      // 4) idi odmah u novi projekt
      router.push(`/app/projects/${proj.id}`);
    } catch (e: any) {
      alert(`Greška pri dodavanju projekta: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function renameProject(p: Project) {
    const name = window.prompt("Novi naziv projekta:", p.name);
    if (!name || name === p.name) return;
    try {
      setBusy(true);
      const { error } = await supabase.from("projects").update({ name }).eq("id", p.id);
      if (error) throw error;
      await refresh();
    } catch (e: any) {
      alert(`Greška pri preimenovanju: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="grid gap-4 p-4">Učitavanje…</main>;
  if (err) return <main className="grid gap-4 p-4 text-red-700">Greška: {err}</main>;

  return (
    <main className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Projekti</h2>
        <button
          onClick={createProject}
          disabled={busy}
          className="px-3 py-2 rounded-xl border bg-black text-white disabled:opacity-50"
        >+ Novi projekt</button>
      </div>

      {projects.length === 0 ? (
        <div className="card">Nema projekata.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {projects.map(p => (
            <div key={p.id} className="card hover:shadow-sm">
              <div className="flex items-center justify-between">
                <Link href={`/app/projects/${p.id}`} className="text-lg font-semibold hover:underline">
                  {p.name}
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    onClick={()=>renameProject(p)}
                    className="px-2 py-1 rounded-lg border text-sm"
                    title="Preimenuj projekt"
                  >Preimenuj</button>
                  <Link
                    href={`/app/projects/${p.id}`}
                    className="px-3 py-1 rounded-lg border text-sm"
                  >Otvori</Link>
                </div>
              </div>
              <div className="text-sm text-gray-500 mt-1">Ciljani BRP</div>
              <div className="text-sm">{p.brp_limit.toLocaleString("hr-HR")} m²</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
