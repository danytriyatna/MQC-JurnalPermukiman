import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  getAuthSecret,
  getSessionCookieName,
  isSecureCookie,
} from "@/auth.config";
import { verifyInspectionToken } from "@/lib/auth/token";

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const secret = getAuthSecret();
  const cookieName = getSessionCookieName();
  const token = secret
    ? await getToken({
        req: request,
        secret,
        secureCookie: isSecureCookie(),
        cookieName,
        salt: cookieName,
      }).catch(() => null)
    : null;

  const isAuthenticated = Boolean(token && (token.id || token.sub));

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/manuscripts")) {
    // Token inspeksi (?token=) HANYA sah untuk halaman detail naskah /manuscripts/[id], bukan /manuscripts/upload
    const detailMatch = pathname.match(/^\/manuscripts\/([^/]+)$/);
    if (detailMatch && detailMatch[1] !== "upload") {
      const inspectionToken = searchParams.get("token")?.trim();
      if (inspectionToken) {
        const verified = await verifyInspectionToken(
          inspectionToken,
          detailMatch[1]
        );
        if (verified) {
          return NextResponse.next();
        }
      }
    }

    if (!isAuthenticated) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === "/login" && isAuthenticated) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/manuscripts/:path*", "/login"],
};
