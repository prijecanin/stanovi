// app/api/admin/delete-link/route.ts
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

export async function DELETE(req: Request) {
  try {
    if (!checkBasicAuth()) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
      });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Nedostaje id." }, { status: 400 });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return NextResponse.json({ error: "Supabase env varijable nedostaju." }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

    // 1) obriši bindinge (ako nema CASCADE)
    const { error: bindErr } = await admin.from("link_bindings").delete().eq("short_link_id", id);
    if (bindErr) return NextResponse.json({ error: bindErr.message }, { status: 400 });

    // 2) obriši kratki link
    const { error: delErr } = await admin.from("short_links").delete().eq("id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
