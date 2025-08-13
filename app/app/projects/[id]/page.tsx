// app/app/projects/[id]/page.tsx
import { headers } from "next/headers";
import AdminProjectClient from "./AdminProjectClient";
import { createClient } from "@supabase/supabase-js";
import { makeShareToken } from "@/lib/tokens";

function getOrigin() {
  const h = headers();
  const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host  = (h.get("x-forwarded-host")  || h.get("host") || "").split(",")[0].trim();
  if (!host) throw new Error("Ne mogu odrediti host.");
  return `${proto}://${host}`;
}

/* ----------------- LINKOVI (isto kao ranije, s TTL satima) ----------------- */
const makeLinkFactory = (paramsId: string, scope: "view" | "edit") => {
  return async (_: any, formData: FormData) => {
    "use server";
    try {
      const formPid = String(formData.get("projectId") || "").trim();
      const projectId = formPid || paramsId;
      if (!projectId) return { error: "projectId nedostaje." };
      if (!process.env.LINK_SECRET) return { error: "LINK_SECRET nije postavljen." };
      const origin = getOrigin();
      const hours = Math.max(1, parseInt(String(formData.get("hours") || "168"), 10) || 168);
      const token = await makeShareToken({ projectId, scope }, hours * 3600);
      const link  = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;
      return { link };
    } catch (e: any) {
      return { error: e?.message || "Greška pri generiranju linka." };
    }
  };
};

const makeShortFactory = (paramsId: string, scope: "view" | "edit") => {
  return async (_: any, formData: FormData) => {
    "use server";
    try {
      const projectId = String(formData.get("projectId") || "").trim();
      let slug = String(formData.get("slug") || "").trim().toLowerCase();
      if (!projectId) return { error: "projectId nedostaje." };
      if (!slug) return { error: "slug nedostaje." };
      if (!/^[a-z0-9-]{2,48}$/.test(slug)) return { error: "Neispravan slug (a-z, 0-9, -, 2–48 znakova)." };
      if (!process.env.LINK_SECRET) return { error: "LINK_SECRET nije postavljen." };

      const origin = getOrigin();
      const hours = Math.max(1, parseInt(String(formData.get("hours") || "168"), 10) || 168);
      const token = await makeShareToken({ projectId, scope }, hours * 3600);
      const longUrl = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;

      const SUPABASE_URL = process.env.SUPABASE_URL!;
      const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return { error: "Supabase env varijable nisu postavljene." };

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

      let finalSlug = slug;
      for (let i = 2; i <= 50; i++) {
        const { data: exists, error } = await admin.from("short_links").select("slug").eq("slug", finalSlug).maybeSingle();
        if (error) return { error: error.message };
        if (!exists) break;
        finalSlug = `${slug}-${i}`;
      }

      const { error: insErr } = await admin.from("short_links").insert({
        slug: finalSlug, target_url: longUrl, project_id: projectId, scope
      });
      if (insErr) return { error: insErr.message };

      const shortUrl = `${origin}/r/${encodeURIComponent(finalSlug)}`;
      return { shortUrl, slug: finalSlug, link: longUrl };
    } catch (e: any) {
      return { error: e?.message || "Greška pri kreiranju kratkog linka." };
    }
  };
};

/* ----------------- TIPOVI (NOVO) – server akcije ----------------- */
type UpsertTypeRow = {
  id?: string | null;
  project_id: string;
  code: string;
  description?: string | null;
  neto_min?: number | null;
  neto_max?: number | null;
  neto_default?: number | null;
  share?: number | null;
  locked?: boolean | null;
  idx?: number | null;
};

const upsertUnitTypes = async (_: any, formData: FormData) => {
  "use server";
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return { error: "Supabase env varijable nisu postavljene." };
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

    const payloadStr = String(formData.get("payload") || "[]");
    const rows = JSON.parse(payloadStr) as UpsertTypeRow[];

    // validacija osnovna
    for (const r of rows) {
      if (!r.project_id) return { error: "project_id je obavezan." };
      if (!r.code || !/^[a-zA-Z0-9\-_.]{1,24}$/.test(r.code)) return { error: `Neispravan code za tip: "${r.code}"` };
      if (r.neto_min != null && r.neto_max != null && Number(r.neto_min) > Number(r.neto_max)) {
        return { error: `neto_min > neto_max za "${r.code}"` };
      }
      if (r.neto_default != null) {
        if (r.neto_min != null && Number(r.neto_default) < Number(r.neto_min)) {
          return { error: `neto_default ispod neto_min za "${r.code}"` };
        }
        if (r.neto_max != null && Number(r.neto_default) > Number(r.neto_max)) {
          return { error: `neto_default iznad neto_max za "${r.code}"` };
        }
      }
    }

    // upsert po id-u; ako nema id, insert
    const toInsert = rows.filter(r => !r.id);
    const toUpdate = rows.filter(r => r.id);

    if (toInsert.length) {
      const { error } = await admin.from("project_unit_types").insert(toInsert.map(r => ({
        project_id: r.project_id,
        code: r.code,
        description: r.description ?? null,
        neto_min: r.neto_min ?? null,
        neto_max: r.neto_max ?? null,
        neto_default: r.neto_default ?? (r.neto_min ?? r.neto_max ?? null),
        share: r.share ?? 0,
        locked: r.locked ?? false,
        idx: r.idx ?? null
      })));
      if (error) return { error: error.message };
    }

    for (const r of toUpdate) {
      const { error } = await admin.from("project_unit_types").update({
        code: r.code,
        description: r.description ?? null,
        neto_min: r.neto_min ?? null,
        neto_max: r.neto_max ?? null,
        neto_default: r.neto_default ?? null,
        share: r.share ?? null,
        locked: r.locked ?? null,
        idx: r.idx ?? null
      }).eq("id", r.id);
      if (error) return { error: error.message };
    }

    return { ok: true };
  } catch (e: any) {
    return { error: e?.message || "Greška pri spremanju tipova." };
  }
}

const deleteUnitType = async (_: any, formData: FormData) => {
  "use server";
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return { error: "Supabase env varijable nisu postavljene." };
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

    const id = String(formData.get("id") || "");
    if (!id) return { error: "Nedostaje id tipa." };

    const { error } = await admin.from("project_unit_types").delete().eq("id", id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { error: e?.message || "Greška pri brisanju tipa." };
  }
}

export default function Page({ params }: { params: { id: string } }) {
  return (
    <AdminProjectClient
      paramsId={params.id}
      makeViewLink={makeLinkFactory(params.id, "view")}
      makeEditLink={makeLinkFactory(params.id, "edit")}
      makeShortViewLink={makeShortFactory(params.id, "view")}
      makeShortEditLink={makeShortFactory(params.id, "edit")}
      upsertUnitTypes={upsertUnitTypes}
      deleteUnitType={deleteUnitType}
    />
  );
}
