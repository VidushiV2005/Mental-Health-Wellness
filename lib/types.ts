export type Metric = "valence" | "stress" | "energy" | "clarity";
export type Entry = {
  id: string;
  date: string;
  stress: number;
  energy: number;
  clarity: number;
  valence: number;
  sleep: number;
  workload: number;
  activity: number;
  narrative: string;
  tags: string[];
  createdAt: string;
  embedding?: number[];
  embeddingMethod?: string;
};
export type Day = Pick<
  Entry,
  "date" | Metric | "sleep" | "workload" | "activity"
>;
export type Finding = {
  id: string;
  title: string;
  detail: string;
  n: number;
  r: number;
  interval: [number, number];
};
export type Theme = {
  id: string;
  label: string;
  count: number;
  days: number;
  entryIds: string[];
  keywords: string[];
  averageStress: number;
};
export type Analysis = {
  days: Day[];
  entryCount: number;
  dayCount: number;
  span: number;
  averages: Record<Metric | "sleep" | "workload" | "activity", number>;
  variability: Record<Metric, number>;
  volatility: number | null;
  consecutivePairs: number;
  drift: {
    value: number;
    before: number;
    after: number;
    nBefore: number;
    nAfter: number;
  } | null;
  findings: Finding[];
  themes: Theme[];
  embeddingMethod: string;
  withheld: string[];
};
export type Report = {
  id: string;
  createdAt: string;
  data: Analysis;
  entryCount: number;
  entries: Entry[];
};
export type User = { id: string; name: string; email: string; demo: boolean };
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
