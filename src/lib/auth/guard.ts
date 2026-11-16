import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import {
  getAuthSecret,
  getSessionCookieName,
  isSecureCookie,
} from "@/auth.config";
import { verifyInspectionToken } from "@/lib/auth/token";

export interface StaffSession {
  userId: string;
  email: string;
  name: string;
  role: string;
}

const ALLOWED_STAFF_ROLES = new Set(["staff", "admin", "editor"]);

export async function getStaffSession(
  request?: NextRequest | Request
): Promise<StaffSession | null> {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const role = session.user.role || "staff";
      if (!ALLOWED_STAFF_ROLES.has(role)) {
        return null;
      }
      return {
        userId: session.user.id,
        email: session.user.email ?? "",
        name: session.user.name ?? session.user.email ?? "Pengguna",
        role,
      };
    }
  } catch {
    // Fallback ke parsing JWT request langsung di luar Next request AsyncLocalStorage (mis. unit/API tests)
  }

  if (!request) {
    return null;
  }

  const secret = getAuthSecret();
  if (!secret) {
    return null;
  }

  try {
    const cookieName = getSessionCookieName();
    const token = await getToken({
      req: request,
      secret,
      secureCookie: isSecureCookie(),
      cookieName,
      salt: cookieName,
    });

    if (!token) {
      return null;
    }

    const userId =
      typeof token.id === "string" && token.id.length > 0
        ? token.id
        : typeof token.sub === "string" && token.sub.length > 0
          ? token.sub
          : null;

    if (!userId) {
      return null;
    }

    const role = typeof token.role === "string" ? token.role : "staff";
    if (!ALLOWED_STAFF_ROLES.has(role)) {
      return null;
    }

    return {
      userId,
      email: typeof token.email === "string" ? token.email : "",
      name:
        typeof token.name === "string" && token.name.length > 0
          ? token.name
          : typeof token.email === "string"
            ? token.email
            : "Pengguna",
      role,
    };
  } catch {
    return null;
  }
}

export async function requireStaffSession(
  request: NextRequest | Request
): Promise<
  | { session: StaffSession; errorResponse?: never }
  | { session?: never; errorResponse: NextResponse }
> {
  const session = await getStaffSession(request);
  if (!session) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Login staf diperlukan." },
        { status: 401 }
      ),
    };
  }
  return { session };
}

export async function requireStaffOrInspectionToken(
  request: NextRequest | Request,
  manuscriptId: string
): Promise<
  | { access: "staff"; session: StaffSession; errorResponse?: never }
  | { access: "inspection_token"; session: null; errorResponse?: never }
  | { access?: never; session?: never; errorResponse: NextResponse }
> {
  const url =
    request instanceof NextRequest ? request.nextUrl : new URL(request.url);
  const token = url.searchParams.get("token")?.trim();

  if (token) {
    const verified = await verifyInspectionToken(token, manuscriptId);
    if (verified) {
      return { access: "inspection_token", session: null };
    }
  }

  const session = await getStaffSession(request);
  if (session) {
    return { access: "staff", session };
  }

  return {
    errorResponse: NextResponse.json(
      {
        error: token
          ? "Unauthorized: Token inspeksi tidak valid atau kedaluwarsa."
          : "Unauthorized: Login staf atau token inspeksi diperlukan.",
      },
      { status: 401 }
    ),
  };
}
