import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function checkBasicAuth() {
  const authHeader = headers().get("authorization");
  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASS || "pass123";
  if (!authHeader?.startsWith("Basic ")) return false;
  const [user, pass] = Buffer.from(authHeader.split(" ")[1], "base64").toString().split(":");
  return user === username && pass === password;
}

export async function GET() {
  if (!checkBasicAuth()) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' } });
  }
  const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE!;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin
    .from("short_links")
    .select("id, slug, target_url, project_id, scope, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}
