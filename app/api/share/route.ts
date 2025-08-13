// app/api/share/route.ts
import { NextResponse } from "next/server";
import { makeShareToken } from "@/lib/tokens";

/**
 * POST /api/share
 * Body (JSON): { projectId: string, scope?: "view"|"edit", ttlSec?: number }
 * Response: { token: string, link: string } | { error: string }
 */
export async function POST(req: Request) {
  try {
    const { projectId, scope = "view", ttlSec } = await req.json();

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }
    if (scope !== "view" && scope !== "edit") {
      return NextResponse.json({ error: "scope must be 'view' or 'edit'" }, { status: 400 });
    }
    if (!process.env.LINK_SECRET) {
      return NextResponse.json({ error: "LINK_SECRET is not set" }, { status: 500 });
    }

    // Calculate origin that works both locally and on Vercel/Proxies
    const u = new URL(req.url);
    // Prefer forwarded headers if present
    const proto = (req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")).split(",")[0].trim();
    const host =
      (req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host).split(",")[0].trim();
    const origin = `${proto}://${host}`;

    const token = await makeShareToken({ projectId, scope }, Number.isFinite(ttlSec) ? Number(ttlSec) : 7 * 24 * 3600);
    const link = `${origin}/s/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;

    return NextResponse.json({ token, link });
  } catch (e: any) {
    // Bad JSON or unexpected error
    const message = e?.message || "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
