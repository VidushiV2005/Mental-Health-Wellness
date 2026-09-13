import { z } from "zod";
import { AnalysisError, errorDescriptions, transientErrors } from "./errors";
import type { Entry } from "../types";
import { database, query } from "../db";
import { DAILY, PERIOD } from "./prompts";
import {
  batches,
  contentHash,
  hash,
  sources,
  validateEvidence,
} from "./normalize";
import { provider as defaultProvider, type Provider } from "./provider";
import {
  dailySchema,
  periodSchema,
  VERSION,
  type Daily,
  type Job,
  type Narrative,
  type Period,
  type ProviderMeta,
  type Source,
} from "./schema";
import {
  average,
  compare,
  factual,
  overall,
  patterns,
  resolveMetrics,
  statistics,
} from "./statistics";
import {
  cachedDaily,
  cacheDaily,
  claim,
  entries,
  guarded,
  preferences,
} from "./store";

type Node<T> = { id: string; data: T };
async function reduce<T extends { coveredSourceIds: string[] }>(
  nodes: Node<T>[],
  schema: z.ZodType<T>,
  prompt: string,
  pool: Source[],
  call: Provider,
  guard: () => Promise<void>,
  metadata: ProviderMeta[],
  context: unknown,
): Promise<T> {
  let level = nodes;
  while (level.length > 1) {
    // Child IDs stand for complete subtrees, so coverage lists do not grow with raw length.
    const groups = batches(
      level.map((n) => ({
        id: n.id,
        data: { ...n.data, coveredSourceIds: undefined },
      })),
      60000,
    );
    if (groups.length >= level.length)
      throw new Error("AI_CONTEXT_REDUCTION_FAILED");
    const next: Node<T>[] = [];
    for (const group of groups) {
      const ids = group.map((n) => n.id),
        input = {
          stage: "hierarchical_merge",
          coverageIds: ids,
          context,
          parts: group,
        };
      const result = await call(schema, prompt, input, guard, (v) =>
        validateEvidence(v, pool, ids),
      );
      metadata.push(result.meta);
      next.push({ id: hash(ids), data: result.data });
    }
    level = next;
  }
  return level[0].data;
}
export async function analyzeDay(
  rows: Entry[],
  timezone: string,
  guard: () => Promise<void>,
  call: Provider = defaultProvider,
): Promise<Daily> {
  const pool = sources(rows),
    metadata: ProviderMeta[] = [],
    parts: Narrative[] = [];
  if (!pool.length) {
    // Empty text is a factual insufficiency, NOT a simulated AI success or provider fallback.
    const narrative: Narrative = {
      coveredSourceIds: [],
      summary: "No journal text was provided for this day.",
      metrics: Object.fromEntries(
        (await import("./schema")).dimensions.map((k) => [
          k,
          {
            value: null,
            strength: "insufficient",
            explanation: "No journal text.",
            evidence: [],
          },
        ]),
      ) as unknown as Narrative["metrics"],
      events: [],
      observations: [],
      safety: { immediateDanger: false, message: null, evidence: [] },
    };
    const metrics = resolveMetrics(narrative, rows);
    return {
      date: rows[0].date,
      contentHash: contentHash(rows, timezone),
      version: VERSION,
      entryIds: rows.map((e) => e.id),
      explicitEntries: rows.map(
        ({ narrative, embedding, embeddingMethod, ...e }) => e,
      ),
      sources: [],
      narrative,
      metrics,
      factual: factual(rows),
      overall: overall(metrics),
      parts: [],
      provider: [],
      createdAt: new Date().toISOString(),
    };
  }
  for (const group of batches(pool, 12000)) {
    const ids = group.map((s) => s.sourceId);
    const result = await call(
      dailySchema,
      DAILY,
      {
        stage: "journal_text",
        date: rows[0].date,
        coverageIds: ids,
        sources: group,
      },
      guard,
      (v) => {
        validateEvidence(v, group, ids);
        resolveMetrics(v, []);
        if (v.safety.immediateDanger && !v.safety.evidence.length)
          throw new Error("AI_EVIDENCE_INVALID");
      },
    );
    parts.push(result.data);
    metadata.push(result.meta);
  }
  const merged = await reduce(
    parts.map((p, i) => ({ id: `part-${i}`, data: p })),
    dailySchema,
    DAILY,
    pool,
    call,
    guard,
    metadata,
    { date: rows[0].date },
  );
  const narrative = structuredClone(merged);
  narrative.coveredSourceIds = pool.map((s) => s.sourceId);
  // All chunk events survive reduction; canonical day summaries can combine but not erase them.
  narrative.events = [
    ...new Map(
      [...parts.flatMap((p) => p.events), ...narrative.events].map((e) => [
        hash(e),
        e,
      ]),
    ).values(),
  ];
  const metrics = resolveMetrics(narrative, rows);
  return {
    date: rows[0].date,
    contentHash: contentHash(rows, timezone),
    version: VERSION,
    entryIds: rows.map((e) => e.id),
    explicitEntries: rows.map(
      ({ narrative, embedding, embeddingMethod, ...e }) => e,
    ),
    sources: pool,
    narrative,
    metrics,
    factual: factual(rows),
    overall: overall(metrics),
    parts,
    provider: metadata,
    createdAt: new Date().toISOString(),
  };
}
export async function synthesize(
  days: Daily[],
  start: string,
  end: string,
  timezone: string,
  rows: Entry[],
  previous: Daily[],
  guard: () => Promise<void>,
  call: Provider = defaultProvider,
): Promise<Period> {
  const stats = statistics(days, start, end),
    found = patterns(days),
    comparison = compare(days, previous),
    pool = days.flatMap((d) => d.sources),
    metadata: ProviderMeta[] = [];
  const parts = [];
  // Every day and its validated evidence is sent through a bounded tree, never recent-only slices.
  const dayItems = days.map((d) => ({
    id: d.date,
    date: d.date,
    summary: d.narrative.summary,
    metrics: d.metrics,
    observations: [
      ...new Map(
        [
          ...d.parts.flatMap((p) => p.observations),
          ...d.narrative.observations,
        ].map((o) => [hash(o), o]),
      ).values(),
    ],
    events: d.narrative.events,
    safety: d.narrative.safety,
  }));
  // A verbose day can be split into labelled items; full metrics + summary appear once.
  const atoms: unknown[] = dayItems.flatMap((d) => [
    {
      id: `${d.id}:summary`,
      date: d.date,
      summary: d.summary,
      metrics: d.metrics,
      safety: d.safety,
    },
    ...d.observations.map((o, i) => ({
      id: `${d.id}:observation:${i}`,
      date: d.date,
      observation: o,
    })),
    ...d.events.map((e, i) => ({
      id: `${d.id}:event:${i}`,
      date: d.date,
      event: e,
    })),
  ]);
  atoms.push(
    ...found.map(({ evidence, details, ...p }) => ({
      id: `pattern:${p.key}`,
      deterministicPattern: p,
    })),
  );
  for (const group of batches(atoms, 30000)) {
    const ids = group.map((d) => (d as { id: string }).id);
    const result = await call(
      periodSchema,
      PERIOD,
      {
        stage: "period_parts",
        range: { start, end, timezone },
        coverageIds: ids,
        days: group,
        statistics: stats,
        comparison,
      },
      guard,
      (v) => validateEvidence(v, pool, ids),
    );
    parts.push(result.data);
    metadata.push(result.meta);
  }
  const merged = await reduce(
    parts.map((data, i) => ({ id: `period-part-${i}`, data })),
    periodSchema,
    PERIOD,
    pool,
    call,
    guard,
    metadata,
    { start, end, timezone, statistics: stats, comparison },
  );
  const narrative = structuredClone(merged);
  narrative.coveredSourceIds = days.map((d) => d.date);
  return {
    kind: "journal-ai",
    version: VERSION,
    start,
    end,
    timezone,
    contentHash: contentHash(rows, timezone),
    createdAt: new Date().toISOString(),
    days,
    narrative,
    parts,
    provider: metadata,
    patterns: found,
    stats,
    comparison,
  };
}
export async function runOne(
  call: Provider = defaultProvider,
  onlyUser?: string,
) {
  const job = await claim(onlyUser);
  if (!job) return null;
  const guard = () => guarded(job, async () => {});
  try {
    await guard();
    const p = await preferences(job.user_id),
      rows = (await entries(job.user_id)).filter(
        (e) => e.date >= job.start_date && e.date <= job.end_date,
      );
    if (!rows.length) throw new Error("NO_ENTRIES");
    const dates = [...new Set(rows.map((e) => e.date))].sort(),
      days: Daily[] = [];
    for (const date of dates) {
      await guard();
      const group = rows.filter((e) => e.date === date);
      let day = await cachedDaily(
        job.user_id,
        date,
        contentHash(group, p.timezone),
      );
      if (!day) {
        await guarded(job, async (q) => {
          await q(
            "UPDATE journal_jobs SET progress = ? WHERE id = ? AND token = ?",
            [
              `Analyzing day ${days.length + 1} of ${dates.length}`,
              job.id,
              job.token,
            ],
          );
        });
        day = await analyzeDay(group, p.timezone, guard, call);
        await cacheDaily(job, day);
      }
      days.push(day);
    }
    let period: Period | null = null;
    if (job.kind !== "daily") {
      const span =
        Date.parse(job.end_date) - Date.parse(job.start_date) + 86400000;
      const beforeStart = new Date(Date.parse(job.start_date) - span)
          .toISOString()
          .slice(0, 10),
        beforeEnd = new Date(Date.parse(job.start_date) - 86400000)
          .toISOString()
          .slice(0, 10);
      const previousRows = (await entries(job.user_id)).filter(
          (e) => e.date >= beforeStart && e.date <= beforeEnd,
        ),
        previous: Daily[] = [];
      for (const date of new Set(previousRows.map((e) => e.date))) {
        const d = await cachedDaily(
          job.user_id,
          date,
          contentHash(
            previousRows.filter((e) => e.date === date),
            p.timezone,
          ),
        );
        if (d) previous.push(d);
      }
      await guarded(job, async (q) => {
        await q(
          "UPDATE journal_jobs SET progress = ? WHERE id = ? AND token = ?",
          [
            "Daily analysis complete. Generating the report summary",
            job.id,
            job.token,
          ],
        );
      });
      period = await synthesize(
        days,
        job.start_date,
        job.end_date,
        p.timezone,
        rows,
        previous,
        guard,
        call,
      );
    }
    await guarded(job, async (q) => {
      if (period) {
        await q(
          "INSERT INTO journal_periods (user_id,range_key,revision,data) VALUES (?,?,?,?) ON CONFLICT (user_id,range_key) DO UPDATE SET revision = excluded.revision, data = excluded.data",
          [
            job.user_id,
            `${job.start_date}:${job.end_date}`,
            job.revision,
            JSON.stringify(period),
          ],
        );
        if (job.result_id) {
          const report = {
            id: job.result_id,
            kind: "journal-ai",
            createdAt: period.createdAt,
            period,
            entryCount: rows.length,
            origin: job.kind === "report" ? "manual" : job.kind,
          };
          await q(
            "INSERT INTO reports (id,user_id,created_at,data) VALUES (?,?,?,?) ON CONFLICT (id) DO NOTHING",
            [
              job.result_id,
              job.user_id,
              period.createdAt,
              JSON.stringify(report),
            ],
          );
        }
      }
      await q(
        "UPDATE journal_jobs SET status = 'succeeded', active_key = NULL, progress = 'Ready', error = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND token = ?",
        [new Date().toISOString(), job.id, job.user_id, job.token],
      );
    });
    return { ...job, status: "succeeded" };
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANALYSIS_FAILED",
      cancelled = code === "JOB_CANCELLED";
    const safeCode =
      /^(AI_[A-Z_]+|FREE_MODEL_REQUIRED|NO_ENTRIES|JOB_CANCELLED)$/.test(code)
        ? code
        : "ANALYSIS_FAILED";
    const retry =
      !cancelled && transientErrors.includes(code) && job.attempts < 3;
    await query(
      "UPDATE journal_jobs SET status = ?, active_key = CASE WHEN ? = 1 THEN active_key ELSE NULL END, error = ?, progress = ?, available_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND token = ? AND status = 'running'",
      [
        cancelled ? "cancelled" : retry ? "queued" : "failed",
        Number(retry),
        safeCode,
        retry
          ? `${errorDescriptions[code] || "Provider temporarily unavailable."} Automatic retry scheduled.`
          : `${errorDescriptions[code] || "Analysis stopped. Your journal is saved."}${error instanceof AnalysisError && error.diagnostic ? ` Validation: ${error.diagnostic}` : ""}`,
        new Date(Date.now() + 60000 * job.attempts).toISOString(),
        new Date().toISOString(),
        job.id,
        job.user_id,
        job.token,
      ],
    );
    return {
      ...job,
      status: cancelled ? "cancelled" : retry ? "queued" : "failed",
      error: safeCode,
    };
  } finally {
    await query(
      "UPDATE journal_worker_lock SET token = NULL, lease_until = NULL WHERE id = 1 AND token = ?",
      [job.token],
    );
  }
}
