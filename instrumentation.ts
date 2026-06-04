// Next.js runtime hook. `register()` runs ONCE when a server instance boots —
// not during `next build` page-data collection, and not in the ~11 build
// worker processes. That's exactly where DB migrations belong: a single
// process applying them, instead of every build worker racing on the WAL file
// and deadlocking with SQLITE_BUSY.
export async function register() {
  // Only the Node.js server runtime touches better-sqlite3 (a native module).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrapDb } = await import("./db/client.ts");
  bootstrapDb();
}
