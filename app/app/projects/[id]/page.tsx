// app/app/projects/[id]/page.tsx
import { headers } from "next/headers";
import { makeShareToken } from "@/lib/tokens";
import AdminProjectClient from "./AdminProjectClient";

export default function Page({ params }: { params: { id: string } }) {
  // Factory koja vraća server action s točno određenim scope-om
  const makeLink = (scope: "view" | "edit") => {
    return async (_: any, formData: FormData) => {
      "use server";
      try {
        // 1) projectId iz forme ili fallback na params.id
        const formPid = String(formData.get("projectId") || "").trim();
        const projectId = formPid || params.id;
        if (!projectId) return { error: "projectId nedostaje." };

        // 2) provjera tajne
        if (!process.env.LINK_SECRET) {
          return { error: "LINK_SECRET nije postavljen u Environment Variables." };
        }

        // 3) robustan origin (radi lokalno i na Vercelu / proxyjima)
        const h = headers();
        const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
        const host  = (h.get("x-forwarded-host")  || h.get("host") || "").split(",")[0].trim();
        if (!host) return { error: "Ne mogu odrediti host (nema Host headera)." };
        const origin = `${proto}://${host}`;

        // 4) token + link (TTL 7 dana)
        const token = await makeShareToken({ projectId, scope }, 7 * 24 * 3600);
        const link = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;

        return { link };
      } catch (e: any) {
        return { error: e?.message || "Neočekivana greška pri generiranju linka." };
      }
    };
  };

  return (
    <AdminProjectClient
      paramsId={params.id}
      makeViewLink={makeLink("view")}
      makeEditLink={makeLink("edit")}
    />
  );
}
