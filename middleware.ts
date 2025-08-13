import { NextRequest, NextResponse } from "next/server";

const PUBLIC_FILES = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

function unauthorized() {
  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin Area"' },
  });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Preskoči Next interne i javne statičke fajlove
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    PUBLIC_FILES.has(pathname)
  ) {
    return NextResponse.next();
  }

  // Što zaključavamo
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

  // DEBUG: dodaj header da potvrdimo da middleware radi i na rootu
  const res = NextResponse.next();
  res.headers.set("x-mw", "hit");
  return res;
}

// Matchaj SVE rute; filtriramo unutar koda gore.
export const config = {
  matcher: "/:path*",
};
