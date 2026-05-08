import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema.ts";
import { seedDatabase } from "./seed.ts";

// Database path resolution:
//   1. DB_PATH (e.g. "/data/data.db" on Railway with a persistent volume) — wins at runtime.
//   2. In production with no DB_PATH → in-memory.
//   3. In dev → ./data.db (file in cwd).
// We attempt to open the resolved path and fall back to :memory: if it fails
// (e.g. during Next.js build the volume isn't mounted yet). This is more
// robust than relying on NEXT_PHASE which Turbopack workers don't always set.
const isProd = process.env.NODE_ENV === "production";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const requestedDbPath = process.env.DB_PATH ?? (isProd ? ":memory:" : "./data.db");

function openSqlite(p: string): Database.Database {
  if (p !== ":memory:") {
    try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
  }
  return new Database(p);
}

let _sqlite: Database.Database;
try {
  _sqlite = openSqlite(requestedDbPath);
} catch (e) {
  console.warn(`[db] failed to open '${requestedDbPath}' (${(e as Error).message}); falling back to :memory:`);
  _sqlite = openSqlite(":memory:");
}
export const sqlite = _sqlite;
const dbPath = sqlite.name; // resolved path (':memory:' or actual file path)
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
export { schema };

// Bootstrap on every cold start (skip during Next.js build phase):
//   1. Always run pending migrations — handles schema changes against an
//      existing persistent DB on Railway.
//   2. Only seed if the database is empty — preserves accumulated state on
//      Railway's persistent volume across deploys.
if (!isBuildPhase) {
  const migrationsFolder = path.resolve(process.cwd(), "db/migrations");
  try {
    migrate(db, { migrationsFolder });
  } catch (e) {
    // Best-effort: migrate may fail on partially-initialized DBs in some envs.
    if (isProd) console.warn("[db] migrate warning:", (e as Error).message);
  }
  let shopCount: { c: number } | undefined;
  try {
    shopCount = sqlite.prepare("SELECT COUNT(*) AS c FROM shop").get() as any;
  } catch {
    // shop table doesn't exist yet (migrate may have failed) — treat as empty.
    shopCount = { c: 0 };
  }
  if (!shopCount || shopCount.c === 0) {
    if (isProd) seedDatabase(db, schema);
    // In dev we leave seeding to `npm run db:seed` so the developer stays in control.
  }
}
