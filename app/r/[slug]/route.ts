import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !key) return new NextResponse("Supabase nije konfiguriran.", { status: 500 });

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: row, error } = await db
    .from("short_links")
    .select("target_url, expires_at")
    .eq("slug", params.slug)
    .maybeSingle();

  if (error) return new NextResponse(error.message, { status: 500 });
  if (!row)  return new NextResponse("Nije pronađeno.", { status: 404 });
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return new NextResponse("Link istekao.", { status: 410 });
  }
  return NextResponse.redirect(row.target_url, { status: 307 });
}
