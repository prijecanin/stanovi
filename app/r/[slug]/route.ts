// app/r/[slug]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE!; // server-side only

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const slug = ctx.params.slug;

  // prvo pokušaj target_url; ako nema kolone ili je prazno, pokušaj url
  let target: string | null = null;

  const one = await db
    .from("short_links")
    .select("target_url")
    .eq("slug", slug)
    .maybeSingle();

  if (!one.error && one.data?.target_url) {
    target = one.data.target_url as string;
  } else {
    const two = await db
      .from("short_links")
      .select("url")
      .eq("slug", slug)
      .maybeSingle();

    if (!two.error && (two.data as any)?.url) {
      target = (two.data as any).url as string;
    }
  }

  if (!target) {
    // nema zapisa ili nema polja -> pošalji na početnu (ili 404)
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  return NextResponse.redirect(target, 302);
}
