import bcrypt from "bcryptjs";
import { db, client } from "./index";
import { users } from "./schema";
import { eq } from "drizzle-orm";

export async function seed() {
  const email = "user_dev@test.com";
  const password = "adminadmin";
  const fullName = "Developer";
  const role = "staff";

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`User ${email} already exists.`);
    await db
      .update(users)
      .set({
        passwordHash,
        fullName,
        role,
      })
      .where(eq(users.email, email));
    console.log(`Updated user ${email}.`);
  } else {
    await db.insert(users).values({
      email,
      passwordHash,
      fullName,
      role,
    });
    console.log(`User ${email} seeded successfully.`);
  }

  await client.end();
}

seed().catch((err) => {
  console.error("Failed to seed database:", err);
  process.exit(1);
});
