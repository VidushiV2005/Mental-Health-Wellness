import type { Entry } from "../types";
import {
  dimensions,
  type Daily,
  type Dimension,
  type MetricResult,
  type Narrative,
  type Pattern,
} from "./schema";
export const average = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const numeric = (xs: (number | null | undefined)[]) =>
  xs.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
export function resolveMetrics(
  narrative: Narrative,
  entries: Entry[],
): Record<Dimension, MetricResult> {
  return Object.fromEntries(
    dimensions.map((key) => {
      const estimate = narrative.metrics[key],
        ratings = numeric(entries.map((e) => e[key])),
        rating = average(ratings);
      if (
        (estimate.value === null) !== (estimate.strength === "insufficient") ||
        (estimate.value !== null && !estimate.evidence.length)
      )
        throw new Error("AI_METRIC_INVALID");
      const source =
        estimate.value !== null
          ? "journal_ai"
          : rating !== null
            ? "self_report_fallback"
            : "insufficient";
      return [
        key,
        {
          ...estimate,
          value: estimate.value ?? rating,
          source,
          scale: "1–10",
          direction:
            key === "stress" ? "higher_is_more_stress" : "higher_is_more",
          explicitRating: rating,
          conflict:
            estimate.value !== null &&
            rating !== null &&
            Math.abs(estimate.value - rating) >= 3
              ? "The narrative estimate and explicit rating differ. Both are retained; neither proves the other wrong."
              : null,
          explanation:
            source === "self_report_fallback"
              ? `Narrative evidence was insufficient. Using the mean of explicitly supplied ratings. ${estimate.explanation}`
              : estimate.explanation,
          coverage: {
            entries: entries.length,
            explicitRatings: ratings.length,
          },
        },
      ];
    }),
  ) as Record<Dimension, MetricResult>;
}
export function overall(
  metrics: Record<Dimension, MetricResult>,
  selected: readonly Dimension[] = dimensions,
) {
  const available = selected.filter((k) => metrics[k].value !== null);
  return {
    value:
      available.length >= 4
        ? average(
            available.map((k) =>
              k === "stress" ? 11 - metrics[k].value! : metrics[k].value!,
            ),
          )
        : null,
    dimensions: available,
  };
}
export function statistics(days: Daily[], start: string, end: string) {
  const calendarDays =
    Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const eligible = days.filter((d) => d.overall.value !== null);
  const common = dimensions.filter(
    (k) =>
      eligible.length > 0 && eligible.every((d) => d.metrics[k].value !== null),
  );
  return {
    calendarDays,
    observedDays: days.length,
    missingDays: calendarDays - days.length,
    metrics: Object.fromEntries(
      dimensions.map((k) => [
        k,
        {
          value: average(numeric(days.map((d) => d.metrics[k].value))),
          usableDays: days.filter((d) => d.metrics[k].value !== null).length,
          aiDays: days.filter((d) => d.metrics[k].source === "journal_ai")
            .length,
          fallbackDays: days.filter(
            (d) => d.metrics[k].source === "self_report_fallback",
          ).length,
          missingDays:
            calendarDays -
            days.filter((d) => d.metrics[k].value !== null).length,
        },
      ]),
    ) as Record<
      Dimension,
      {
        value: number | null;
        usableDays: number;
        aiDays: number;
        fallbackDays: number;
        missingDays: number;
      }
    >,
    overall: {
      value:
        common.length >= 4
          ? average(eligible.map((d) => overall(d.metrics, common).value!))
          : null,
      dimensions: common,
      usableDays: common.length >= 4 ? eligible.length : 0,
      label: eligible.some((d) =>
        common.some((k) => d.metrics[k].source === "journal_ai"),
      )
        ? "AI-estimated wellbeing · unvalidated"
        : "Self-report fallback wellbeing · unvalidated",
    },
    factual: {
      sleep: average(numeric(days.map((d) => d.factual.sleep))),
      activity: average(numeric(days.map((d) => d.factual.activity))),
    },
  };
}
export function compare(current: Daily[], previous: Daily[]) {
  // Exact same contributor dimensions in both periods; no changing-mix delta.
  const a = current.filter((d) => d.overall.value !== null),
    b = previous.filter((d) => d.overall.value !== null);
  const common = dimensions.filter((k) =>
    [...a, ...b].every((d) => d.metrics[k].value !== null),
  );
  if (a.length < 3 || b.length < 3 || common.length < 4)
    return {
      value: null,
      dimensions: [] as Dimension[],
      currentDays: a.length,
      previousDays: b.length,
      reason:
        "Comparison withheld: need three usable days per period and four shared dimensions. Missing previous cached days are not invented.",
    };
  return {
    value:
      average(a.map((d) => overall(d.metrics, common).value!))! -
      average(b.map((d) => overall(d.metrics, common).value!))!,
    dimensions: common,
    currentDays: a.length,
    previousDays: b.length,
    reason:
      "Same dimensions, equal observed-day weights. Coverage may differ; this is descriptive, not a validated change score.",
  };
}
// Only narrow, transparent aliases. Other semantic labels come from validated AI extraction.
export function canonical(label: string) {
  const key = label.toLowerCase().trim().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "a walk": "walking",
    walk: "walking",
    stroll: "walking",
    strolling: "walking",
    "went for a walk": "walking",
    "went for a stroll": "walking",
    jogging: "running",
    ran: "running",
  };
  return aliases[key] || key;
}
export function patterns(days: Daily[]): Pattern[] {
  const groups = new Map<
    string,
    { day: Daily; event: Narrative["events"][number] }[]
  >();
  for (const day of days)
    for (const event of day.narrative.events) {
      // Ambiguous people remain occurrence-specific, not a fabricated recurring identity.
      const ambiguous =
        !event.identity ||
        /^(a |my |the )?(friend|coworker|colleague|teacher|classmate|person|someone)$/i.test(
          event.identity,
        );
      const identity =
        event.kind === "person"
          ? ambiguous
            ? event.evidence[0].sourceId
            : event.identity!.toLowerCase()
          : canonical(event.label);
      const key = `${event.kind}:${event.mode}:${identity}`;
      groups.set(key, [...(groups.get(key) || []), { day, event }]);
    }
  return [...groups]
    .map(([key, items]) => {
      const first = items[0].event,
        dates = [...new Set(items.map((i) => i.day.date))].sort();
      const withEvent = days.filter(
          (d) => dates.includes(d.date) && d.metrics.valence.value !== null,
        ),
        withoutEvent = days.filter(
          (d) => !dates.includes(d.date) && d.metrics.valence.value !== null,
        );
      const association =
        first.kind === "activity" &&
        first.mode === "experienced" &&
        withEvent.length >= 3 &&
        withoutEvent.length >= 3
          ? {
              mentionedDays: withEvent.length,
              notMentionedDays: withoutEvent.length,
              mentionedMean: average(
                withEvent.map((d) => d.metrics.valence.value!),
              )!,
              notMentionedMean: average(
                withoutEvent.map((d) => d.metrics.valence.value!),
              )!,
              difference:
                average(withEvent.map((d) => d.metrics.valence.value!))! -
                average(withoutEvent.map((d) => d.metrics.valence.value!))!,
              dimension: "valence" as const,
            }
          : null;
      return {
        key,
        kind: first.kind,
        label: first.kind === "person" ? first.label : canonical(first.label),
        mode: first.mode,
        days: dates.length,
        dates,
        level:
          dates.length >= 3
            ? ("recurring" as const)
            : dates.length === 2
              ? ("emerging" as const)
              : ("single mention" as const),
        evidence: items.flatMap((i) => i.event.evidence),
        details: [...new Set(items.map((i) => i.event.detail))],
        association,
        limitation:
          "Journal-derived association is not causation or independent validation. Not mentioned does not mean absent. Different contexts and contradictory experiences may explain differences.",
      };
    })
    .sort((a, b) => b.days - a.days || a.key.localeCompare(b.key));
}
export function factual(entries: Entry[]) {
  return {
    sleep: average(numeric(entries.map((e) => e.sleep))),
    activity: average(numeric(entries.map((e) => e.activity))),
  };
}
