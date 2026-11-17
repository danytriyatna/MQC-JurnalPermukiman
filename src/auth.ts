import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createBaseAuthConfig } from "@/auth.config";
import { loginSchema } from "@/lib/validations/auth";

export async function authorizeStaffCredentials(rawCredentials: unknown) {
  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    return null;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      fullName: users.fullName,
      role: users.role,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`)
    .limit(1);

  if (!user || !user.passwordHash) {
    return null;
  }

  const passwordValid = await bcrypt.compare(
    parsed.data.password,
    user.passwordHash
  );
  if (!passwordValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.fullName || user.email,
    role: user.role || "staff",
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const base = createBaseAuthConfig();
  return {
    ...base,
    providers: [
      Credentials({
        name: "Akun Staf",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Kata Sandi", type: "password" },
        },
        authorize: authorizeStaffCredentials,
      }),
    ],
  };
});
