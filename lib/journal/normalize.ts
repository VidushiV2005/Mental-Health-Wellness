import { createHash } from "node:crypto";
import type { Entry } from "../types";
import { VERSION, type Source, type Evidence } from "./schema";
import { AnalysisError } from "./errors";
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const ordered = (entries: Entry[]) =>
  [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
export const contentHash = (entries: Entry[], timezone: string) =>
  hash({
    version: VERSION,
    timezone,
    entries: ordered(entries).map(({ embedding, embeddingMethod, ...e }) => e),
  });
export function sources(entries: Entry[]): Source[] {
  return ordered(entries).flatMap((e) =>
    e.narrative.split(/\r?\n\s*\r?\n/).flatMap((text, paragraph) => {
      const parts: Source[] = [];
      // Preserve every character; bounded segments never drop a later paragraph.
      for (let offset = 0; offset < text.length; offset += 3000)
        parts.push({
          sourceId: `${e.id}:p${paragraph}:s${offset / 3000}`,
          entryId: e.id,
          date: e.date,
          paragraph,
          segment: offset / 3000,
          text: text.slice(offset, offset + 3000),
          createdAt: e.createdAt,
        });
      return parts;
    }),
  );
}
export function validateEvidence(
  value: unknown,
  pool: Source[],
  coverage: string[],
) {
  const data = value as { coveredSourceIds?: string[] };
  if (
    !data.coveredSourceIds ||
    [...data.coveredSourceIds].sort().join("\0") !==
      [...coverage].sort().join("\0")
  )
    throw new Error("AI_COVERAGE_INVALID");
  const index = new Map(pool.map((s) => [s.sourceId, s]));
  function walk(v: unknown): void {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (!v || typeof v !== "object") return;
    if ("excerpt" in v) {
      const e = v as Evidence,
        source = index.get(e.sourceId);
      if (
        !source ||
        e.entryId !== source.entryId ||
        e.date !== source.date ||
        !source.text.includes(e.excerpt)
      )
        throw new Error("AI_EVIDENCE_INVALID");
    }
    Object.values(v).forEach(walk);
  }
  walk(value);
  const safety = (
    value as {
      safety?: {
        immediateDanger: boolean;
        evidence: Evidence[];
        message: string | null;
      };
    }
  ).safety;
  if (safety?.immediateDanger && (!safety.evidence.length || !safety.message))
    throw new Error("AI_SAFETY_INVALID");
  const proseKeys = new Set([
    "summary",
    "detail",
    "explanation",
    "experiment",
    "limitations",
    "message",
  ]);
  function prose(v: unknown): void {
    if (Array.isArray(v)) {
      v.forEach(prose);
      return;
    }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (proseKeys.has(k))
        for (const text of Array.isArray(x) ? x : [x])
          if (typeof text === "string") {
            const quantity =
              "(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|several|many)";
            // Block derived statistics, rather than all digits. Exact source facts and
            // source dates may be repeated; they do not become new calculated claims.
            const statistical = new RegExp(
              `${quantity}\\s*(?:%|percent(?:age)?|points?\\b|(?:observed|usable|missing|scored|mentioned|calendar)\\s+days?\\b|entries\\b)|(?:average|mean|score|correlation|difference|increased|decreased|improved|declined)\\b[^.!?]{0,40}\\d|\\d+(?:\\.\\d+)?\\s*(?:/|out of)\\s*10`,
              "i",
            );
            if (statistical.test(text))
              throw new AnalysisError(
                "AI_PROSE_NUMBERS",
                "Write statistics and score changes qualitatively in prose. Code displays the numerical statistics separately.",
              );
            let remainder = text;
            for (const source of pool) {
              remainder = remainder.replaceAll(source.date, "");
              // Accept numeric facts only within literal phrases copied from the source.
              for (const phrase of source.text
                .split(/[.!?\n]/)
                .filter((p) => /\d/.test(p)))
                if (phrase.trim())
                  remainder = remainder.replaceAll(phrase.trim(), "");
            }
            if (/\d/.test(remainder))
              throw new AnalysisError(
                "AI_PROSE_NUMBERS",
                "Remove digits from narrative prose unless repeating an exact journal phrase or a supplied source date. Express optional steps in words.",
              );
          }
      prose(x);
    }
  }
  prose(value);
}
export function batches<T>(items: T[], max = 16000): T[][] {
  const result: T[][] = [];
  let batch: T[] = [],
    size = 0;
  for (const item of items) {
    const length = JSON.stringify(item).length;
    if (length > max) throw new Error("AI_CONTEXT_ITEM_TOO_LARGE");
    if (size + length > max && batch.length) {
      result.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(item);
    size += length;
  }
  if (batch.length) result.push(batch);
  return result;
}

/** Withhold an unsupported prose field, never rewrite its quantities or manufacture an interpretation. */
export function withholdNumericalProse<T>(
  value: T,
  pool: Source[],
  coverage: string[],
): { data: T; withheld: number } {
  const data = structuredClone(value);
  const keys = new Set([
    "summary",
    "detail",
    "explanation",
    "experiment",
    "limitations",
    "message",
  ]);
  let withheld = 0;
  function clean(text: string, key: string): string | null {
    try {
      validateEvidence(
        { coveredSourceIds: coverage, summary: text },
        pool,
        coverage,
      );
      return text;
    } catch (error) {
      if (
        !(error instanceof AnalysisError) ||
        error.message !== "AI_PROSE_NUMBERS"
      )
        throw error;
      withheld++;
      return key === "experiment"
        ? null
        : key === "message"
          ? "If you are in immediate danger, contact local emergency services and someone you trust who can be with you. This journal is not monitored."
          : "Numerical wording from the provider was withheld. Refer to the separately calculated scores and original journal evidence.";
    }
  }
  function walk(v: unknown): void {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (!v || typeof v !== "object") return;
    const object = v as Record<string, unknown>;
    for (const [key, x] of Object.entries(object)) {
      if (keys.has(key) && typeof x === "string") object[key] = clean(x, key);
      else if (key === "limitations" && Array.isArray(x))
        object[key] = x.map((t) => (typeof t === "string" ? clean(t, key) : t));
      else walk(x);
    }
  }
  walk(data);
  return { data, withheld };
}
