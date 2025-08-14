// app/api/save/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyShareToken } from "../../../lib/tokens";

type ItemRow = {
  configuration_id: string;
  project_unit_type_id: string | null;
  units: number;
  neto_per_unit: number | null;
  brp_per_unit: number;          // NOT NULL u tvojoj shemi
  label: string | null;
  share: number;                  // NOT NULL u tvojoj shemi
};

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t") || "";
    if (!token) {
      return NextResponse.json({ error: "Missing token (t)." }, { status: 401 });
    }

    // token + scope
    let payload;
    try {
      payload = verifyShareToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
    }
    if (payload.scope !== "edit") {
      return NextResponse.json({ error: "Insufficient scope (edit required)." }, { status: 403 });
    }

    // body (JSON ili FormData)
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

    const name = (body.name ?? body.configName ?? "Konfiguracija").toString().trim() || "Konfiguracija";
    const brp_limit = Number(body.brp_limit ?? body.brpLimit ?? body.brp);
    const tolerance = Number(body.tolerance ?? 50);
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

    // upis u configurations
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
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    const configurationId = conf!.id as string;

    // upis stavki u configuration_items (SADA uključuje i brp_per_unit)
    if (Array.isArray(body.items) && body.items.length > 0) {
      const rows: ItemRow[] = body.items.map((it: any): ItemRow => {
        const units = Number(it.units) || 0;
        const neto_per_unit =
          it.neto_per_unit != null ? Number(it.neto_per_unit) : null;

        // odredi brp_per_unit (prioritet: it.brp_per_unit → iz neto/ratio → iz share/brp_limit/units → fallback 1)
        let brp_per_unit: number;
        if (it.brp_per_unit != null && Number.isFinite(Number(it.brp_per_unit))) {
          brp_per_unit = Math.max(1, Math.round(Number(it.brp_per_unit)));
        } else if (neto_per_unit != null && Number.isFinite(neto_per_unit)) {
          brp_per_unit = Math.max(1, Math.round(neto_per_unit / ratio));
        } else if (units > 0 && it.share != null && Number.isFinite(Number(it.share))) {
          const shareVal = Number(it.share);
          brp_per_unit = Math.max(1, Math.round((shareVal / 100) * brp_limit / units));
        } else {
          brp_per_unit = 1; // sigurni fallback
        }

        // odredi share (prioritet: it.share → iz units/brp_per_unit)
        const shareCalc =
          it.share != null && Number.isFinite(Number(it.share))
            ? Number(it.share)
            : (units * brp_per_unit) / brp_limit * 100;

        const share = Math.max(0, Math.min(100, Math.round(shareCalc * 100) / 100));

        return {
          configuration_id: configurationId,
          project_unit_type_id: it.project_unit_type_id ?? it.unit_type_id ?? it.id ?? null,
          units,
          neto_per_unit,
          brp_per_unit,
          label: typeof it.label === "string" ? it.label : null,
          share,
        };
      });

      const rowsFiltered = rows.filter(
        (r): r is ItemRow & { project_unit_type_id: string } => !!r.project_unit_type_id
      );

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
