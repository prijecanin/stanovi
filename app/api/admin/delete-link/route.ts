// app/api/admin/delete-link/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function checkBasicAuth() {
  const authHeader = headers().get("authorization");
  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASS || "pass123";

  if (!authHeader || !authHeader.startsWith("Basic ")) return false;

  const base64 = authHeader.split(" ")[1];
  const [user, pass] = Buffer.from(base64, "base64").toString().split(":");

  return user === username && pass === password;
}

export async function DELETE(req: Request) {
  try {
    // auth
    if (!checkBasicAuth()) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
      });
    }

    // id iz query stringa
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Nedostaje id." }, { status: 400 });
    }

    // supabase admin klijent
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE!;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase env varijable nedostaju." }, { status: 500 });
    }
    const admin = createClient(url, key, { auth: { persistSession: false } });

    // briši samo iz short_links
    const { error } = await admin.from("short_links").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
