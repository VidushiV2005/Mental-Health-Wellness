import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const path = join(
  mkdtempSync(join(tmpdir(), "still-legacy-migration-")),
  "legacy.sqlite",
);
process.env.SQLITE_PATH = path;
delete process.env.DATABASE_URL;
const legacy = new DatabaseSync(path);
legacy.exec(
  "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL); CREATE TABLE entries (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,date TEXT NOT NULL,data TEXT NOT NULL,embedding TEXT); CREATE TABLE reports (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE messages (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL)",
);
legacy
  .prepare("INSERT INTO users VALUES (?,?,?,?,?,?)")
  .run(
    "legacy-owner",
    "Legacy",
    "legacy@test.invalid",
    "unchanged-password-hash",
    0,
    "2025-01-01",
  );
const entry = {
  id: "old-entry",
  date: "2025-01-01",
  valence: 8,
  stress: 2,
  energy: 7,
  clarity: 6,
  sleep: 8,
  workload: 3,
  activity: 20,
  narrative: "Existing journal",
  tags: [],
  createdAt: "2025-01-01T00:00:00Z",
};
legacy
  .prepare("INSERT INTO entries VALUES (?,?,?,?,?)")
  .run(entry.id, "legacy-owner", entry.date, JSON.stringify(entry), "[0,1]");
legacy
  .prepare("INSERT INTO reports VALUES (?,?,?,?)")
  .run("old-report", "legacy-owner", "2025-01-01", '{"legacy":true}');
legacy
  .prepare("INSERT INTO messages VALUES (?,?,?,?,?)")
  .run(
    "old-message",
    "legacy-owner",
    "user",
    "Historical conversation",
    "2025-01-01",
  );
legacy.close();
const { query, database } = await import("../lib/db");
const { preferences } = await import("../lib/journal/store");
test("additive migration preserves users, original ratings, vectors, reports and messages; old consent never upgrades", async () => {
  assert.deepEqual(
    JSON.parse(
      String(
        (await query("SELECT data FROM entries WHERE id = ?", [entry.id]))[0]
          .data,
      ),
    ),
    entry,
  );
  assert.equal(
    (await query("SELECT embedding FROM entries WHERE id = ?", [entry.id]))[0]
      .embedding,
    "[0,1]",
  );
  assert.equal(
    (
      await query("SELECT password FROM users WHERE id = ?", ["legacy-owner"])
    )[0].password,
    "unchanged-password-hash",
  );
  assert.equal(
    (await query("SELECT data FROM reports"))[0].data,
    '{"legacy":true}',
  );
  assert.equal(
    (await query("SELECT content FROM messages"))[0].content,
    "Historical conversation",
  );
  const p = await preferences("legacy-owner");
  assert.equal(p.consentVersion, null);
  assert.equal(p.autoDaily, false);
  assert.equal(p.weekly, false);
  assert.equal(p.timezone, "UTC");
  assert.equal((await query("SELECT * FROM schema_migrations")).length, 1);
  await assert.rejects(
    () =>
      (async () => {
        await (
          await database()
        ).transaction(async (q) => {
          await q("UPDATE users SET name = 'Should roll back' WHERE id = ?", [
            "legacy-owner",
          ]);
          throw Error("rollback-test");
        });
      })(),
    /rollback-test/,
  );
  assert.equal(
    (await query("SELECT name FROM users WHERE id = ?", ["legacy-owner"]))[0]
      .name,
    "Legacy",
  );
});
