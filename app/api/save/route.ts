// app/api/save/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyShareToken } from "@/lib/tokens"; // tvoj helper

type SaveBody = {
  projectId: string;
  name: string;
  brpLimit: number;
  clientKey?: string | null;
  clientName?: string | null;
  items: Array<{
    project_unit_type_id: string;   // BASE ID iz project_unit_types
    label?: string | null;          // npr. "A", "B" (može biti null)
    share: number;
    units: number;
    neto_per_unit: number;
    brp_per_unit: number;
  }>;
};

// Ako želiš, možeš tipizirati očekivani payload iz verifyShareToken:
type SharePayload = {
  projectId?: string;
  scope?: "view" | "edit";
  exp?: number; // unix seconds
  iat?: number;
  // jti?: string; // ovisno što vraćaš
};

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t");
    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 401 });
    }

    // 1) Verifikacija tokena — ako je nevaljan/istekao, helper će baciti grešku
    let payload: SharePayload;
    try {
      payload = (await verifyShareToken(token)) as SharePayload;
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Invalid token." },
        { status: 401 }
      );
    }

    // Hard provjere: mora postojati projectId i scope === 'edit'
    if (!payload?.projectId || payload?.scope !== "edit") {
      return NextResponse.json(
        { error: "Invalid or insufficient token." },
        { status: 401 }
      );
    }

    // (Dodatno) Ako helper ne validira exp, provjeri ovdje:
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return NextResponse.json(
        { error: "Expired token." },
        { status: 401 }
      );
    }

    // 2) Body
    const body = (await req.json()) as SaveBody;
    if (!body?.projectId || body.projectId !== payload.projectId) {
      return NextResponse.json({ error: "Project mismatch." }, { status: 400 });
    }
    if (!body?.name || !Array.isArray(body.items)) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    // 3) Supabase admin klijent
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return NextResponse.json(
        { error: "Supabase env vars not set." },
        { status: 500 }
      );
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // 4) Insert configuration
    const { data: conf, error: insConfErr } = await admin
      .from("configurations")
      .insert({
        project_id: body.projectId,
        name: body.name,
        brp_limit: Math.round(Number(body.brpLimit) || 0),
        ratio: null,
        tolerance: null,
        source: "client",
        client_key: body.clientKey ?? null,
        client_name: (body.clientName ?? "").trim() || null,
      })
      .select("id")
      .single();

    if (insConfErr) {
      return NextResponse.json({ error: insConfErr.message }, { status: 400 });
    }
    const configurationId = conf!.id as string;

    // 5) Insert configuration_items (dozvoljene višestruke stavke po istom tipu; razlikuje ih label)
    if (body.items.length) {
      const rows = body.items.map((it) => ({
        configuration_id: configurationId,
        project_unit_type_id: it.project_unit_type_id,
        label: it.label ?? null,
        share: Math.max(0, Number(it.share) || 0),
        units: Math.max(0, Math.round(Number(it.units) || 0)),
        neto_per_unit: Math.max(0, Math.round(Number(it.neto_per_unit) || 0)),
        brp_per_unit: Math.max(1, Math.round(Number(it.brp_per_unit) || 1)),
      }));

      const { error: insItemsErr } = await admin
        .from("configuration_items")
        .insert(rows);
      if (insItemsErr) {
        return NextResponse.json({ error: insItemsErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, configurationId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error." },
      { status: 500 }
    );
  }
}
