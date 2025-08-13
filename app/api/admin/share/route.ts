import { makeShareToken } from "@/lib/tokens";

export async function POST(req: Request) {
  const { projectId, scope = "view", ttlSec } = await req.json();

  if (!projectId) {
    return new Response(JSON.stringify({ error: "projectId required" }), { status: 400 });
  }
  if (scope !== "view" && scope !== "edit") {
    return new Response(JSON.stringify({ error: "scope must be 'view' or 'edit'" }), { status: 400 });
  }

  const token = await makeShareToken({ projectId, scope }, ttlSec);
  const { origin } = new URL(req.url);
  // Link ide na tvoju klijentsku rutu /s/[id]
  const link = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;

  return new Response(JSON.stringify({ token, link }), {
    headers: { "content-type": "application/json" },
  });
}
