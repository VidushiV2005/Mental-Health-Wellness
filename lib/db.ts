import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Pool } from "pg";
import type { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;
type Connection = {
  query: (sql: string, params?: unknown[]) => Promise<Row[]>;
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
    conn = {
      dialect: "sqlite",
      query: async (sql, params = []) => {
        const statement = sqlite.prepare(sql);
        const values = params as (string | number | null)[];
        if (/^\s*(SELECT|WITH)|RETURNING/i.test(sql))
          return statement.all(...values) as Row[];
        statement.run(...values);
        return [];
      },
    };
  }
  const statements = [
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)",
    `CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, data TEXT NOT NULL, embedding ${conn.dialect === "postgres" ? "vector(384)" : "TEXT"})`,
    "CREATE INDEX IF NOT EXISTS entries_user_date ON entries(user_id, date)",
    "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, data TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)",
  ];
  for (const sql of statements) await conn.query(sql);
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
