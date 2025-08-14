// app/api/admin/create-short-link/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { generateShareToken } from "../../../../lib/tokens"; // ako je path drugačiji, prilagodi

function checkBasicAuth() {
  const h = headers();
  const auth = h.get("authorization");
  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASS || "pass123";
  if (!auth?.startsWith("Basic ")) return false;
  const [u, p] = Buffer.from(auth.split(" ")[1], "base64").toString().split(":");
  return u === user && p === pass;
}

function getOrigin() {
  const h = headers();
  const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host  = (h.get("x-forwarded-host")  || h.get("host") || "").split(",")[0].trim();
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  try {
    if (!checkBasicAuth()) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
      });
    }

    const { projectId, scope, slug, ttlHours } = await req.json();

    if (!projectId || (scope !== "view" && scope !== "edit")) {
      return NextResponse.json({ error: "Neispravan payload." }, { status: 400 });
    }
    const cleanSlug = String(slug || "").trim().toLowerCase();
    if (!cleanSlug) {
      return NextResponse.json({ error: "Slug je obavezan." }, { status: 400 });
    }
    const ttl = Number(ttlHours);
    if (!Number.isFinite(ttl) || ttl <= 0) {
      return NextResponse.json({ error: "Neispravan TTL (sati)." }, { status: 400 });
    }

    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE!;
    const admin = createClient(url, key, { auth: { persistSession: false } });

    // provjeri je li slug slobodan
    const { data: existing, error: selErr } = await admin
      .from("short_links").select("id").eq("slug", cleanSlug).maybeSingle();
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
    if (existing) return NextResponse.json({ error: "Taj slug već postoji." }, { status: 409 });

    // generiraj token (sekunde = sati*3600)
    const token = generateShareToken({ projectId, scope }, ttl * 3600);

    // dugačak link do klijentske stranice
    const origin = getOrigin();
    const targetUrl = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;

    // upiši u short_links
    const insertRes = await admin
      .from("short_links")
      .insert({ slug: cleanSlug, target_url: targetUrl, project_id: projectId, scope })
      .select("slug")
      .single();
    if (insertRes.error) {
      return NextResponse.json({ error: insertRes.error.message }, { status: 400 });
    }

    const shortUrl = `${origin}/r/${encodeURIComponent(insertRes.data.slug)}`;
    return NextResponse.json({ ok: true, shortUrl, targetUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
