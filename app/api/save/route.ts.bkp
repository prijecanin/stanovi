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
  // 1) Token iz queryja (?t=...) ili iz Authorization: Bearer <token>
  const url = new URL(req.url);
  const qpToken = url.searchParams.get("t");
  const hdr = req.headers.get("authorization");
  const bearer = hdr?.startsWith("Bearer ") ? hdr.slice(7) : null;
  const token = qpToken || bearer;

  if (!token) {
    return NextResponse.json({ error: "No token" }, { status: 401 });
  }

  // 2) Parsiraj body
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

  // 3) Verificiraj token i osnovne provjere
  let tokenProject: string;
  let scope: string;
  let jti: string | undefined;

  try {
    const verified = await verifyShareToken(token);
    tokenProject = String(verified.projectId);
    scope = String(verified.scope);
    // jose vraća jti u payloadu (nakon izmjene makeShareToken); držimo ga ako postoji
    jti = (verified as any).jti as string | undefined;
  } catch {
    return NextResponse.json({ error: "Invalid/expired token" }, { status: 401 });
  }

  if (scope !== "edit") {
    return NextResponse.json({ error: "Read-only" }, { status: 403 });
  }
  if (tokenProject !== projectId) {
    return NextResponse.json({ error: "Project mismatch" }, { status: 403 });
  }

  // 4) BINDANJE EDIT linka na prvi viđeni client_key (sprječava prosljeđivanje)
  // - Prvi put kad se iskoristi link → upišemo { jti, project_id, client_key }.
  // - Nakon toga dopuštamo upis samo ako se client_key poklapa.
  // Napomena: zahtijeva tablicu link_bindings (SQL niže).
  if (jti) {
    // dohvat postojećeg binda
    const { data: bindRow, error: bindErr } = await supabaseServer
      .from("link_bindings")
      .select("client_key")
      .eq("jti", jti)
      .maybeSingle();
    if (bindErr) {
      return NextResponse.json({ error: `Binding check failed: ${bindErr.message}` }, { status: 500 });
    }

    if (!bindRow) {
      // prvi put — vežemo link na ovaj browser/client
      if (!clientKey) {
        return NextResponse.json({ error: "Missing client key for first use" }, { status: 403 });
      }
      const { error: insErr } = await supabaseServer
        .from("link_bindings")
        .insert({ jti, project_id: projectId, client_key: String(clientKey) });
      if (insErr) {
        return NextResponse.json({ error: `Binding insert failed: ${insErr.message}` }, { status: 500 });
      }
    } else {
      // već vezan — provjeri podudaranje
      if (!clientKey || bindRow.client_key !== String(clientKey)) {
        return NextResponse.json(
          { error: "This edit link is bound to another browser.", code: "BOUND_TO_OTHER_CLIENT" },
          { status: 403 }
        );
      }
    }
  }
  // Ako nema jti u tokenu, binding se preskače (back‑compat).

  // 5) Upis u DB (configurations + configuration_items)
  try {
    // configurations
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

    // items
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
