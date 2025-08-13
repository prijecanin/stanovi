// app/app/projects/[id]/page.tsx
import { headers } from "next/headers";
import { makeShareToken } from "@/lib/tokens";
import AdminProjectClient from "./AdminProjectClient";

export default function Page({ params }: { params: { id: string } }) {
  function getOrigin() {
    const h = headers();
    const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
    const host  = (h.get("x-forwarded-host")  || h.get("host") || "").split(",")[0].trim();
    return `${proto}://${host}`;
  }

  const makeLink = (scope: "view" | "edit") => {
    return async (_: any, formData: FormData) => {
      "use server";
      try {
        // prihvati iz forme ili padni na params.id
        const formPid = String(formData.get("projectId") || "").trim();
        const projectId = formPid || params.id;

        if (!projectId) return { error: "projectId nedostaje." };
        if (!process.env.LINK_SECRET) return { error: "LINK_SECRET nije postavljen." };

        // TTL po želji (7 dana)
        const token = await makeShareToken({ projectId, scope }, 7 * 24 * 3600);
        const link = `${getOrigin()}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;
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
