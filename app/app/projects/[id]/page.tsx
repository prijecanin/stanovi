// app/app/projects/[id]/page.tsx
import { headers } from "next/headers";
import { makeShareToken } from "@/lib/tokens";
import AdminProjectClient from "./AdminProjectClient";
import { createClient } from "@supabase/supabase-js";

function getOrigin() {
  const h = headers();
  const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host  = (h.get("x-forwarded-host")  || h.get("host") || "").split(",")[0].trim();
  if (!host) throw new Error("Ne mogu odrediti host.");
  return `${proto}://${host}`;
}

// server‑akcija: generiraj tokenizirani link (view/edit)
const makeLinkFactory = (paramsId: string, scope: "view" | "edit") => {
  return async (_: any, formData: FormData) => {
    "use server";
    try {
      const formPid = String(formData.get("projectId") || "").trim();
      const projectId = formPid || paramsId;
      if (!projectId) return { error: "projectId nedostaje." };
      if (!process.env.LINK_SECRET) return { error: "LINK_SECRET nije postavljen." };

      const origin = getOrigin();
      const token = await makeShareToken({ projectId, scope }, 7 * 24 * 3600);
      const link  = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;
      return { link };
    } catch (e: any) {
      return { error: e?.message || "Greška pri generiranju linka." };
    }
  };
};

// server‑akcija: generiraj KRATKI link (slug) → upiši u tablicu `short_links`
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
      const token = await makeShareToken({ projectId, scope }, 7 * 24 * 3600);
      const longUrl = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;

      const SUPABASE_URL = process.env.SUPABASE_URL!;
      const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return { error: "Supabase env varijable nisu postavljene." };

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

      // jedinstvenost sluga
      let finalSlug = slug;
      for (let i = 2; i <= 50; i++) {
        const { data: exists, error } = await admin.from("short_links").select("slug").eq("slug", finalSlug).maybeSingle();
        if (error) return { error: error.message };
        if (!exists) break;
        finalSlug = `${slug}-${i}`;
      }

      const { error: insErr } = await admin.from("short_links").insert({
        slug: finalSlug,
        target_url: longUrl,
        project_id: projectId,
        scope
      });
      if (insErr) return { error: insErr.message };

      const shortUrl = `${origin}/r/${encodeURIComponent(finalSlug)}`;
      return { shortUrl, slug: finalSlug, link: longUrl };
    } catch (e: any) {
      return { error: e?.message || "Greška pri kreiranju kratkog linka." };
    }
  };
};

export default function Page({ params }: { params: { id: string } }) {
  return (
    <AdminProjectClient
      paramsId={params.id}
      makeViewLink={makeLinkFactory(params.id, "view")}
      makeEditLink={makeLinkFactory(params.id, "edit")}
      makeShortViewLink={makeShortFactory(params.id, "view")}
      makeShortEditLink={makeShortFactory(params.id, "edit")}
    />
  );
}
