import { encode } from "next-auth/jwt";
import { db, users } from "../../src/db";
import { getAuthSecret, getSessionCookieName } from "../../src/auth.config";

const FALLBACK_TEST_SECRET =
  "test_jwt_secret_at_least_32_characters_long_for_mqc_2026";

export async function createStaffSessionCookieHeader(): Promise<{
  cookieHeader: string;
  userId: string;
  email: string;
}> {
  if (!process.env.AUTH_SECRET && !process.env.JWT_SECRET) {
    process.env.JWT_SECRET = FALLBACK_TEST_SECRET;
  }

  const secret = getAuthSecret()!;
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
    })
    .from(users)
    .limit(1);

  if (!user) {
    throw new Error(
      "Database users kosong; pastikan seed pengguna staf sudah dijalankan.",
    );
  }

  const cookieName = getSessionCookieName();
  const token = await encode({
    secret,
    salt: cookieName,
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.fullName || user.email,
      role: user.role || "staff",
    },
  });

  return {
    cookieHeader: `${cookieName}=${token}`,
    userId: user.id,
    email: user.email,
  };
}
