import { NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/tokens";

function nocacheHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
  };
}

// GET /api/check-token?t=...
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

    // verifyShareToken baca grešku ako je token neispravan/istekao
    const payload = await verifyShareToken(token);

    // Tvrda provjera: moraju postojati projectId i scope ('view' | 'edit')
    if (
      !payload?.projectId ||
      (payload.scope !== "view" && payload.scope !== "edit")
    ) {
      return NextResponse.json(
        { valid: false, reason: "Invalid payload." },
        { status: 401, headers: nocacheHeaders() }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        scope: payload.scope,       // NEMA defaulta na "view" — sve eksplicitno
        projectId: payload.projectId,
        exp: payload.exp ?? null,   // opcionalno, informativno
      },
      { status: 200, headers: nocacheHeaders() }
    );
  } catch (e: any) {
    // Greške iz verifyShareToken (npr. Expired token) završe ovdje
    return NextResponse.json(
      { valid: false, reason: e?.message || "Invalid token." },
      { status: 401, headers: nocacheHeaders() }
    );
  }
}
