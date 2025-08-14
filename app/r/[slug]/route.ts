// app/r/[slug]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await db
    .from("short_links")
    .select("target_url")
    .eq("slug", ctx.params.slug)
    .maybeSingle();

  if (error || !data?.target_url) {
    // ako ne postoji – vrati na početnu (ili 404 ako želiš)
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  return NextResponse.redirect(data.target_url, 302);
}
