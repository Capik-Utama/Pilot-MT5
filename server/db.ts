import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../drizzle/schema";
import { users, type InsertUser } from "../drizzle/schema";

export type Database = NodePgDatabase<typeof schema>;
let _db: Database | null = null;
let _pool: Pool | null = null;

/** Lazily create PostgreSQL so local build/test tooling does not require a DB. */
export async function getDb(): Promise<Database | null> {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  try {
    _pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 20_000,
      ssl:
        process.env.DATABASE_SSL === "disable"
          ? false
          : {
              rejectUnauthorized:
                process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
            },
    });
    _db = drizzle(_pool, { schema });
    return _db;
  } catch (error) {
    _pool = null;
    console.warn(
      "[Database] PostgreSQL client initialization failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return null;
  }
}

export async function upsertUserProfile(user: InsertUser): Promise<void> {
  if (!user.id || !user.email) {
    throw new Error("Supabase user UUID and email are required");
  }
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const now = new Date();
  await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email.trim().toLowerCase(),
      name: user.name ?? null,
      createdAt: user.createdAt ?? now,
      updatedAt: now,
      lastSignedIn: user.lastSignedIn ?? now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: user.email.trim().toLowerCase(),
        name: user.name ?? null,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now,
      },
    });
}

export async function getUserById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function closeDb(): Promise<void> {
  const pool = _pool;
  _pool = null;
  _db = null;
  if (pool) await pool.end();
}
