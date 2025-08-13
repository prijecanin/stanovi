// SERVER komponenta (App Router page)
import { headers } from "next/headers";
import { makeShareToken } from "@/lib/tokens";
import AdminProjectClient from "./AdminProjectClient";

export default function Page({ params }: { params: { id: string } }) {

  // helper za origin (radi lokalno i na Vercelu)
  function getOrigin() {
    const h = headers();
    const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
    const host  = (h.get("x-forwarded-host")  || h.get("host") || "").split(",")[0].trim();
    return `${proto}://${host}`;
  }

  // server action: generiraj VIEW ili EDIT link
  const makeLink = (scope: "view"|"edit") => {
    return async (_: any, formData: FormData) => {
      "use server";
      try {
        const projectId = String(formData.get("projectId") || "").trim();
        if (!projectId) return { error: "projectId obavezan." };
        if (!process.env.LINK_SECRET) return { error: "LINK_SECRET nije postavljen." };

        const token = await makeShareToken({ projectId, scope }, 7*24*3600);
        const link = `${getOrigin()}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;
        return { link };
      } catch (e:any) {
        return { error: e?.message || "Greška pri generiranju linka." };
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
