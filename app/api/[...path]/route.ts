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
import { analyze } from "@/lib/analytics";
import { embed } from "@/lib/embeddings";
import { explain } from "@/lib/openrouter";
import type { Entry, Report } from "@/lib/types";

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
  if (Number(req.headers.get("content-length") || 0) > 24000)
    throw new Error("BODY_TOO_LARGE");
  const text = await req.text();
  if (text.length > 24000) throw new Error("BODY_TOO_LARGE");
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
        aiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
        model: process.env.OPENROUTER_MODEL || "openrouter/free",
        database: (await database()).dialect,
        embeddingMode: process.env.EMBEDDING_MODE || "lexical",
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
      const vector = await embed(input.narrative);
      const entry: Entry = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        embedding: vector.vector,
        embeddingMethod: vector.method,
      };
      await saveEntry(user.id, entry);
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
        await query("DELETE FROM entries WHERE id = ? AND user_id = ?", [
          path[1],
          user.id,
        ]);
        return json({ ok: true });
      }
      if (method === "PATCH") {
        const input = entrySchema.parse(await body(req));
        const old = JSON.parse(String(existing.data));
        const vector = await embed(input.narrative);
        const entry = {
          ...old,
          ...input,
          embedding: vector.vector,
          embeddingMethod: vector.method,
        };
        await query(
          "UPDATE entries SET date = ?, data = ?, embedding = ? WHERE id = ? AND user_id = ?",
          [
            entry.date,
            JSON.stringify(entry),
            JSON.stringify(entry.embedding),
            path[1],
            user.id,
          ],
        );
        return json({ entry: { ...entry, embedding: undefined } });
      }
    }
    if (route === "analytics" && method === "GET") {
      const days = Math.min(
        365,
        Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 30),
      );
      const from = new Date(Date.now() - (days - 1) * 86400000)
        .toISOString()
        .slice(0, 10);
      return json({
        analysis: analyze(
          (await getEntries(user.id)).filter((e) => e.date >= from),
        ),
      });
    }
    if (route === "reports" && method === "GET")
      return json({
        reports: (
          await query(
            "SELECT data FROM reports WHERE user_id = ? ORDER BY created_at DESC",
            [user.id],
          )
        ).map((r) => JSON.parse(String(r.data))),
      });
    if (route === "reports" && method === "POST") {
      const entries = await getEntries(user.id);
      if (!entries.length)
        return json(
          { error: "Add a journal entry before generating a report." },
          400,
        );
      const report: Report = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        data: analyze(entries),
        entryCount: entries.length,
        entries: entries.map(({ embedding, ...rest }) => rest),
      };
      await query(
        "INSERT INTO reports (id, user_id, created_at, data) VALUES (?, ?, ?, ?)",
        [report.id, user.id, report.createdAt, JSON.stringify(report)],
      );
      return json({ report }, 201);
    }
    if (route === "companion" && method === "GET")
      return json({
        messages: (
          await query(
            "SELECT id, role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC",
            [user.id],
          )
        ).map((r) => ({ ...r, createdAt: r.created_at })),
      });
    if (route === "companion" && method === "POST") {
      const input = await body(req);
      if (
        input.consent !== true ||
        typeof input.question !== "string" ||
        !input.question.trim() ||
        input.question.length > 2000
      )
        return json(
          {
            error:
              "Enter a question and allow sharing of your question and summary with OpenRouter.",
          },
          400,
        );
      if (!limit(`ai:${user.id}`, 5))
        return json(
          {
            error:
              "Please wait a minute before requesting another explanation.",
          },
          429,
        );
      const response = await explain(
        input.question.trim(),
        analyze(await getEntries(user.id)),
      );
      const question = {
        id: randomUUID(),
        role: "user",
        content: input.question.trim(),
        createdAt: new Date().toISOString(),
      };
      const answer = {
        id: randomUUID(),
        role: "assistant",
        content: response,
        createdAt: new Date(Date.now() + 1).toISOString(),
      };
      for (const msg of [question, answer])
        await query(
          "INSERT INTO messages (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
          [msg.id, user.id, msg.role, msg.content, msg.createdAt],
        );
      return json({ messages: [question, answer] });
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
      BODY_TOO_LARGE: ["Request is too large.", 413],
      AI_NOT_CONFIGURED: [
        "OpenRouter is not connected yet. Add OPENROUTER_API_KEY to the server environment and restart.",
        503,
      ],
      FREE_MODEL_REQUIRED: [
        "Choose openrouter/free or a model ending in :free in the server environment.",
        503,
      ],
      AI_RATE_LIMIT: [
        "The free AI provider is busy. Please try again later.",
        429,
      ],
      AI_PROVIDER_ERROR: [
        "OpenRouter could not return an explanation. Check the server API key and model availability.",
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
          "The request could not be completed. Please try again. If local embeddings are enabled, check that the model is prepared.",
      },
      500,
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
