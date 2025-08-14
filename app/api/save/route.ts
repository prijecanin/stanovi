// app/api/save/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyShareToken } from "../../../lib/tokens";

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
    } catch {
      return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
    }
    if (payload.scope !== "edit") {
      return NextResponse.json({ error: "Insufficient scope (edit required)." }, { status: 403 });
    }

    // 3) Parsiranje body-ja (JSON ili FormData)
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      const fd = await req.formData().catch(() => null);
      if (fd) {
        body = Object.fromEntries(fd.entries());
        if (typeof body.payload === "string") {
          try { body.payload = JSON.parse(body.payload); } catch {}
        }
      }
    }
    if (!body) {
      return NextResponse.json({ error: "Empty body." }, { status: 400 });
    }

    // očekujemo: name, brp_limit/brpLimit, (opcionalno tolerance), (opcionalno ratio), (opcionalno items)
    const name = (body.name ?? body.configName ?? "Konfiguracija").toString().trim() || "Konfiguracija";
    const brp_limit = Number(body.brp_limit ?? body.brpLimit ?? body.brp);
    const tolerance = Number(body.tolerance ?? 50);

    // default ratio ako nije poslan (rješava NOT NULL)
    const rawRatio = Number(body.ratio);
    const ratio = Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 0.65;

    if (!Number.isFinite(brp_limit) || brp_limit <= 0) {
      return NextResponse.json({ error: "Invalid brp_limit." }, { status: 400 });
    }

    // 4) Supabase (service role)
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE!;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json({ error: "Missing Supabase env vars." }, { status: 500 });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 5) Upis u configurations (+ optional meta)
    const insertConf: any = {
      project_id: payload.projectId,
      name,
      brp_limit,
      ratio,
      tolerance,
    };
    if (body.source) insertConf.source = body.source;
    if (body.clientKey) insertConf.client_key = body.clientKey;
    if (body.clientName) insertConf.client_name = body.clientName;

    const { data: conf, error: insErr } = await admin
      .from("configurations")
      .insert(insertConf)
      .select("id")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    const configurationId = conf!.id as string;

    // 6) Upis stavki u configuration_items (NE u configuration_unit_types)
    if (Array.isArray(body.items) && body.items.length > 0) {
      const rows = body.items.map((it: any, idx: number) => ({
        configuration_id: configurationId,
        project_unit_type_id: it.project_unit_type_id ?? it.unit_type_id ?? it.id ?? null,
        units: Number(it.units) || 0,
        neto_per_unit: it.neto_per_unit != null ? Number(it.neto_per_unit) : null,
        label: typeof it.label === "string" ? it.label : null,
        idx,
      }));
      const rowsFiltered = rows.filter(r => r.project_unit_type_id);
      if (rowsFiltered.length > 0) {
        const { error: itemsErr } = await admin
          .from("configuration_items")
          .insert(rowsFiltered);
        if (itemsErr) {
          return NextResponse.json({ error: itemsErr.message }, { status: 400 });
        }
      }
    }

    return NextResponse.json({ ok: true, configurationId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
