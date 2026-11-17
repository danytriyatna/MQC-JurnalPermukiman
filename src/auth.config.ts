import type { NextAuthConfig } from "next-auth";

export function getAuthSecret(): string | undefined {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET;
  return secret && secret.trim().length > 0 ? secret.trim() : undefined;
}

export function isSecureCookie(): boolean {
  if (process.env.AUTH_USE_SECURE_COOKIES === "true") return true;
  if (process.env.AUTH_USE_SECURE_COOKIES === "false") return false;
  return process.env.AUTH_URL?.startsWith("https://") ?? false;
}

export function getSessionCookieName(): string {
  return isSecureCookie()
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function createBaseAuthConfig(): NextAuthConfig {
  return {
    secret: getAuthSecret(),
    trustHost: true,
    useSecureCookies: isSecureCookie(),
    session: {
      strategy: "jwt",
      maxAge: 60 * 60 * 24 * 7,
    },
    pages: {
      signIn: "/login",
    },
    providers: [],
    callbacks: {
      jwt({ token, user }) {
        if (user) {
          token.id = user.id;
          token.role = user.role ?? "staff";
          token.name = user.name;
          token.email = user.email;
        }
        return token;
      },
      session({ session, token }) {
        if (session.user) {
          session.user.id = (token.id as string) ?? token.sub ?? "";
          session.user.role = (token.role as string) ?? "staff";
          if (typeof token.name === "string") {
            session.user.name = token.name;
          }
          if (typeof token.email === "string") {
            session.user.email = token.email;
          }
        }
        return session;
      },
    },
  };
}
