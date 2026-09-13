import { z } from "zod";

export const VERSION = "journal-v1.1-gemini";
export const CONSENT = "journal-content-openrouter-gemini-2026-09-v1";
export const dimensions = [
  "valence",
  "stress",
  "energy",
  "clarity",
  "social_connection",
  "motivation",
  "calmness",
  "self_compassion",
] as const;
export type Dimension = (typeof dimensions)[number];
export const labels: Record<Dimension, string> = {
  valence: "Emotional tone",
  stress: "Stress",
  energy: "Energy",
  clarity: "Clarity",
  social_connection: "Connection",
  motivation: "Motivation",
  calmness: "Calmness",
  self_compassion: "Self-compassion",
};
export const evidenceSchema = z
  .object({
    sourceId: z.string(),
    entryId: z.string(),
    date: z.string(),
    excerpt: z.string().min(1).max(240),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;
const metricSchema = z
  .object({
    value: z.number().min(1).max(10).nullable(),
    strength: z.enum(["insufficient", "limited", "moderate", "strong"]),
    explanation: z.string().max(800),
    evidence: z.array(evidenceSchema).max(6),
  })
  .strict();
export const eventSchema = z
  .object({
    kind: z.enum([
      "activity",
      "person",
      "stressor",
      "context",
      "language",
      "thought",
      "helpful",
      "strength",
    ]),
    label: z.string().min(1).max(100),
    identity: z.string().max(100).nullable(),
    mode: z.enum([
      "experienced",
      "planned",
      "negated",
      "quoted",
      "hypothetical",
      "historical",
    ]),
    detail: z.string().max(600),
    evidence: z.array(evidenceSchema).min(1).max(4),
  })
  .strict();
const observation = z
  .object({
    kind: z.enum([
      "trajectory",
      "stressors",
      "relationships",
      "thoughts",
      "coping",
      "helpful",
      "strengths",
      "uncertainty",
    ]),
    title: z.string().max(100),
    detail: z.string().max(900),
    evidence: z.array(evidenceSchema).min(1).max(6),
    experiment: z.string().max(400).nullable(),
  })
  .strict();
export const dailySchema = z
  .object({
    coveredSourceIds: z.array(z.string()),
    summary: z.string().max(1600),
    metrics: z
      .object(
        Object.fromEntries(dimensions.map((k) => [k, metricSchema])) as Record<
          Dimension,
          typeof metricSchema
        >,
      )
      .strict(),
    events: z.array(eventSchema).max(24),
    observations: z.array(observation).max(12),
    safety: z
      .object({
        immediateDanger: z.boolean(),
        message: z.string().max(600).nullable(),
        evidence: z.array(evidenceSchema).max(3),
      })
      .strict(),
  })
  .strict();
export const periodSchema = z
  .object({
    coveredSourceIds: z.array(z.string()),
    summary: z.string().max(2200),
    observations: z.array(observation).max(16),
    limitations: z.array(z.string().max(400)).max(10),
  })
  .strict();
export type Narrative = z.infer<typeof dailySchema>;
export type PeriodNarrative = z.infer<typeof periodSchema>;
export type Source = {
  sourceId: string;
  entryId: string;
  date: string;
  paragraph: number;
  segment: number;
  text: string;
  createdAt: string;
};
export type MetricResult = z.infer<typeof metricSchema> & {
  source: "journal_ai" | "self_report_fallback" | "insufficient";
  scale: "1–10";
  direction: "higher_is_more_stress" | "higher_is_more";
  explicitRating: number | null;
  conflict: string | null;
  coverage: { entries: number; explicitRatings: number };
};
export type ProviderMeta = {
  withheldProseFields?: number;
  requestedModel: string;
  returnedModel: string;
  at: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
};
export type Daily = {
  date: string;
  contentHash: string;
  version: string;
  entryIds: string[];
  explicitEntries: Omit<
    import("../types").Entry,
    "narrative" | "embedding" | "embeddingMethod"
  >[];
  sources: Source[];
  narrative: Narrative;
  metrics: Record<Dimension, MetricResult>;
  factual: { sleep: number | null; activity: number | null };
  overall: { value: number | null; dimensions: Dimension[] };
  parts: Narrative[];
  provider: ProviderMeta[];
  createdAt: string;
};
export type Pattern = {
  key: string;
  kind: string;
  label: string;
  mode: string;
  days: number;
  dates: string[];
  level: "single mention" | "emerging" | "recurring";
  evidence: Evidence[];
  details: string[];
  association: null | {
    mentionedDays: number;
    notMentionedDays: number;
    mentionedMean: number;
    notMentionedMean: number;
    difference: number;
    dimension: "valence";
  };
  limitation: string;
};
export type Period = {
  kind: "journal-ai";
  version: string;
  start: string;
  end: string;
  timezone: string;
  contentHash: string;
  createdAt: string;
  days: Daily[];
  narrative: PeriodNarrative;
  parts: PeriodNarrative[];
  provider: ProviderMeta[];
  patterns: Pattern[];
  stats: ReturnType<typeof import("./statistics").statistics>;
  comparison: ReturnType<typeof import("./statistics").compare>;
};
export type JournalReport = {
  id: string;
  kind: "journal-ai";
  createdAt: string;
  period: Period;
  entryCount: number;
  origin: "manual" | "weekly" | "monthly";
};
export type Preferences = {
  timezone: string;
  consentVersion: string | null;
  consentAt: string | null;
  autoDaily: boolean;
  weekly: boolean;
  monthly: boolean;
  revision: number;
};
export type Job = {
  id: string;
  user_id: string;
  kind: "daily" | "overview" | "report" | "weekly" | "monthly";
  start_date: string;
  end_date: string;
  status: string;
  revision: number;
  attempts: number;
  token: string | null;
  lease_until: string | null;
  progress: string;
  error: string | null;
  result_id: string | null;
  created_at: string;
  updated_at: string;
};
