/** Local, synthetic-only UI fixture. No provider requests; never run on production. */
import { randomUUID } from "node:crypto";
import { createUser } from "../lib/auth";
import { mutateEntry, updatePreferences, enqueue } from "../lib/journal/store";
import { runOne } from "../lib/journal/pipeline";
import {
  CONSENT,
  VERSION,
  dimensions,
  dailySchema,
  type Evidence,
  type Narrative,
} from "../lib/journal/schema";
import type { Provider } from "../lib/journal/provider";
import { localDate, shift } from "../lib/journal/scheduler";
if (process.env.DATABASE_URL || process.env.NODE_ENV === "production")
  throw new Error("LOCAL_SYNTHETIC_PREVIEW_ONLY");
const password = randomUUID(),
  email = `qa-${randomUUID()}@demo.invalid`;
const user = await createUser("Synthetic QA", email, password, true);
await updatePreferences(user.id, {
  timezone: "UTC",
  consentVersion: CONSENT,
  autoDaily: false,
  weekly: false,
  monthly: false,
});
const today = localDate("UTC");
for (let i = 0; i < 7; i++) {
  const date = shift(today, -i),
    walking = i % 2 === 0;
  await mutateEntry(
    user.id,
    {
      id: randomUUID(),
      date,
      createdAt: `${date}T12:00:00Z`,
      narrative: walking
        ? "SYNTHETIC TEST JOURNAL. I went for a walk. I felt peaceful and connected afterwards."
        : "SYNTHETIC TEST JOURNAL. Project work felt demanding. I took a pause and was kind to myself.",
      valence: null,
      stress: null,
      energy: null,
      clarity: null,
      sleep: null,
      workload: null,
      activity: null,
      tags: ["Synthetic QA"],
    },
    null,
  );
}
function collect(v: unknown): Evidence[] {
  if (Array.isArray(v)) return v.flatMap(collect);
  if (!v || typeof v !== "object") return [];
  if ("excerpt" in v) return [v as Evidence];
  return Object.values(v).flatMap(collect);
}
const mock: Provider = async (schema, prompt, input, guard, validate) => {
  await guard();
  const x = input as any;
  let data: unknown;
  if ((schema as unknown) === dailySchema) {
    const s = x.sources[0],
      walking = s.text.includes("walk"),
      evidence = [
        {
          sourceId: s.sourceId,
          entryId: s.entryId,
          date: s.date,
          excerpt: s.text,
        },
      ],
      metric = {
        value: walking ? 7 : 4,
        strength: "moderate",
        explanation:
          "Synthetic mocked estimate for UI testing, not real AI inference.",
        evidence,
      };
    data = {
      coveredSourceIds: x.coverageIds,
      summary: walking
        ? "Synthetic preview: a walk was described as peaceful."
        : "Synthetic preview: demanding work was followed by a pause.",
      metrics: Object.fromEntries(
        dimensions.map((k) => [
          k,
          {
            ...metric,
            value: k === "stress" ? (walking ? 3 : 7) : metric.value,
          },
        ]),
      ),
      events: [
        {
          kind: walking ? "activity" : "stressor",
          label: walking ? "walking" : "project workload",
          identity: null,
          mode: "experienced",
          detail: walking
            ? "The synthetic entry mentions a peaceful walk."
            : "The synthetic entry describes demanding project work.",
          evidence,
        },
      ],
      observations: [
        {
          kind: walking ? "helpful" : "strengths",
          title: walking ? "Time outside" : "A deliberate pause",
          detail: walking
            ? "The entry describes feeling peaceful after walking."
            : "The entry describes a pause and self-kindness during demanding work.",
          evidence,
          experiment:
            "If useful, notice what a short pause feels like next time.",
        },
      ],
      safety: { immediateDanger: false, message: null, evidence: [] },
    };
  } else {
    const evidence = collect(x).slice(0, 2);
    data = {
      coveredSourceIds: x.coverageIds,
      summary:
        "Synthetic mocked preview — no live AI was used. The sample journal contrasts peaceful walks with demanding project work and small moments of self-kindness.",
      observations: [
        {
          kind: "helpful",
          title: "Pauses within a demanding week",
          detail:
            "The sample entries describe both pressure and moments of peace. These can coexist; the journal does not establish what caused a change.",
          evidence,
          experiment:
            "One optional experiment is a brief pause after focused work, followed by a sentence about how it felt.",
        },
      ],
      limitations: [
        "This is a synthetic UI fixture, not an actual provider response or a wellbeing assessment.",
      ],
    };
  }
  const parsed = schema.parse(data);
  validate(parsed);
  await guard();
  return {
    data: parsed,
    meta: {
      requestedModel: "mock-only",
      returnedModel: "synthetic-mock/no-provider",
      at: new Date().toISOString(),
      promptVersion: VERSION,
      schemaVersion: VERSION,
      inputHash: "synthetic-fixture",
    },
  };
};
await enqueue(user.id, "report", shift(today, -29), today);
const result = await runOne(mock, user.id);
if (result?.status !== "succeeded")
  throw new Error(`PREVIEW_FAILED:${result?.status}`);
console.log(
  JSON.stringify({
    email,
    password,
    userId: user.id,
    note: "Local synthetic preview only. No provider was contacted.",
  }),
);
