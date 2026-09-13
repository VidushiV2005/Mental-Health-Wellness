import { existsSync } from "node:fs";
import {
  AnalysisError,
  classifyProviderError,
  errorDescriptions,
} from "../lib/journal/errors";
import type { Entry } from "../lib/types";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
// Uses invented text only, never opens the journal database or prints API payloads.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const started = Date.now();
  const response = await originalFetch(...args);
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  const choice = body?.candidates?.[0];
  console.log(
    JSON.stringify({
      httpStatus: response.status,
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
      model: body?.modelVersion,
      finishReason: choice?.finishReason,
      contentCharacters:
        choice?.content?.parts?.reduce(
          (n: number, p: { text?: string; thought?: boolean }) =>
            n + (!p.thought && typeof p.text === "string" ? p.text.length : 0),
          0,
        ) || 0,
      completionTokens: body?.usageMetadata?.candidatesTokenCount,
      reasoningTokens: body?.usageMetadata?.thoughtsTokenCount,
    }),
  );
  return response;
};
const entry: Entry = {
  id: "synthetic-api-check",
  date: "2026-09-01",
  createdAt: "2026-09-01T12:00:00Z",
  narrative:
    "I felt tense about my project this morning. After a peaceful walk with my sister, I felt calmer and glad we talked. I still feel tired, but I am proud that I asked for help.",
  valence: null,
  stress: null,
  energy: null,
  clarity: null,
  sleep: null,
  workload: null,
  activity: null,
  tags: [],
};
try {
  const { analyzeDay, synthesize } = await import("../lib/journal/pipeline");
  const guard = async () => {};
  console.log("Checking daily analysis with synthetic text...");
  const day = await analyzeDay([entry], "UTC", guard);
  console.log("Daily analysis validated.");
  const period = await synthesize(
    [day],
    entry.date,
    entry.date,
    "UTC",
    [entry],
    [],
    guard,
  );
  console.log(
    `Report validated. Summary characters: ${period.narrative.summary.length}. No journal database was changed.`,
  );
} catch (error) {
  const code = classifyProviderError(error);
  console.error(
    code,
    errorDescriptions[code] || "",
    error instanceof AnalysisError ? error.diagnostic : "",
  );
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
}
