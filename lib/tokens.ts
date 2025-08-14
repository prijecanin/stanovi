// lib/tokens.ts
import jwt, { JwtPayload } from "jsonwebtoken";

export type ShareScope = "view" | "edit";

export interface SharePayload {
  projectId: string;
  scope: ShareScope;
}

function getSecret(): string {
  const s = process.env.SHARE_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!s) {
    // Namjerno bacamo grešku tek kad se funkcije pozovu (ne na importu modula).
    throw new Error("Missing SHARE_TOKEN_SECRET (or JWT_SECRET) env var.");
  }
  return s;
}

/**
 * Generira JWT s payloadom { projectId, scope } i rokom trajanja u sekundama.
 */
export function generateShareToken(
  data: SharePayload,
  ttlSeconds: number
): string {
  return jwt.sign(
    { projectId: data.projectId, scope: data.scope },
    getSecret(),
    { expiresIn: ttlSeconds }
  );
}

/**
 * Validira i vraća payload iz tokena.
 * Baca grešku ako je token nevažeći/istekao ili payload nije očekivan.
 */
export function verifyShareToken(
  token: string
): SharePayload & { exp: number; iat?: number } {
  const decoded = jwt.verify(token, getSecret()) as JwtPayload;

  const projectId = decoded.projectId as string | undefined;
  const scope = decoded.scope as ShareScope | undefined;

  if (!projectId || (scope !== "view" && scope !== "edit")) {
    throw new Error("Invalid token payload.");
  }

  return {
    projectId,
    scope,
    exp: decoded.exp!,
    iat: decoded.iat,
  };
}
