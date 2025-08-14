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

export async function DELETE(req: Request) {
  if (!checkBasicAuth()) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' } });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Nedostaje id." }, { status: 400 });

  const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE!;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // obriši bindinge (ako nemaš ON DELETE CASCADE)
  const { error: bindErr } = await admin.from("link_bindings").delete().eq("short_link_id", id);
  if (bindErr) return NextResponse.json({ error: bindErr.message }, { status: 400 });

  const { error: delErr } = await admin.from("short_links").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
