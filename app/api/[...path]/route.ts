import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { database, query } from "@/lib/db";
import {
  createSession,
  createUser,
  getUser,
  logout,
  sessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { entrySchema, authSchema } from "@/lib/validation";
import { demoEntries } from "@/lib/demo";

import type { Entry } from "@/lib/types";

import {
  preferences,
  preferenceSchema,
  updatePreferences,
  mutateEntry,
  enqueue,
  overview,
  jobs,
  retryJob,
} from "@/lib/journal/store";
import { localDate, shift } from "@/lib/journal/scheduler";
import { CONSENT } from "@/lib/journal/schema";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const rateCache = globalThis as typeof globalThis & {
  wellnessRates?: Map<string, { n: number; until: number }>;
};
const rates = (rateCache.wellnessRates ??= new Map());
function limit(key: string, max: number, window = 60000) {
  const now = Date.now();
  for (const [k, v] of rates) if (v.until < now) rates.delete(k);
  const current = rates.get(key) || { n: 0, until: now + window };
  current.n++;
  rates.set(key, current);
  return current.n <= max;
}
const json = (body: unknown, status = 200, headers = {}) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
async function body(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 260000)
    throw new Error("BODY_TOO_LARGE");
  const text = await req.text();
  if (text.length > 260000) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(text || "{}");
}
async function getEntries(userId: string): Promise<Entry[]> {
  return (
    await query(
      "SELECT data FROM entries WHERE user_id = ? ORDER BY date DESC, id DESC",
      [userId],
    )
  ).map((r) => JSON.parse(String(r.data)));
}
async function saveEntry(userId: string, entry: Entry) {
  await query(
    "INSERT INTO entries (id, user_id, date, data, embedding) VALUES (?, ?, ?, ?, ?)",
    [
      entry.id,
      userId,
      entry.date,
      JSON.stringify(entry),
      JSON.stringify(entry.embedding || []),
    ],
  );
}
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await ctx.params;
    const route = path.join("/");
    const method = req.method;
    if (!["GET", "HEAD"].includes(method)) {
      const origin = req.headers.get("origin");
      const requestUrl = new URL(req.url);
      // Next can normalize 127.0.0.1 to localhost in req.url. The Host header
      // retains the browser's target; browser JS cannot forge that header.
      const hostOrigin = `${requestUrl.protocol}//${req.headers.get("host") || requestUrl.host}`;
      if (
        origin &&
        ![requestUrl.origin, hostOrigin, process.env.APP_ORIGIN].includes(
          origin,
        )
      )
        return json({ error: "Origin not allowed." }, 403);
    }
    if (route === "health" && method === "GET")
      return json({ ok: true, database: (await database()).dialect });
    if (route.startsWith("auth/") && method === "POST") {
      if (
        !limit("auth-global", 80) ||
        !limit(`auth:${req.headers.get("x-forwarded-for") || "local"}`, 25)
      )
        return json({ error: "Too many attempts. Please wait a minute." }, 429);
      if (route === "auth/logout") {
        await logout(req);
        return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
      }
      if (route === "auth/demo") {
        const user = await createUser(
          "Alex",
          `${randomUUID()}@demo.invalid`,
          randomUUID(),
          true,
        );
        for (const entry of demoEntries()) await saveEntry(user.id, entry);
        return json({ user }, 201, {
          "Set-Cookie": await createSession(user.id),
        });
      }
      if (!["auth/register", "auth/login"].includes(route))
        return json({ error: "Not found." }, 404);
      const input = authSchema.parse(await body(req));
      if (route === "auth/register") {
        if (!input.name) return json({ error: "Please enter your name." }, 400);
        if (
          (await query("SELECT id FROM users WHERE email = ?", [input.email]))
            .length
        )
          return json(
            { error: "Unable to register this email. Try signing in." },
            409,
          );
        const user = await createUser(input.name, input.email, input.password);
        return json({ user }, 201, {
          "Set-Cookie": await createSession(user.id),
        });
      }
      const found = (
        await query("SELECT * FROM users WHERE email = ?", [input.email])
      )[0];
      if (
        !found ||
        !(await verifyPassword(input.password, String(found.password)))
      )
        return json({ error: "Email or password is incorrect." }, 401);
      const user = {
        id: String(found.id),
        name: String(found.name),
        email: String(found.email),
        demo: Boolean(found.demo),
      };
      return json({ user }, 200, {
        "Set-Cookie": await createSession(user.id),
      });
    }
    const user = await getUser(req);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    if (route === "me" && method === "GET")
      return json({
        user,
        aiConfigured: Boolean(
          process.env.OPENROUTER_API_KEY?.trim() ||
          process.env.GEMINI_API_KEY?.trim(),
        ),
        model: process.env.OPENROUTER_API_KEY?.trim()
          ? process.env.OPENROUTER_MODEL || "openrouter/free"
          : process.env.GEMINI_MODEL || "gemini-3.6-flash",
        database: (await database()).dialect,
        embeddingMode: process.env.EMBEDDING_MODE || "lexical",
        preferences: await preferences(user.id),
        consentVersion: CONSENT,
      });
    if (route === "entries" && method === "GET")
      return json({
        entries: (await getEntries(user.id)).map(
          ({ embedding, ...rest }) => rest,
        ),
      });
    if (route === "entries" && method === "POST") {
      if (!limit(`entry:${user.id}`, 20))
        return json(
          { error: "Please wait a minute before adding more entries." },
          429,
        );
      const input = entrySchema.parse(await body(req));
      const entry: Entry = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      await mutateEntry(user.id, entry, null);
      return json({ entry: { ...entry, embedding: undefined } }, 201);
    }
    if (path[0] === "entries" && path.length === 2) {
      const existing = (
        await query("SELECT data FROM entries WHERE id = ? AND user_id = ?", [
          path[1],
          user.id,
        ])
      )[0];
      if (!existing) return json({ error: "Entry not found." }, 404);
      if (method === "DELETE") {
        await mutateEntry(user.id, null, JSON.parse(String(existing.data)));
        return json({ ok: true });
      }
      if (method === "PATCH") {
        const input = entrySchema.parse(await body(req));
        const old = JSON.parse(String(existing.data));
        const { embedding, embeddingMethod, ...preserved } = old;
        const entry = { ...preserved, ...input };
        await mutateEntry(user.id, entry, old);
        return json({ entry: { ...entry, embedding: undefined } });
      }
    }
    if (route === "preferences" && method === "PATCH")
      return json({
        preferences: await updatePreferences(
          user.id,
          preferenceSchema.parse(await body(req)),
        ),
      });
    if (route === "preferences" && method === "GET")
      return json({
        preferences: await preferences(user.id),
        consentVersion: CONSENT,
      });
    if (route === "companion")
      return json(
        {
          error:
            "Companion has been retired. Historical messages remain in your data export.",
        },
        410,
      );
    const range = async (input: Record<string, unknown> = {}) => {
      const pref = await preferences(user.id);
      const end = String(
        input.end ||
          req.nextUrl.searchParams.get("end") ||
          localDate(pref.timezone),
      );
      const days = Number(
        input.days || req.nextUrl.searchParams.get("days") || 30,
      );
      const start = String(
        input.start ||
          req.nextUrl.searchParams.get("start") ||
          shift(end, -Math.min(365, Math.max(7, days)) + 1),
      );
      const date = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(
          (s) =>
            !Number.isNaN(Date.parse(s)) &&
            new Date(s).toISOString().slice(0, 10) === s,
        );
      date.parse(start);
      date.parse(end);
      if (
        start > end ||
        start < "2000-01-01" ||
        end > localDate(pref.timezone) ||
        Date.parse(end) - Date.parse(start) > 364 * 86400000
      )
        throw new Error("INVALID_RANGE");
      return { start, end };
    };
    if (route === "analytics" && method === "GET") {
      const { start, end } = await range();
      return json(await overview(user.id, start, end));
    }
    if (
      (route === "analysis" && method === "POST") ||
      (route === "reports" && method === "POST")
    ) {
      const { start, end } = await range(await body(req));
      if (!limit(`analysis:${user.id}`, 10))
        return json(
          { error: "Please wait before requesting another analysis." },
          429,
        );
      const job = await (
        await database()
      ).transaction((q) =>
        enqueue(
          user.id,
          route === "reports" ? "report" : "overview",
          start,
          end,
          undefined,
          q,
        ),
      );
      return json(
        { job, status: job ? "queued" : "insufficient" },
        job ? 202 : 200,
      );
    }
    if (route === "jobs" && method === "GET")
      return json({ jobs: await jobs(user.id) });
    if (
      path[0] === "jobs" &&
      path.length === 3 &&
      path[2] === "retry" &&
      method === "POST"
    )
      return json({ job: await retryJob(user.id, path[1]) }, 202);
    if (route === "reports" && method === "GET")
      return json({
        reports: (
          await query(
            "SELECT data FROM reports WHERE user_id = ? ORDER BY created_at DESC",
            [user.id],
          )
        ).map((r) => JSON.parse(String(r.data))),
      });
    if (path[0] === "reports" && path.length === 2 && method === "DELETE") {
      const deleted = await (
        await database()
      ).transaction(async (q) => {
        await q(
          "UPDATE journal_preferences SET revision = revision WHERE user_id = ?",
          [user.id],
        );
        await q(
          "UPDATE journal_jobs SET status = 'cancelled', active_key = NULL, error = 'Report deleted' WHERE user_id = ? AND result_id = ? AND status IN ('queued','running')",
          [user.id, path[1]],
        );
        return q(
          "DELETE FROM reports WHERE user_id = ? AND id = ? RETURNING id",
          [user.id, path[1]],
        );
      });
      return json(
        deleted.length ? { ok: true } : { error: "Report not found." },
        deleted.length ? 200 : 404,
      );
    }
    if (route === "export" && method === "GET") {
      const reports = (
        await query("SELECT data FROM reports WHERE user_id = ?", [user.id])
      ).map((r) => JSON.parse(String(r.data)));
      const messages = await query(
        "SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC",
        [user.id],
      );
      return json(
        {
          exportedAt: new Date().toISOString(),
          user,
          entries: (await getEntries(user.id)).map(
            ({ embedding, ...rest }) => rest,
          ),
          reports,
          messages,
          journalPreferences: await preferences(user.id),
          analysisJobs: await query(
            "SELECT * FROM journal_jobs WHERE user_id = ? ORDER BY created_at ASC",
            [user.id],
          ),
          dailyAnalyses: (
            await query("SELECT data FROM journal_daily WHERE user_id = ?", [
              user.id,
            ])
          ).map((r) => JSON.parse(String(r.data))),
          periodAnalyses: (
            await query("SELECT data FROM journal_periods WHERE user_id = ?", [
              user.id,
            ])
          ).map((r) => JSON.parse(String(r.data))),
        },
        200,
        { "Content-Disposition": 'attachment; filename="still-my-data.json"' },
      );
    }
    if (route === "account" && method === "DELETE") {
      const input = await body(req);
      if (input.confirm !== "DELETE")
        return json({ error: "Type DELETE to confirm." }, 400);
      await query("DELETE FROM users WHERE id = ?", [user.id]);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        { error: error.issues[0]?.message || "Check your input." },
        400,
      );
    if (error instanceof SyntaxError)
      return json({ error: "Invalid JSON." }, 400);
    const message = error instanceof Error ? error.message : "";
    const errors: Record<string, [string, number]> = {
      CONSENT_REQUIRED: [
        "Allow journal-content sharing in Settings before analysis.",
        403,
      ],
      INVALID_RANGE: [
        "Choose a valid past or current range of at most 365 days.",
        400,
      ],
      NOT_FOUND: ["Not found.", 404],
      USE_REGENERATE: ["Generate a new report revision instead.", 409],
      BODY_TOO_LARGE: ["Request is too large.", 413],
      AI_NOT_CONFIGURED: [
        "Google Gemini is not connected yet. Add GEMINI_API_KEY to the server environment and restart.",
        503,
      ],
      AI_MODEL_INVALID: ["Choose a valid Gemini model in GEMINI_MODEL.", 503],
      AI_RATE_LIMIT: [
        "The free AI provider is busy. Please try again later.",
        429,
      ],
      AI_PROVIDER_ERROR: [
        "Google Gemini could not return an explanation. Check the server API key and model availability.",
        502,
      ],
    };
    if (errors[message])
      return json({ error: errors[message][0] }, errors[message][1]);
    // Never log journal content, passwords, tokens, or raw upstream responses.
    console.error(
      "API request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      {
        error:
          "The request could not be completed. Please try again or check the server setup. Journal saving does not require an AI model.",
      },
      500,
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
