// app/api/check-token/route.ts
import { NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/tokens"; // isti helper koji koristiš u /api/save

type TokenPayload = {
  valid: boolean;
  projectId?: string;
  scope?: "view" | "edit";
  exp?: number;   // unix-epoch sekunde (opcionalno)
  iat?: number;   // unix-epoch sekunde (opcionalno)
  reason?: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("t");

    if (!token) {
      return NextResponse.json(
        { valid: false, reason: "Missing token." },
        { status: 400, headers: nocacheHeaders() }
      );
    }

    let payload: TokenPayload | null = null;

    try {
      payload = (await verifyShareToken(token)) as TokenPayload;
    } catch {
      payload = { valid: false, reason: "Token verify failed." };
    }

    if (!payload?.valid) {
      return NextResponse.json(
        {
          valid: false,
          scope: null,
          projectId: null,
          reason: payload?.reason || "Invalid token.",
        },
        { status: 401, headers: nocacheHeaders() }
      );
    }

    // Ako helper ne baci grešku na istek, dodatna provjera:
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return NextResponse.json(
        { valid: false, reason: "Expired token." },
        { status: 401, headers: nocacheHeaders() }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        scope: payload.scope || "view",
        projectId: payload.projectId || null,
        exp: payload.exp ?? null,
      },
      { status: 200, headers: nocacheHeaders() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { valid: false, reason: e?.message || "Unexpected error." },
      { status: 500, headers: nocacheHeaders() }
    );
  }
}

function nocacheHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
  };
}
