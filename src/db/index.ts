import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.(".env.local");
  } catch {
    // Ignore if file doesn't exist
  }
}

const connectionString =
  process.env.DATABASE_URL || "postgres://admin:adminadmin@127.0.0.1:5432/mqc_db";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

export const client =
  globalForDb.conn ??
  postgres(connectionString, {
    max: Number(process.env.DB_POOL_MAX || "20") || 20,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = client;
}

export const db = drizzle(client, { schema });
export * from "./schema";
