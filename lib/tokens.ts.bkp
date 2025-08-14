// lib/tokens.ts
import { SignJWT, jwtVerify } from "jose";

// helper: dohvat tajne kada treba (ne na importu)
function getSecretBytes() {
  const s = process.env.LINK_SECRET;
  if (!s) {
    throw new Error("LINK_SECRET nije postavljen.");
  }
  return new TextEncoder().encode(s);
}

// siguran rand UUID i u Node i u Edge okruženju
function makeJti(): string {
  // globalThis.crypto postoji i u Edge runtimeu
  // fallback ako ga nema
  const r = (globalThis as any).crypto?.randomUUID?.();
  return r ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type SharePayload = {
  projectId: string;
  scope: "view" | "edit";
};

export async function makeShareToken(payload: SharePayload, ttlSec = 7 * 24 * 3600) {
  const jti = makeJti();
  return await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .setJti(jti)
    .sign(getSecretBytes()); // <- tajna se čita tek sad
}

export async function verifyShareToken(token: string) {
  const { payload } = await jwtVerify(token, getSecretBytes()); // <- i ovdje
  return payload as SharePayload & { exp: number; jti?: string };
}
