import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, analyze, pearson, sd } from "../lib/analytics";
import { cosine, lexicalEmbedding } from "../lib/embeddings";
import { entrySchema } from "../lib/validation";
import type { Entry } from "../lib/types";

function entry(i: number, values: Partial<Entry> = {}): Entry {
  const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
  return {
    id: `entry-${String(i).padStart(3, "0")}`,
    date,
    valence: 5,
    stress: 5,
    energy: 5,
    clarity: 5,
    sleep: 7,
    workload: 5,
    activity: 30,
    narrative: "",
    tags: [],
    createdAt: `${date}T12:00:00Z`,
    ...values,
  };
}
test("daily aggregation does not overweight multiple check-ins", () => {
  const result = analyze([
    entry(0, { valence: 2 }),
    entry(0, { id: "second", valence: 10 }),
    entry(1, { valence: 4 }),
  ]);
  assert.equal(result.averages.valence, 5);
  assert.equal(result.dayCount, 2);
  assert.equal(result.entryCount, 3);
});
test("constant or unpaired data has no Pearson correlation", () => {
  assert.equal(pearson([1, 1, 1], [2, 3, 4]), null);
  assert.equal(pearson([1, 2, 3], [1, 2]), null);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [4, 3, 2, 1])! + 1) < 1e-10);
  assert.equal(sd([1]), 0);
});
test("correlations are withheld below 14 independent dates", () => {
  const rows = Array.from({ length: 13 }, (_, i) =>
    entry(i, { sleep: i / 2, stress: 10 - i / 2 }),
  );
  assert.equal(analyze(rows).findings.length, 0);
  assert.match(analyze(rows).withheld[0], /14 observed days/);
});
test("strong repeated association passes qualification, weak correlation does not", () => {
  const strong = Array.from({ length: 28 }, (_, i) =>
    entry(i, { sleep: 5 + (i % 5), stress: 10 - (i % 5) }),
  );
  const finding = analyze(strong).findings.find((f) => f.id === "sleep-stress");
  assert.ok(finding);
  assert.ok(finding.interval[1] < 0);
  assert.equal(finding.n, 28);
  const weak = Array.from({ length: 28 }, (_, i) =>
    entry(i, { sleep: 5 + (i % 5), stress: 3 + ((i * 7) % 6) }),
  );
  assert.equal(
    analyze(weak).findings.filter((f) => f.id === "sleep-stress").length,
    0,
  );
});
test("volatility skips missing dates and needs at least two consecutive pairs", () => {
  const result = analyze([
    entry(0, { valence: 2 }),
    entry(1, { valence: 4 }),
    entry(7, { valence: 10 }),
    entry(8, { valence: 8 }),
  ]);
  assert.equal(result.volatility, 2);
  assert.equal(result.consecutivePairs, 2);
  assert.equal(analyze([entry(0), entry(3)]).volatility, null);
});
test("drift compares actual adjacent calendar weeks, not two arbitrary chunks", () => {
  const rows = Array.from({ length: 14 }, (_, i) =>
    entry(i, { valence: i < 7 ? 3 : 7 }),
  );
  assert.equal(analyze(rows, "2026-01-14").drift?.value, 4);
  assert.equal(analyze(rows, "2026-03-01").drift, null);
});
test("theme evidence needs different dates and identifies repeated vocabulary", () => {
  const narrative =
    "Studying for project deadlines and assignments made the exam week busy.";
  assert.equal(
    analyze([
      entry(0, { narrative }),
      entry(0, { narrative, id: "two" }),
      entry(0, { narrative, id: "three" }),
    ]).themes.length,
    0,
  );
  const result = analyze([
    entry(0, { narrative }),
    entry(1, { narrative }),
    entry(2, { narrative }),
  ]);
  assert.equal(result.themes.length, 1);
  assert.equal(result.themes[0].count, 3);
  assert.match(result.embeddingMethod, /lexical/);
});
test("lexical embeddings are normalized, deterministic, finite, and handle empty input", () => {
  const a = lexicalEmbedding("walking outside in the park");
  assert.equal(a.length, 384);
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-8);
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-8);
  assert.deepEqual(lexicalEmbedding(""), Array(384).fill(0));
  assert.equal(aggregate([]).length, 0);
});
test("entry validation rejects impossible dates and out-of-range metrics", () => {
  assert.equal(
    entrySchema.safeParse(entry(0, { date: "2026-02-30" })).success,
    false,
  );
  assert.equal(entrySchema.safeParse(entry(0, { stress: 11 })).success, false);
  assert.equal(entrySchema.safeParse(entry(0, { sleep: -1 })).success, false);
  assert.equal(entrySchema.safeParse(entry(0)).success, true);
});
