// app/api/save/route.ts
import { NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/tokens";
import { supabaseServer } from "@/lib/supabase-server";

type ItemIn = {
  project_unit_type_id: string;
  share: number;
  units: number;
  neto_per_unit: number;
  brp_per_unit: number;
};

export async function POST(req: Request) {
  // token iz queryja (?t=...) ili Authorization: Bearer <token>
  const url = new URL(req.url);
  const qpToken = url.searchParams.get("t");
  const hdr = req.headers.get("authorization");
  const bearer = hdr?.startsWith("Bearer ") ? hdr.slice(7) : null;
  const token = qpToken || bearer;

  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId, name, brpLimit, items, clientKey, clientName } = body || {};
  if (!projectId || !name || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // provjera tokena
  try {
    const { projectId: tokenProject, scope } = await verifyShareToken(token);
    if (scope !== "edit") return NextResponse.json({ error: "Read-only" }, { status: 403 });
    if (tokenProject !== projectId) return NextResponse.json({ error: "Project mismatch" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Invalid/expired token" }, { status: 401 });
  }

  // upis u DB
  try {
    // 1) konfiguracija
    const { data: conf, error: e1 } = await supabaseServer
      .from("configurations")
      .insert({
        project_id: projectId,
        name,
        brp_limit: brpLimit,
        ratio: 0.65,
        tolerance: 50,
        source: "client",
        client_key: clientKey || null,
        client_name: clientName || null,
      })
      .select("id, name, created_at")
      .single();
    if (e1) throw e1;

    // 2) stavke
    const rows = (items as ItemIn[]).map((i) => ({
      configuration_id: conf.id,
      project_unit_type_id: i.project_unit_type_id,
      share: Math.round((i.share || 0) * 100) / 100,
      units: Math.max(0, Math.round(i.units || 0)),
      neto_per_unit: Math.round(i.neto_per_unit || 0),
      brp_per_unit: Math.round(i.brp_per_unit || 0),
    }));
    const { error: e2 } = await supabaseServer.from("configuration_items").insert(rows);
    if (e2) throw e2;

    return NextResponse.json({ ok: true, id: conf.id, name: conf.name, created_at: conf.created_at });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "DB error" }, { status: 500 });
  }
}
