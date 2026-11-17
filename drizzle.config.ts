import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.(".env.local");
  } catch {
    // Ignore if file doesn't exist
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://admin:adminadmin@127.0.0.1:5432/mqc_db",
  },
});
