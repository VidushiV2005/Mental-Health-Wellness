"use client";
import { useState } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  dimensions,
  labels,
  type Dimension,
  type Evidence,
  type Period,
} from "@/lib/journal/schema";
import { shiftDate } from "./journal-ui";
export const format = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(1);
export function EvidenceList({
  items,
  onEntry,
}: {
  items: Evidence[];
  onEntry: (id: string) => void;
}) {
  const unique = [
    ...new Map(items.map((e) => [JSON.stringify(e), e])).values(),
  ];
  return (
    <details className="evidence">
      <summary>
        Journal evidence · {unique.length} excerpt
        {unique.length === 1 ? "" : "s"}
      </summary>
      {unique.map((e, i) => (
        <blockquote key={i}>
          <p>“{e.excerpt}”</p>
          <button className="text-button" onClick={() => onEntry(e.entryId)}>
            {e.date} · open entry
          </button>
        </blockquote>
      ))}
    </details>
  );
}
export function Insights({
  period,
  onEntry,
  patternsOnly = false,
}: {
  period: Period;
  onEntry: (id: string) => void;
  patternsOnly?: boolean;
}) {
  const [dimension, setDimension] = useState<Dimension>("valence");
  const selected = period.stats.metrics[dimension];
  const days = Array.from({ length: period.stats.calendarDays }, (_, i) => {
    const date = shiftDate(period.start, i),
      d = period.days.find((d) => d.date === date);
    return {
      date,
      value: d?.metrics[dimension].value ?? null,
      source: d?.metrics[dimension].source || "missing",
    };
  });
  return (
    <div className="insights">
      {!patternsOnly && (
        <>
          <section className="wellbeing-summary">
            <div>
              <p className="eyebrow">
                {period.stats.overall.label.toUpperCase()}
              </p>
              <div className="wellbeing-value">
                {format(period.stats.overall.value)}
                <span>/ 10</span>
              </div>
              <p>
                {period.stats.overall.usableDays} usable days ·{" "}
                {period.stats.observedDays} observed /{" "}
                {period.stats.calendarDays} calendar days
              </p>
            </div>
            <div>
              <h2>Across your journal</h2>
              <p>{period.narrative.summary}</p>
              <small>
                {period.comparison.value === null
                  ? period.comparison.reason
                  : `${period.comparison.value >= 0 ? "+" : ""}${format(period.comparison.value)} vs previous period on ${period.comparison.dimensions.map((k) => labels[k]).join(", ")} (${period.comparison.currentDays} / ${period.comparison.previousDays} usable days). ${period.comparison.reason}`}
              </small>
            </div>
          </section>
          <details className="method-note">
            <summary>How this estimate is calculated</summary>
            <p>
              Daily mean of available dimensions, with stress reversed as 11 −
              stress; at least four dimensions required. The period uses only
              dimensions shared by all eligible days (at least four), with equal
              weight per observed day. Missing dates are not filled.
              Contributors:{" "}
              {period.stats.overall.dimensions
                .map((k) => labels[k])
                .join(", ") || "insufficient shared coverage"}
              .
            </p>
            <p>
              Narrative evidence takes priority. Explicit ratings are used only
              when text is insufficient for that dimension. Unavailable AI is
              not the same as insufficient evidence. This is not a validated
              assessment or a diagnosis.
            </p>
          </details>
          <section className="metric-strip" aria-label="Dimension summaries">
            {dimensions.map((k) => (
              <button
                key={k}
                className={dimension === k ? "selected" : ""}
                onClick={() => setDimension(k)}
                aria-pressed={dimension === k}
              >
                <span>{labels[k]}</span>
                <strong>{format(period.stats.metrics[k].value)}</strong>
                <small>
                  {period.stats.metrics[k].usableDays} days ·{" "}
                  {period.stats.metrics[k].aiDays} AI /{" "}
                  {period.stats.metrics[k].fallbackDays} rating
                </small>
                {k === "stress" && <small>Higher = more stress</small>}
              </button>
            ))}
          </section>
          <section className="journal-chart">
            <div className="section-title">
              <h2>{labels[dimension]} over time</h2>
              <span>{selected.missingDays} unscored calendar days</span>
            </div>
            <p className="muted">
              1–10 · Gaps are unknown, not neutral. Lines do not bridge missing
              days.
            </p>
            <div style={{ height: 240, width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={days}
                  margin={{ left: -24, right: 15, top: 20, bottom: 5 }}
                >
                  <CartesianGrid vertical={false} stroke="#e5e9df" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(s) => s.slice(5)}
                    minTickGap={32}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    domain={[1, 10]}
                    ticks={[1, 5, 10]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Line
                    type="linear"
                    dataKey="value"
                    name={labels[dimension]}
                    stroke="#47664d"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <details className="evidence">
              <summary>Accessible chart data & score explanations</summary>
              <div className="table-scroll">
                <table>
                  <caption>
                    {labels[dimension]} — all calendar days, missing shown as a
                    dash
                  </caption>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Estimate</th>
                      <th>Source / strength</th>
                      <th>Explanation & evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => {
                      const metric = period.days.find(
                        (day) => day.date === d.date,
                      )?.metrics[dimension];
                      return (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>{format(d.value)}</td>
                          <td>
                            {d.source.replaceAll("_", " ")}
                            <br />
                            {metric?.strength}
                          </td>
                          <td>
                            {metric?.explanation ||
                              "No journal data for this date."}
                            {metric?.explicitRating != null && (
                              <p>
                                Original explicit daily rating:{" "}
                                {format(metric.explicitRating)} (
                                {metric.coverage.explicitRatings} ratings)
                              </p>
                            )}
                            {metric?.conflict && <p>{metric.conflict}</p>}
                            {metric?.evidence.length ? (
                              <EvidenceList
                                items={metric.evidence}
                                onEntry={onEntry}
                              />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <p className="method-note">
            Explicit factual observations only: sleep{" "}
            {format(period.stats.factual.sleep)} hours; activity{" "}
            {format(period.stats.factual.activity)} minutes per observed day
            with that field supplied. These are not inferred from tone.
          </p>
          {period.days
            .filter((d) => d.narrative.safety.immediateDanger)
            .map((d) => (
              <section className="safety-notice" key={d.date}>
                <h2>Support beyond this journal</h2>
                <p>
                  {d.narrative.safety.message ||
                    "If you are in immediate danger, contact local emergency services and someone you trust who can be with you."}
                </p>
                <p>
                  This journal is not monitored and cannot provide emergency
                  support.
                </p>
                <EvidenceList
                  items={d.narrative.safety.evidence}
                  onEntry={onEntry}
                />
              </section>
            ))}
          <section className="reflection-breakdown">
            <div className="section-title">
              <h2>Detailed reflection</h2>
              <span>Grounded in your words</span>
            </div>
            {period.narrative.observations.length ? (
              period.narrative.observations.map((o, i) => (
                <article key={i}>
                  <p className="eyebrow">{o.kind}</p>
                  <h3>{o.title}</h3>
                  <p>{o.detail}</p>
                  {o.experiment && (
                    <p className="small-step">
                      <strong>Optional small step</strong> {o.experiment}
                    </p>
                  )}
                  <EvidenceList items={o.evidence} onEntry={onEntry} />
                </article>
              ))
            ) : (
              <p>
                No sufficiently supported reflections were returned. Missing
                sections are intentionally left out.
              </p>
            )}
            {period.narrative.limitations.map((l, i) => (
              <p className="method-note" key={i}>
                {l}
              </p>
            ))}
          </section>
          <details className="method-note">
            <summary>Full daily summaries & processing provenance</summary>
            {period.days.map((d) => (
              <article key={d.date}>
                <h3>
                  {d.date} · {d.entryIds.length} entries
                </h3>
                <p>{d.narrative.summary}</p>
                <p>
                  {d.sources.length} text segments processed;{" "}
                  {d.provider.length} provider calls. Original explicit ratings
                  and all segment analyses are included in JSON export.
                </p>
                <p>{d.narrative.observations.map((o) => o.detail).join(" ")}</p>
              </article>
            ))}
            <p>
              Prompt/schema: {period.version}. Generated {period.createdAt}.
              Models:{" "}
              {[
                ...new Set(
                  [
                    ...period.provider,
                    ...period.days.flatMap((d) => d.provider),
                  ].map((p) => p.returnedModel),
                ),
              ].join(", ") || "No provider calls"}
              .
            </p>
            <p>
              Requested models:{" "}
              {[
                ...new Set(
                  [
                    ...period.provider,
                    ...period.days.flatMap((d) => d.provider),
                  ].map((p) => p.requestedModel),
                ),
              ].join(", ")}
              . Source hash: {period.contentHash}
            </p>
          </details>
        </>
      )}
      <section className="pattern-section">
        <div className="section-title">
          <h2>Activities, people & recurring context</h2>
          <span>One vote per observed day</span>
        </div>
        <p className="method-note">
          Single mention: one date. Emerging: two dates. Recurring: at least
          three distinct dates. Plans and negated or historical experiences are
          kept separate.
        </p>
        {period.patterns.length ? (
          period.patterns.map((p) => (
            <article className="pattern-row" key={p.key}>
              <div>
                <span className="eyebrow">
                  {p.kind} · {p.mode}
                </span>
                <h3>{p.label}</h3>
                <p>{p.details.join(" ")}</p>
                {p.association ? (
                  <p className="association">
                    Emotional tone: {format(p.association.mentionedMean)} on{" "}
                    {p.association.mentionedDays} activity-mentioned days vs{" "}
                    {format(p.association.notMentionedMean)} on{" "}
                    {p.association.notMentionedDays} not-mentioned days.
                    Difference: {format(p.association.difference)} / 10.{" "}
                    {p.limitation}
                  </p>
                ) : (
                  <p className="muted">
                    No numerical activity comparison: requires an experienced
                    activity and three usable days in each
                    mentioned/not-mentioned group.
                  </p>
                )}
                <EvidenceList items={p.evidence} onEntry={onEntry} />
              </div>
              <div className="pattern-count">
                <strong>{p.days}</strong>
                <span>distinct days</span>
                <small>{p.level}</small>
              </div>
            </article>
          ))
        ) : (
          <p>No supported semantic events yet.</p>
        )}
      </section>
    </div>
  );
}
