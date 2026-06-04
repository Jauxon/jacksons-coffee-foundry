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
const requestedDbPath = process.env.DB_PATH ?? (isProd ? ":memory:" : "./data.db");

function openSqlite(p: string): Database.Database {
  if (p !== ":memory:") {
    try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
  }
  const d = new Database(p);
  // `next build` spins up ~11 worker processes that each import this module and
  // race to apply pending migrations against the same volume file. Without a
  // busy timeout, the losers throw SQLITE_BUSY and the build fails. With it,
  // concurrent writers wait for the lock and serialize cleanly.
  d.pragma("busy_timeout = 15000");
  return d;
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

// Bootstrap — runs migrations and (in prod) seeds an empty DB.
//
// CRITICAL: this must NOT run at module-import time. `next build` spawns ~11
// worker processes that each import this module to collect page data; if they
// all run drizzle's migrator at once they deadlock on the WAL file and throw
// SQLITE_BUSY (the migrator opens a read txn then upgrades to write, which
// SQLite refuses across concurrent connections — busy_timeout can't help a
// write-deadlock). So bootstrap is an explicit call, invoked once at server
// startup from instrumentation.ts (the Next.js runtime hook), never at import.
let _bootstrapped = false;
export function bootstrapDb(): void {
  if (_bootstrapped) return;
  _bootstrapped = true;

  const migrationsFolder = path.resolve(process.cwd(), "db/migrations");
  try {
    migrate(db, { migrationsFolder });
  } catch (e) {
    if (isProd) console.warn("[db] migrate warning:", (e as Error).message);
  }

  let shopCount: { c: number } | undefined;
  try {
    shopCount = sqlite.prepare("SELECT COUNT(*) AS c FROM shop").get() as any;
  } catch {
    shopCount = { c: 0 };
  }
  if (!shopCount || shopCount.c === 0) {
    // In dev we leave seeding to `npm run db:seed` so the developer stays in control.
    if (isProd) {
      try {
        seedDatabase(db, schema);
      } catch (e) {
        console.warn("[db] seed warning:", (e as Error).message);
      }
    }
  }
}
