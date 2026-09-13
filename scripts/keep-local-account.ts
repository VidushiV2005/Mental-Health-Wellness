import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.DATABASE_URL)
  throw new Error("This maintenance command supports local SQLite only.");
const keep = process.argv[2];
if (!keep) throw new Error("Supply the verified account ID to keep.");
const path = resolve(process.env.SQLITE_PATH || "data/wellness.sqlite");
if (!existsSync(path)) throw new Error("Database does not exist.");
const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
if (!db.prepare("SELECT id FROM users WHERE id = ?").get(keep))
  throw new Error("Account to keep not found.");
const backup = join(
  dirname(path),
  `wellness-before-account-cleanup-${Date.now()}.sqlite`,
);
// VACUUM INTO creates a consistent SQLite snapshot, including live WAL content.
db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
db.exec("BEGIN IMMEDIATE");
try {
  const result = db.prepare("DELETE FROM users WHERE id <> ?").run(keep);
  db.exec("COMMIT");
  console.log(
    `Removed ${result.changes} other local accounts and their related records.`,
  );
  console.log(`Recovery backup: ${backup}`);
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
