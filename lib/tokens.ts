// lib/tokens.ts
import { SignJWT, jwtVerify } from "jose";

// U Node okruženju:
import { randomUUID } from "crypto";
// Ako build ide u edge/bez crypto, fallback:
// const randomUUID = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

const secret = new TextEncoder().encode(process.env.LINK_SECRET!);

export type SharePayload = {
  projectId: string;
  scope: "view" | "edit";
};

export async function makeShareToken(payload: SharePayload, ttlSec = 7 * 24 * 3600) {
  const jti = randomUUID(); // jedinstveni ID tokena (linka)
  return await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .setJti(jti)
    .sign(secret);
}

export async function verifyShareToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  // payload sada sadrži i jti
  return payload as SharePayload & { exp: number; jti?: string };
}
