// app/api/check-token/route.ts
import { verifyShareToken } from "@/lib/tokens";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qpToken = url.searchParams.get("t");
  const hdr = req.headers.get("authorization");
  const bearer = hdr?.startsWith("Bearer ") ? hdr.slice(7) : null;

  const token = qpToken || bearer;
  if (!token) {
    return new Response(JSON.stringify({ valid: false, reason: "No token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { projectId, scope, exp } = await verifyShareToken(token);
    return new Response(JSON.stringify({
      valid: true,
      projectId,
      scope,             // "view" ili "edit"
      exp,               // unix timestamp isteka
    }), { headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ valid: false, reason: "Invalid or expired" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
