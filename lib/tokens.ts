// lib/tokens.ts
import jwt from "jsonwebtoken";

export type ShareScope = "view" | "edit";

export type SharePayload = {
  projectId: string;
  scope: ShareScope;
  iat?: number; // unix seconds
  exp?: number; // unix seconds
};

// Jedan, centralni secret za potpis/provjeru
const SECRET =
  process.env.SHARE_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  process.env.NEXTAUTH_SECRET;

if (!SECRET) {
  throw new Error("SHARE_TOKEN_SECRET (ili JWT/NEXTAUTH_SECRET) nije postavljen.");
}

/**
 * Kreira kratkotrajni token za dijeljenje linka (view/edit).
 * @param data { projectId, scope }
 * @param ttlSeconds npr. 3600 * 24 * 7 (7 dana)
 */
export function makeShareToken(
  data: { projectId: string; scope: ShareScope },
  ttlSeconds: number
): string {
  return jwt.sign(
    { projectId: data.projectId, scope: data.scope } as SharePayload,
    SECRET,
    { expiresIn: ttlSeconds }
  );
}

/**
 * Provjerava token — baca grešku ako je neispravan/istekao.
 * Vraća dekodirani payload.
 */
export async function verifyShareToken(token: string): Promise<SharePayload> {
  const decoded = jwt.verify(token, SECRET) as SharePayload;
  if (!decoded?.projectId || (decoded.scope !== "view" && decoded.scope !== "edit")) {
    throw new Error("Invalid token payload.");
  }
  return decoded;
}
