// app/admin/share/page.tsx  (SERVER)
import { headers } from "next/headers";
import { makeShareToken } from "@/lib/tokens";
import AdminShareClient from "./AdminShareClient";

async function generateLinkAction(_: any, formData: FormData) {
  "use server";

  try {
    const projectId = String(formData.get("projectId") || "").trim();
    const scope = String(formData.get("scope") || "view") === "edit" ? "edit" : "view";
    const ttlSecRaw = Number(formData.get("ttlSec") || 7 * 24 * 3600);
    const ttlSec = Number.isFinite(ttlSecRaw) && ttlSecRaw > 0 ? ttlSecRaw : 7 * 24 * 3600;

    if (!projectId) return { error: "projectId je obavezan." };
    if (!process.env.LINK_SECRET) {
      return { error: "LINK_SECRET nije postavljen u Environment Variables." };
    }

    // odredi origin (radi i lokalno i na Vercelu)
    const h = headers();
    const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
    if (!host) return { error: "Ne mogu odrediti host (Host header nedostaje)." };
    const origin = `${proto}://${host}`;

    const token = await makeShareToken({ projectId, scope: scope as "view" | "edit" }, ttlSec);
    const link = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;

    return { token, link };
  } catch (e: any) {
    console.error("generateLinkAction error:", e);
    return { error: e?.message || "Neočekivana greška na serveru." };
  }
}

export default function Page() {
  return <AdminShareClient action={generateLinkAction} />;
}
