// middleware.ts
import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin Area"' },
  });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Zaključaj root ("/"), /admin i /api/admin
  const needsAuth =
    pathname === "/" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin");

  if (needsAuth) {
    const auth = req.headers.get("authorization") || "";
    const [scheme, encoded] = auth.split(" ");
    if (scheme !== "Basic" || !encoded) return unauthorized();

    const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
    if (u !== process.env.ADMIN_USER || p !== process.env.ADMIN_PASS) {
      return unauthorized();
    }
  }

  return NextResponse.next();
}

// Dodaj "/" u matcher da pokrije root rutu
export const config = {
  matcher: ["/", "/admin/:path*", "/api/admin/:path*"],
};
