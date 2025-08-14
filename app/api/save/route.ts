import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// prilagodi putanju ako ti nije ovako:
import { verifyShareToken } from "../../../../lib/tokens";

export async function POST(req: Request) {
  try {
    // 1) Token iz query stringa (?t=...)
    const url = new URL(req.url);
    const token = url.searchParams.get("t") || "";
    if (!token) {
      return NextResponse.json({ error: "Missing token (t)." }, { status: 401 });
    }

    // 2) Validacija tokena i scope
    let payload;
    try {
      payload = verifyShareToken(token); // { projectId, scope, exp, ... }
    } catch (e: any) {
      return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
    }
    if (payload.scope !== "edit") {
      return NextResponse.json({ error: "Insufficient scope (edit required)." }, { status: 403 });
    }

    // 3) Parsiranje body-ja (podržavamo JSON i FormData)
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      const fd = await req.formData().catch(() => null);
      if (fd) {
        body = Object.fromEntries(fd.entries());
        // ako je payload stigao serijaliziran
        if (typeof body.payload === "string") {
          try { body.payload = JSON.parse(body.payload); } catch {}
        }
      }
    }
    if (!body) {
      return NextResponse.json({ error: "Empty body." }, { status: 400 });
    }

    // očekujemo barem: name, brp_limit, tolerance, (opcijski ratio), (opcijski items)
    const name = (body.name ?? body.configName ?? "Konfiguracija").toString().trim() || "Konfiguracija";
    const brp_limit = Number(body.brp_limit ?? body.brpLimit ?? body.brp);
    const tolerance = Number(body.tolerance ?? 50);

    // --- KLJUČNO: ratio default ako nije poslan ---
    const rawRatio = Number(body.ratio);
    const ratio = Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 0.65;

    if (!Number.isFinite(brp_limit) || brp_limit <= 0) {
      return NextResponse.json({ error: "Invalid brp_limit." }, { status: 400 });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE!;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json({ error: "Missing Supabase env vars." }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 4) Upis u configurations
    const { data: conf, error: insErr } = await admin
      .from("configurations")
      .insert({
        project_id: payload.projectId,
        name,
        brp_limit,
        ratio,        // <<-- više nije null
        tolerance
      })
      .select("id")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    const configurationId = conf!.id as string;

    // 5) (Opcijski) spremi stavke ako ih šalješ: body.items: Array<{unit_type_id, share, neto_default,...}>
    if (Array.isArray(body.items) && body.items.length > 0) {
      const rows = body.items.map((it: any, idx: number) => ({
        configuration_id: configurationId,
        unit_type_id: it.unit_type_id ?? it.id ?? null,
        share: Number(it.share) || 0,
        neto_default: it.neto_default != null ? Number(it.neto_default) : null,
        idx
      }));
      const { error: itemsErr } = await admin.from("configuration_unit_types").insert(rows);
      if (itemsErr) {
        return NextResponse.json({ error: itemsErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, configurationId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
