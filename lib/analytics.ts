import type { Analysis, Day, Entry, Metric, Theme } from "./types";
import { cosine, lexicalEmbedding, words } from "./embeddings";
export const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
export const sd = (xs: number[]) =>
  xs.length < 2
    ? 0
    : Math.sqrt(
        xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1),
      );
export function pearson(x: number[], y: number[]): number | null {
  if (x.length < 3 || x.length !== y.length || sd(x) === 0 || sd(y) === 0)
    return null;
  return Math.max(
    -1,
    Math.min(
      1,
      x.reduce((s, v, i) => s + (v - mean(x)) * (y[i] - mean(y)), 0) /
        ((x.length - 1) * sd(x) * sd(y)),
    ),
  );
}
export const dayDistance = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000,
  );
const metrics: Metric[] = ["valence", "stress", "energy", "clarity"];
const allMetrics = [...metrics, "sleep", "workload", "activity"] as const;
export function aggregate(entries: Entry[]): Day[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries)
    groups.set(entry.date, [...(groups.get(entry.date) || []), entry]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([date, rows]) =>
        ({
          date,
          ...Object.fromEntries(
            allMetrics.map((key) => [key, mean(rows.map((r) => r[key]))]),
          ),
        }) as Day,
    );
}
export function cluster(entries: Entry[]): { themes: Theme[]; method: string } {
  const narratives = entries.filter((e) => words(e.narrative).length >= 4);
  const semantic =
    narratives.length > 0 &&
    narratives.every(
      (e) =>
        e.embeddingMethod === "minilm-l6-v2-q8" && e.embedding?.length === 384,
    );
  const groups: { rows: Entry[]; vectors: number[][] }[] = [];
  const threshold = semantic ? 0.58 : 0.25;
  for (const entry of [...narratives].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const vector = semantic
      ? entry.embedding!
      : lexicalEmbedding(entry.narrative);
    let best: (typeof groups)[number] | undefined;
    let score = threshold;
    for (const group of groups) {
      const similarity = mean(group.vectors.map((v) => cosine(vector, v)));
      if (similarity > score) {
        best = group;
        score = similarity;
      }
    }
    if (best) {
      best.rows.push(entry);
      best.vectors.push(vector);
    } else groups.push({ rows: [entry], vectors: [vector] });
  }
  const corpusCounts = new Map<string, number>();
  narratives.forEach((e) =>
    new Set(words(e.narrative)).forEach((w) =>
      corpusCounts.set(w, (corpusCounts.get(w) || 0) + 1),
    ),
  );
  const themes = groups
    .filter(
      (g) => g.rows.length >= 3 && new Set(g.rows.map((e) => e.date)).size >= 3,
    )
    .map((g) => {
      const counts = new Map<string, number>();
      g.rows.forEach((e) =>
        words(e.narrative).forEach((w) =>
          counts.set(w, (counts.get(w) || 0) + 1),
        ),
      );
      const salience = (word: string, count: number) =>
        count *
        (1 +
          Math.log(
            (narratives.length + 1) / ((corpusCounts.get(word) || 0) + 1),
          ));
      const keywords = [...counts]
        .sort(
          (a, b) =>
            salience(b[0], b[1]) - salience(a[0], a[1]) ||
            a[0].localeCompare(b[0]),
        )
        .slice(0, 4)
        .map(([w]) => w);
      return {
        id: g.rows[0].id,
        label: keywords.slice(0, 2).join(" & "),
        keywords,
        count: g.rows.length,
        days: new Set(g.rows.map((e) => e.date)).size,
        entryIds: g.rows.map((e) => e.id),
        averageStress: mean(g.rows.map((e) => e.stress)),
      };
    })
    .sort((a, b) => b.count - a.count);
  return {
    themes,
    method: semantic
      ? "Local MiniLM semantic embeddings"
      : "Local lexical vectors (word similarity)",
  };
}
export function analyze(
  entries: Entry[],
  endDate = new Date().toISOString().slice(0, 10),
): Analysis {
  const days = aggregate(entries);
  const averages = Object.fromEntries(
    allMetrics.map((k) => [k, mean(days.map((d) => d[k]))]),
  ) as Analysis["averages"];
  const variability = Object.fromEntries(
    metrics.map((k) => [k, sd(days.map((d) => d[k]))]),
  ) as Record<Metric, number>;
  const differences = days
    .slice(1)
    .flatMap((d, i) =>
      dayDistance(days[i].date, d.date) === 1
        ? [(d.valence - days[i].valence) ** 2]
        : [],
    );
  const pairs = [
    ["sleep", "stress"],
    ["workload", "stress"],
    ["activity", "valence"],
    ["sleep", "energy"],
  ] as const;
  const findings: Analysis["findings"] = [];
  for (const [a, b] of pairs) {
    if (days.length < 14) continue;
    const r = pearson(
      days.map((d) => d[a]),
      days.map((d) => d[b]),
    );
    if (r === null) continue;
    const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r)));
    const margin = 2.576 / Math.sqrt(days.length - 3);
    const interval: [number, number] = [
      Math.tanh(z - margin),
      Math.tanh(z + margin),
    ];
    if (Math.abs(r) < 0.4 || interval[0] * interval[1] <= 0) continue;
    const label = b === "valence" ? "mood" : b;
    findings.push({
      id: `${a}-${b}`,
      title: `Higher ${a} is associated with ${r > 0 ? "higher" : "lower"} ${label}`,
      detail: `Across ${days.length} observed days, r = ${r.toFixed(2)}. This is an association in your entries, not evidence of cause.`,
      n: days.length,
      r,
      interval,
    });
  }
  const recent = days.filter((d) => {
    const ago = dayDistance(d.date, endDate);
    return ago >= 0 && ago < 7;
  });
  const previous = days.filter((d) => {
    const ago = dayDistance(d.date, endDate);
    return ago >= 7 && ago < 14;
  });
  const drift =
    recent.length >= 5 && previous.length >= 5
      ? {
          value:
            mean(recent.map((d) => d.valence)) -
            mean(previous.map((d) => d.valence)),
          before: mean(previous.map((d) => d.valence)),
          after: mean(recent.map((d) => d.valence)),
          nBefore: previous.length,
          nAfter: recent.length,
        }
      : null;
  const { themes, method } = cluster(entries);
  const withheld: string[] = [];
  if (days.length < 14)
    withheld.push(
      `Correlations need 14 observed days; you have ${days.length}.`,
    );
  else if (!findings.length)
    withheld.push(
      "No tested association passed both the effect-size and 99% interval thresholds.",
    );
  if (!drift)
    withheld.push(
      "Week-to-week comparison needs five observed days in each of the last two weeks.",
    );
  if (!themes.length)
    withheld.push(
      "Recurring themes need similar reflections on at least three different dates.",
    );
  return {
    days,
    averages,
    variability,
    entryCount: entries.length,
    dayCount: days.length,
    span: days.length ? dayDistance(days[0].date, days.at(-1)!.date) + 1 : 0,
    volatility: differences.length >= 2 ? Math.sqrt(mean(differences)) : null,
    consecutivePairs: differences.length,
    drift,
    findings,
    themes,
    embeddingMethod: method,
    withheld,
  };
}
