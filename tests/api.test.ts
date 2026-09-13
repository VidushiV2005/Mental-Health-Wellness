import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { query } from "../lib/db";
import { analyze } from "../lib/analytics";
import { CONSENT } from "../lib/journal/schema";

process.env.SQLITE_PATH = join(
  mkdtempSync(join(tmpdir(), "wellness-api-test-")),
  "test.sqlite",
);
delete process.env.DATABASE_URL;
process.env.EMBEDDING_MODE = "lexical";
delete process.env.GEMINI_API_KEY;
const { GET, POST, PATCH, DELETE } = await import("../app/api/[...path]/route");
const methods = { GET, POST, PATCH, DELETE };
async function call(
  path: string,
  method: keyof typeof methods = "GET",
  data?: unknown,
  cookie = "",
  origin = "http://localhost:3000",
) {
  const req = new NextRequest(`http://localhost:3000/api/${path}`, {
    method,
    headers: { cookie, origin, "content-type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const response = await methods[method](req, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
test("API lifecycle: secure auth, owner isolation, persistent CRUD, immutable report, export, deletion", async () => {
  assert.equal((await call("entries")).status, 401);
  assert.equal(
    (
      await call(
        "auth/register",
        "POST",
        {
          name: "Test",
          email: "test@example.com",
          password: "long-test-password",
        },
        "",
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  const registered = await call("auth/register", "POST", {
    name: "Test",
    email: "test@example.com",
    password: "long-test-password",
  });
  assert.equal(registered.status, 201);
  assert.ok(registered.cookie.startsWith("wellness_session="));
  const cookie = registered.cookie;
  assert.equal(
    (await call("me", "GET", undefined, cookie)).body.user.name,
    "Test",
  );
  assert.equal(
    (
      await call("auth/login", "POST", {
        email: "test@example.com",
        password: "incorrect-password",
      })
    ).status,
    401,
  );
  const data = {
    date: "2026-01-01",
    stress: 4,
    energy: 7,
    clarity: 6,
    valence: 7,
    sleep: 8,
    workload: 4,
    activity: 30,
    narrative: "A walk in the park felt peaceful today.",
    tags: ["Outdoors"],
  };
  const created = await call("entries", "POST", data, cookie);
  assert.equal(created.status, 201);
  const id = created.body.entry.id;
  const persisted = await call("entries", "GET", undefined, cookie);
  assert.equal(persisted.body.entries[0].narrative, data.narrative);
  assert.equal(persisted.body.entries[0].embedding, undefined);
  const second = await call("auth/register", "POST", {
    name: "Other",
    email: "other@example.com",
    password: "another-good-password",
  });
  assert.equal(
    (await call("entries", "GET", undefined, second.cookie)).body.entries
      .length,
    0,
  );
  assert.equal(
    (await call(`entries/${id}`, "PATCH", data, second.cookie)).status,
    404,
  );
  assert.equal(
    (await call(`entries/${id}`, "DELETE", undefined, second.cookie)).status,
    404,
  );
  const report = await call(
    "reports",
    "POST",
    { start: "2026-01-01", end: "2026-01-01" },
    cookie,
  );
  assert.equal(report.status, 403); // Old aggregate consent never permits journal sharing.
  const legacy = {
    id: "legacy-report",
    createdAt: new Date().toISOString(),
    data: analyze([created.body.entry]),
    entries: [created.body.entry],
    entryCount: 1,
  };
  await query(
    "INSERT INTO reports (id,user_id,created_at,data) VALUES (?,?,?,?)",
    [
      legacy.id,
      registered.body.user.id,
      legacy.createdAt,
      JSON.stringify(legacy),
    ],
  );
  assert.equal(
    (await call(`entries/${id}`, "PATCH", { ...data, valence: 9 }, cookie))
      .status,
    200,
  );
  assert.equal(
    (await call("entries", "GET", undefined, cookie)).body.entries[0].valence,
    9,
  );
  assert.equal(
    (await call("reports", "GET", undefined, cookie)).body.reports[0].data
      .averages.valence,
    7,
  );
  assert.equal(
    (
      await call(
        "companion",
        "POST",
        { question: "Explain my data", consent: false },
        cookie,
      )
    ).status,
    410,
  );
  assert.equal(
    (
      await call(
        "companion",
        "POST",
        { question: "Explain my data", consent: true },
        cookie,
      )
    ).status,
    410,
  );
  const exported = await call("export", "GET", undefined, cookie);
  assert.equal(exported.body.entries.length, 1);
  assert.equal(exported.body.reports.length, 1);
  assert.ok(exported.body.journalPreferences);
  assert.ok(Array.isArray(exported.body.dailyAnalyses));
  assert.equal(
    (
      await call(
        "preferences",
        "PATCH",
        {
          timezone: "Asia/Kolkata",
          consentVersion: CONSENT,
          autoDaily: false,
          weekly: true,
          monthly: true,
        },
        cookie,
      )
    ).status,
    200,
  );
  const queued = await call(
    "reports",
    "POST",
    { start: "2026-01-01", end: "2026-01-01" },
    cookie,
  );
  assert.equal(queued.status, 202);
  const duplicate = await call(
    "reports",
    "POST",
    { start: "2026-01-01", end: "2026-01-01" },
    cookie,
  );
  assert.equal(duplicate.body.job.id, queued.body.job.id);
  assert.equal(
    (await call(`jobs/${queued.body.job.id}/retry`, "POST", {}, second.cookie))
      .status,
    404,
  );
  assert.equal(
    (await call("reports/legacy-report", "DELETE", undefined, second.cookie))
      .status,
    404,
  );
  assert.equal(
    (await call("account", "DELETE", { confirm: "WRONG" }, cookie)).status,
    400,
  );
  assert.equal(
    (await call(`entries/${id}`, "DELETE", undefined, cookie)).status,
    200,
  );
  assert.equal(
    (await call("entries", "GET", undefined, cookie)).body.entries.length,
    0,
  );
  assert.equal(
    (await call("account", "DELETE", { confirm: "DELETE" }, cookie)).status,
    200,
  );
  assert.equal((await call("me", "GET", undefined, cookie)).status, 401);
  assert.equal(
    (await call("entries", "GET", undefined, second.cookie)).status,
    200,
  );
  const signedIn = await call("auth/login", "POST", {
    email: "other@example.com",
    password: "another-good-password",
  });
  assert.equal(signedIn.status, 200);
  assert.equal(
    (await call("auth/logout", "POST", {}, signedIn.cookie)).status,
    200,
  );
  assert.equal(
    (await call("me", "GET", undefined, signedIn.cookie)).status,
    401,
  );
});
test("same-origin loopback request is accepted when Next normalizes the request URL", async () => {
  const req = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: "nobody@example.com",
      password: "long-enough-password",
    }),
  });
  const response = await POST(req, {
    params: Promise.resolve({ path: ["auth", "login"] }),
  });
  assert.equal(response.status, 401); // credentials fail, origin validation succeeds
});
