import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Pool } from "pg";
import type { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;
type Connection = {
  query: (sql: string, params?: unknown[]) => Promise<Row[]>;
  transaction: <T>(
    fn: (query: Connection["query"]) => Promise<T>,
  ) => Promise<T>;
  dialect: "sqlite" | "postgres";
};
const cache = globalThis as typeof globalThis & {
  wellnessDb?: Promise<Connection>;
};

async function initialize(): Promise<Connection> {
  let conn: Connection;
  if (process.env.DATABASE_URL) {
    const pg = await import("pg");
    const pool: Pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
    conn = {
      dialect: "postgres",
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(async (sql, params = []) => {
            let i = 0;
            return (
              await client.query(
                sql.replace(/\?/g, () => `$${++i}`),
                params,
              )
            ).rows;
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      query: async (sql, params = []) => {
        let i = 0;
        return (
          await pool.query(
            sql.replace(/\?/g, () => `$${++i}`),
            params,
          )
        ).rows;
      },
    };
    await conn.query("CREATE EXTENSION IF NOT EXISTS vector");
  } else {
    const { DatabaseSync: SQLite } = await import("node:sqlite");
    const path =
      process.env.SQLITE_PATH || join(process.cwd(), "data", "wellness.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    const sqlite: DatabaseSync = new SQLite(path);
    sqlite.exec(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
    );
    const raw: Connection["query"] = async (sql, params = []) => {
      const statement = sqlite.prepare(sql);
      const values = params as (string | number | null)[];
      if (/^\s*(SELECT|WITH)|RETURNING/i.test(sql))
        return statement.all(...values) as Row[];
      statement.run(...values);
      return [];
    };
    // Serialize ALL access, including reads, while an async transaction is open.
    let tail = Promise.resolve();
    const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
      const result = tail.then(fn);
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    };
    conn = {
      dialect: "sqlite",
      query: (sql, params) => exclusive(() => raw(sql, params)),
      transaction: (fn) =>
        exclusive(async () => {
          sqlite.exec("BEGIN IMMEDIATE");
          try {
            const value = await fn(raw);
            sqlite.exec("COMMIT");
            return value;
          } catch (error) {
            sqlite.exec("ROLLBACK");
            throw error;
          }
        }),
    };
  }
  const statements = [
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)",
    `CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, data TEXT NOT NULL, embedding ${conn.dialect === "postgres" ? "vector(384)" : "TEXT"})`,
    "CREATE INDEX IF NOT EXISTS entries_user_date ON entries(user_id, date)",
    "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, data TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS journal_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, timezone TEXT NOT NULL DEFAULT 'UTC', consent_version TEXT, consent_at TEXT, auto_daily INTEGER NOT NULL DEFAULT 0, weekly INTEGER NOT NULL DEFAULT 0, monthly INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS journal_daily (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, content_hash TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user_id, date))",
    "CREATE TABLE IF NOT EXISTS journal_periods (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, range_key TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user_id, range_key))",
    "CREATE TABLE IF NOT EXISTS journal_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL, active_key TEXT UNIQUE, schedule_key TEXT UNIQUE, revision INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL, lease_until TEXT, token TEXT, progress TEXT NOT NULL, error TEXT, result_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS journal_jobs_queue ON journal_jobs(status, available_at)",
    // A database-backed single worker lease bounds provider concurrency across processes.
    "CREATE TABLE IF NOT EXISTS journal_worker_lock (id INTEGER PRIMARY KEY, token TEXT, lease_until TEXT)",
    "INSERT INTO journal_worker_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING",
  ];
  for (const sql of statements) await conn.query(sql);
  await conn.query(
    "INSERT INTO schema_migrations (version,applied_at) VALUES (?,?) ON CONFLICT (version) DO NOTHING",
    ["2026-09-journal-v1", new Date().toISOString()],
  );
  return conn;
}

export async function database() {
  cache.wellnessDb ??= initialize().catch((error) => {
    cache.wellnessDb = undefined;
    throw error;
  });
  return cache.wellnessDb;
}
export async function query(sql: string, params: unknown[] = []) {
  return (await database()).query(sql, params);
}
