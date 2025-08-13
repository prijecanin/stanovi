// app/admin/share/page.tsx  (SERVER component)
import { headers } from "next/headers";
import { makeShareToken } from "@/lib/tokens";
import AdminShareClient from "./AdminShareClient";

// SERVER ACTION – definira se u server komponenti
async function generateLinkAction(_: any, formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") || "").trim();
  const scope = String(formData.get("scope") || "view") === "edit" ? "edit" : "view";
  const ttlSec = Number(formData.get("ttlSec") || 7 * 24 * 3600);

  if (!projectId) return { error: "projectId je obavezan." };

  // izračun origin-a koji radi i lokalno i na Vercelu
  const h = headers();
  const proto = (h.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
  if (!host) return { error: "Ne mogu odrediti host." };
  const origin = `${proto}://${host}`;

  const token = await makeShareToken({ projectId, scope: scope as "view" | "edit" }, ttlSec);
  const link = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;

  return { token, link };
}

export default function Page() {
  // proslijedimo server action u client komponentu
  return <AdminShareClient action={generateLinkAction} />;
}
