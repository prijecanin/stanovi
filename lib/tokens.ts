import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.LINK_SECRET!);

// payload vežemo uz projekt (route /s/[id])
export type SharePayload = {
  projectId: string;
  scope: "view" | "edit";
};

export async function makeShareToken(
  payload: SharePayload,
  ttlSec = 7 * 24 * 3600 // 7 dana
) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .sign(secret);
}

export async function verifyShareToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as SharePayload & { exp: number };
}
