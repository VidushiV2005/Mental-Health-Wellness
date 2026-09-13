import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database, query } from "../db";
import type { Entry } from "../types";
import {
  CONSENT,
  type Preferences,
  type Job,
  type Daily,
  type Period,
} from "./schema";
import { contentHash } from "./normalize";
export type Q = typeof query;
const now = () => new Date().toISOString();
export async function preferences(
  userId: string,
  q: Q = query,
): Promise<Preferences> {
  await q(
    "INSERT INTO journal_preferences (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING",
    [userId],
  );
  const r = (
    await q("SELECT * FROM journal_preferences WHERE user_id = ?", [userId])
  )[0];
  return {
    timezone: String(r.timezone),
    consentVersion: r.consent_version as string | null,
    consentAt: r.consent_at as string | null,
    autoDaily: !!r.auto_daily,
    weekly: !!r.weekly,
    monthly: !!r.monthly,
    revision: Number(r.revision),
  };
}
export const preferenceSchema = z
  .object({
    timezone: z
      .string()
      .max(80)
      .refine((t) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: t });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid IANA timezone."),
    consentVersion: z.literal(CONSENT).nullable(),
    autoDaily: z.boolean(),
    weekly: z.boolean(),
    monthly: z.boolean(),
  })
  .strict()
  .refine(
    (p) => !!p.consentVersion || !(p.autoDaily || p.weekly || p.monthly),
    "Journal sharing consent is required for automatic analysis.",
  );
export async function updatePreferences(
  userId: string,
  input: z.infer<typeof preferenceSchema>,
) {
  return (await database()).transaction(async (q) => {
    const old = await preferences(userId, q);
    await q(
      "UPDATE journal_preferences SET timezone = ?, consent_version = ?, consent_at = ?, auto_daily = ?, weekly = ?, monthly = ?, revision = revision + 1 WHERE user_id = ?",
      [
        input.timezone,
        input.consentVersion,
        input.consentVersion
          ? old.consentVersion === CONSENT
            ? old.consentAt
            : now()
          : null,
        Number(input.autoDaily),
        Number(input.weekly),
        Number(input.monthly),
        userId,
      ],
    );
    await cancelPending(userId, q);
    return preferences(userId, q);
  });
}
async function cancelPending(userId: string, q: Q) {
  await q(
    "UPDATE journal_jobs SET status = 'cancelled', active_key = NULL, error = 'Preferences or journal changed; request fresh analysis.', updated_at = ? WHERE user_id = ? AND status IN ('queued','running')",
    [now(), userId],
  );
}
export async function entries(userId: string, q: Q = query): Promise<Entry[]> {
  return (
    await q(
      "SELECT data FROM entries WHERE user_id = ? ORDER BY date ASC, id ASC",
      [userId],
    )
  ).map((r) => JSON.parse(String(r.data)));
}
export async function mutateEntry(
  userId: string,
  entry: Entry | null,
  old: Entry | null,
) {
  return (await database()).transaction(async (q) => {
    await preferences(userId, q);
    await q(
      "UPDATE journal_preferences SET revision = revision + 1 WHERE user_id = ?",
      [userId],
    );
    if (entry && old)
      await q(
        "UPDATE entries SET date = ?, data = ?, embedding = NULL WHERE user_id = ? AND id = ?",
        [entry.date, JSON.stringify(entry), userId, old.id],
      );
    else if (entry)
      await q(
        "INSERT INTO entries (id,user_id,date,data,embedding) VALUES (?,?,?,?,NULL)",
        [entry.id, userId, entry.date, JSON.stringify(entry)],
      );
    else if (old)
      await q("DELETE FROM entries WHERE user_id = ? AND id = ?", [
        userId,
        old.id,
      ]);
    for (const date of new Set([old?.date, entry?.date].filter(Boolean)))
      await q("DELETE FROM journal_daily WHERE user_id = ? AND date = ?", [
        userId,
        date,
      ]);
    // Period snapshots remain inspectable but their revision no longer matches live data.
    const pref = await preferences(userId, q);
    if (!entry && old)
      for (const row of await q(
        "SELECT range_key FROM journal_periods WHERE user_id = ?",
        [userId],
      )) {
        const [start, end] = String(row.range_key).split(":");
        if (old.date >= start && old.date <= end)
          await q(
            "DELETE FROM journal_periods WHERE user_id = ? AND range_key = ?",
            [userId, row.range_key],
          );
      }
    // Fence old workers while retaining every already-requested range in the queue.
    // A second saved day must not silently discard a first day's pending analysis.
    await q(
      "UPDATE journal_jobs SET status = 'queued', revision = ?, attempts = 0, token = NULL, lease_until = NULL, available_at = ?, error = NULL, progress = 'Journal changed; queued fresh revision', updated_at = ? WHERE user_id = ? AND status IN ('queued','running')",
      [pref.revision, now(), now(), userId],
    );
    if (pref.consentVersion === CONSENT && pref.autoDaily)
      for (const date of new Set(
        [old?.date, entry?.date].filter((d): d is string => !!d),
      ))
        await enqueue(userId, "daily", date, date, undefined, q);
  });
}
export async function enqueue(
  userId: string,
  kind: Job["kind"],
  start: string,
  end: string,
  scheduleKey?: string,
  q: Q = query,
): Promise<Job | null> {
  const p = await preferences(userId, q);
  if (p.consentVersion !== CONSENT) throw new Error("CONSENT_REQUIRED");
  if (kind === "daily" && !p.autoDaily) throw new Error("CONSENT_REQUIRED");
  if ((kind === "weekly" && !p.weekly) || (kind === "monthly" && !p.monthly))
    throw new Error("CONSENT_REQUIRED");
  if (
    !(
      await q(
        "SELECT id FROM entries WHERE user_id = ? AND date >= ? AND date <= ? LIMIT 1",
        [userId, start, end],
      )
    ).length
  )
    return null;
  const id = randomUUID(),
    active = `${userId}:${kind}:${start}:${end}`,
    at = now();
  const inserted = await q(
    "INSERT INTO journal_jobs (id,user_id,kind,start_date,end_date,status,active_key,schedule_key,revision,available_at,progress,result_id,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING *",
    [
      id,
      userId,
      kind,
      start,
      end,
      active,
      scheduleKey || null,
      p.revision,
      at,
      "Waiting for the server worker",
      kind === "daily" || kind === "overview" ? null : randomUUID(),
      at,
      at,
    ],
  );
  if (inserted.length) return inserted[0] as unknown as Job;
  return (
    ((
      await q(
        "SELECT * FROM journal_jobs WHERE user_id = ? AND (active_key = ? OR schedule_key = ?) ORDER BY created_at DESC LIMIT 1",
        [userId, active, scheduleKey || null],
      )
    )[0] as unknown as Job) || null
  );
}
export async function jobs(userId: string) {
  return (await query(
    "SELECT * FROM journal_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 80",
    [userId],
  )) as unknown as Job[];
}
export async function claim(onlyUser?: string): Promise<Job | null> {
  return (await database()).transaction(async (q) => {
    const token = randomUUID(),
      at = now(),
      until = new Date(Date.now() + 180000).toISOString();
    if (
      !(
        await q(
          "UPDATE journal_worker_lock SET token = ?, lease_until = ? WHERE id = 1 AND (lease_until IS NULL OR lease_until < ?) RETURNING id",
          [token, until, at],
        )
      ).length
    )
      return null;
    await q(
      `UPDATE journal_jobs SET status = 'failed', active_key = NULL, error = 'Worker interrupted repeatedly; retry explicitly.', updated_at = ? WHERE status = 'running' AND lease_until < ? AND attempts >= 3${onlyUser ? " AND user_id = ?" : ""}`,
      onlyUser ? [at, at, onlyUser] : [at, at],
    );
    await q(
      `UPDATE journal_jobs SET status = 'queued', token = NULL, progress = 'Recovering interrupted work' WHERE status = 'running' AND lease_until < ? AND attempts < 3${onlyUser ? " AND user_id = ?" : ""}`,
      onlyUser ? [at, onlyUser] : [at],
    );
    const row = (
      await q(
        `SELECT id FROM journal_jobs WHERE status = 'queued' AND available_at <= ?${onlyUser ? " AND user_id = ?" : ""} ORDER BY created_at ASC LIMIT 1`,
        onlyUser ? [at, onlyUser] : [at],
      )
    )[0];
    if (!row) {
      await q(
        "UPDATE journal_worker_lock SET token = NULL, lease_until = NULL WHERE id = 1 AND token = ?",
        [token],
      );
      return null;
    }
    return (
      await q(
        "UPDATE journal_jobs SET status = 'running', token = ?, lease_until = ?, attempts = attempts + 1, progress = 'Reading journal days', updated_at = ? WHERE id = ? AND status = 'queued' RETURNING *",
        [token, until, at, row.id],
      )
    )[0] as unknown as Job;
  });
}
export async function guarded<T>(
  job: Job,
  fn: (q: Q, pref: Preferences) => Promise<T>,
): Promise<T> {
  return (await database()).transaction(async (q) => {
    // Lock preferences first: edits/revocation use this same lock before cancelling jobs.
    const locked = await q(
      "UPDATE journal_preferences SET revision = revision WHERE user_id = ? RETURNING user_id",
      [job.user_id],
    );
    if (!locked.length) throw new Error("JOB_CANCELLED");
    const p = await preferences(job.user_id, q),
      at = now();
    if (
      p.revision !== job.revision ||
      p.consentVersion !== CONSENT ||
      (job.kind === "daily" && !p.autoDaily) ||
      (job.kind === "weekly" && !p.weekly) ||
      (job.kind === "monthly" && !p.monthly)
    )
      throw new Error("JOB_CANCELLED");
    const valid = await q(
      "SELECT id FROM journal_jobs WHERE id = ? AND user_id = ? AND status = 'running' AND token = ? AND lease_until > ?",
      [job.id, job.user_id, job.token, at],
    );
    if (!valid.length) throw new Error("JOB_CANCELLED");
    const until = new Date(Date.now() + 180000).toISOString();
    if (
      !(
        await q(
          "UPDATE journal_worker_lock SET lease_until = ? WHERE id = 1 AND token = ? AND lease_until > ? RETURNING id",
          [until, job.token, at],
        )
      ).length
    )
      throw new Error("JOB_CANCELLED");
    await q(
      "UPDATE journal_jobs SET lease_until = ?, updated_at = ? WHERE id = ? AND token = ?",
      [until, at, job.id, job.token],
    );
    return fn(q, p);
  });
}
export async function cachedDaily(
  userId: string,
  date: string,
  hash: string,
): Promise<Daily | null> {
  const row = (
    await query(
      "SELECT data FROM journal_daily WHERE user_id = ? AND date = ? AND content_hash = ?",
      [userId, date, hash],
    )
  )[0];
  return row ? JSON.parse(String(row.data)) : null;
}
export async function cacheDaily(job: Job, day: Daily) {
  await guarded(job, async (q) => {
    await q(
      "INSERT INTO journal_daily (user_id,date,content_hash,data) VALUES (?,?,?,?) ON CONFLICT (user_id,date) DO UPDATE SET content_hash = excluded.content_hash, data = excluded.data",
      [job.user_id, day.date, day.contentHash, JSON.stringify(day)],
    );
    await q(
      "UPDATE journal_jobs SET progress = ? WHERE id = ? AND user_id = ?",
      [`Analyzed ${day.date}`, job.id, job.user_id],
    );
  });
}
export async function overview(userId: string, start: string, end: string) {
  const p = await preferences(userId),
    all = (await entries(userId)).filter(
      (e) => e.date >= start && e.date <= end,
    ),
    key = `${start}:${end}`;
  const row = (
    await query(
      "SELECT revision,data FROM journal_periods WHERE user_id = ? AND range_key = ?",
      [userId, key],
    )
  )[0];
  const period: Period | null = row ? JSON.parse(String(row.data)) : null;
  const live =
    period &&
    Number(row.revision) === p.revision &&
    period.contentHash === contentHash(all, p.timezone);
  const active = (
    await query(
      "SELECT * FROM journal_jobs WHERE user_id = ? AND revision = ? AND start_date = ? AND end_date = ? AND kind <> 'daily' AND status IN ('queued','running','failed') ORDER BY created_at DESC LIMIT 1",
      [userId, p.revision, start, end],
    )
  )[0] as unknown as Job | undefined;
  const status = !all.length
    ? "insufficient"
    : p.consentVersion !== CONSENT
      ? "consent-needed"
      : active?.status === "running"
        ? "generating"
        : active?.status === "queued"
          ? "queued"
          : active?.status === "failed"
            ? "failed"
            : live
              ? period!.days.every((d) =>
                  Object.values(d.metrics).every((m) => m.value === null),
                )
                ? "insufficient-evidence"
                : "ready"
              : period
                ? "stale"
                : !(
                      process.env.OPENROUTER_API_KEY?.trim() ||
                      process.env.GEMINI_API_KEY?.trim()
                    )
                  ? "not-configured"
                  : "not-analyzed";
  return {
    status,
    period,
    job: active || null,
    entryCount: all.length,
    observedDays: new Set(all.map((e) => e.date)).size,
  };
}
export async function retryJob(userId: string, id: string) {
  const j = (
    await query("SELECT * FROM journal_jobs WHERE user_id = ? AND id = ?", [
      userId,
      id,
    ])
  )[0] as unknown as Job;
  if (!j) throw new Error("NOT_FOUND");
  if (["running", "queued"].includes(j.status)) return j;
  if (j.status === "succeeded") throw new Error("USE_REGENERATE");
  if (j.error === "Report deleted") throw new Error("USE_REGENERATE");
  return (await database()).transaction(async (q) => {
    await q(
      "UPDATE journal_preferences SET revision = revision WHERE user_id = ?",
      [userId],
    );
    const p = await preferences(userId, q);
    if (
      p.consentVersion !== CONSENT ||
      (j.kind === "daily" && !p.autoDaily) ||
      (j.kind === "weekly" && !p.weekly) ||
      (j.kind === "monthly" && !p.monthly)
    )
      throw new Error("CONSENT_REQUIRED");
    const active = (
      await q(
        "SELECT * FROM journal_jobs WHERE user_id = ? AND active_key = ?",
        [userId, `${userId}:${j.kind}:${j.start_date}:${j.end_date}`],
      )
    )[0];
    if (active) return active as unknown as Job;
    return (
      await q(
        "UPDATE journal_jobs SET status = 'queued', revision = ?, attempts = 0, active_key = ?, available_at = ?, progress = 'Retry queued', error = NULL, updated_at = ? WHERE id = ? AND user_id = ? RETURNING *",
        [
          p.revision,
          `${userId}:${j.kind}:${j.start_date}:${j.end_date}`,
          now(),
          now(),
          id,
          userId,
        ],
      )
    )[0] as unknown as Job;
  });
}
