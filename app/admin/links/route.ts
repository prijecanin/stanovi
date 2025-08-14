// app/api/admin/links/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function checkBasicAuth() {
  const authHeader = headers().get("authorization");
  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASS || "pass123";

  if (!authHeader || !authHeader.startsWith("Basic ")) return false;

  const base64Credentials = authHeader.split(" ")[1];
  const [user, pass] = Buffer.from(base64Credentials, "base64")
    .toString()
    .split(":");

  return user === username && pass === password;
}

export async function GET() {
  try {
    if (!checkBasicAuth()) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return NextResponse.json({ error: "Supabase env varijable nedostaju." }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

    const { data, error } = await admin
      .from("short_links")
      .select("id, slug, target_url, project_id, scope, created_at")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
