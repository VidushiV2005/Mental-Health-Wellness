import { z } from "zod";
import { hash, withholdNumericalProse } from "./normalize";
import { SYSTEM } from "./prompts";
import { VERSION, type ProviderMeta } from "./schema";
import { AnalysisError, classifyProviderError } from "./errors";
export type Guard = () => Promise<void>;
export type Provider = <T>(
  schema: z.ZodType<T>,
  prompt: string,
  input: unknown,
  guard: Guard,
  validate: (value: T) => void,
) => Promise<{ data: T; meta: ProviderMeta }>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function upstreamCode(status: number, message: unknown): string {
  if (
    typeof message === "string" &&
    /API key not valid|API_KEY_INVALID/i.test(message)
  )
    return "AI_AUTH_ERROR";
  if (status === 401 || status === 403) return "AI_AUTH_ERROR";
  if (status === 400 || status === 404) return "AI_STRUCTURED_UNAVAILABLE";
  if (status === 429) {
    // Inspect the provider's label, but only persist our fixed error code.
    return typeof message === "string" && /per.?day|perday/i.test(message)
      ? "AI_QUOTA_EXCEEDED"
      : "AI_RATE_LIMIT";
  }
  return "AI_PROVIDER_ERROR";
}
const geminiProvider: Provider = async (
  schema,
  prompt,
  input,
  guard,
  validate,
) => {
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new Error("AI_MODEL_INVALID");
  if (!process.env.GEMINI_API_KEY?.trim()) throw new Error("AI_NOT_CONFIGURED");
  // Gemini rejects this deeply nested schema with all size/range constraints.
  // Send the structural contract; the original Zod schema below still enforces
  // every bound before any output can be accepted or saved.
  const transportOmissions = new Set([
    "$schema",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
  ]);
  const jsonSchema = JSON.parse(
    JSON.stringify(z.toJSONSchema(schema), (key, value) =>
      transportOmissions.has(key) ? undefined : value,
    ),
  );
  let failure = "AI_PROVIDER_ERROR";
  let diagnostic = "";
  let maxTokens = 10000;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(500 * 2 ** attempt);
    await guard(); // Consent, ownership, data revision and lease are checked before EVERY retry.
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(90000),
          headers: {
            "x-goog-api-key": process.env.GEMINI_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
              responseJsonSchema: jsonSchema,
              thinkingConfig: model.startsWith("gemini-2.5-")
                ? { thinkingBudget: 1024, includeThoughts: false }
                : { thinkingLevel: "low", includeThoughts: false },
            },
            systemInstruction: {
              parts: [
                {
                  text: `${SYSTEM}\n${prompt}\nBe concise: use short summaries and explanations, only relevant events and observations, and short exact evidence excerpts. Schema array limits are ceilings, not targets.${attempt && diagnostic ? `\nThe previous attempt failed validation: ${diagnostic}. Return a complete object matching the schema; use null/empty arrays for unsupported fields. Do not omit required fields.` : ""}`,
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: JSON.stringify({
                      type: "untrusted_journal_data",
                      data: input,
                    }),
                  },
                ],
              },
            ],
          }),
        },
      );
      await guard();
      if (!response.ok) {
        const envelope = await response.json().catch(() => null);
        throw new Error(
          upstreamCode(response.status, envelope?.error?.message),
        );
      }
      const raw = await response.json();
      if (!raw || typeof raw !== "object")
        throw new AnalysisError(
          "AI_JSON_INVALID",
          "Expected a response object.",
        );
      // Providers can return an error envelope with HTTP 200 after generation starts.
      const upstreamError = raw.error;
      if (upstreamError) {
        const status = Number(upstreamError.code);
        throw new Error(upstreamCode(status, upstreamError.message));
      }
      const candidate = raw.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (raw.promptFeedback?.blockReason)
        throw new Error("AI_CONTENT_FILTERED");
      if (finishReason !== "STOP") {
        if (
          [
            "SAFETY",
            "RECITATION",
            "BLOCKLIST",
            "PROHIBITED_CONTENT",
            "SPII",
          ].includes(finishReason)
        )
          throw new Error("AI_CONTENT_FILTERED");
        if (finishReason === "MAX_TOKENS") maxTokens = 16000;
        const completion = raw.usageMetadata?.candidatesTokenCount;
        const reasoning = raw.usageMetadata?.thoughtsTokenCount;
        // Only fixed labels and numeric counts are retained, never response text.
        const detail = [
          finishReason === "MAX_TOKENS"
            ? "Output token limit reached"
            : "No completed answer received",
          typeof completion === "number" && Number.isFinite(completion)
            ? `completion tokens: ${completion}`
            : "",
          typeof reasoning === "number" && Number.isFinite(reasoning)
            ? `reasoning tokens: ${reasoning}`
            : "",
        ]
          .filter(Boolean)
          .join("; ");
        throw new AnalysisError("AI_OUTPUT_INCOMPLETE", detail);
      }
      if (typeof raw.modelVersion !== "string" || !raw.modelVersion)
        throw new Error("AI_MODEL_MISSING");
      const content = Array.isArray(candidate?.content?.parts)
        ? candidate.content.parts
            .filter(
              (p: { thought?: boolean; text?: unknown }) =>
                !p.thought && typeof p.text === "string",
            )
            .map((p: { text: string }) => p.text)
            .join("")
        : "";
      if (typeof content !== "string" || !content.trim())
        throw new AnalysisError(
          "AI_JSON_INVALID",
          "Expected a nonempty JSON string.",
        );
      const parsed = schema.safeParse(JSON.parse(content));
      if (!parsed.success) {
        // Paths contain only fixed schema names and indices; never log values or unknown model keys.
        const allowed = new Set([
          "coveredSourceIds",
          "summary",
          "metrics",
          "value",
          "strength",
          "explanation",
          "evidence",
          "sourceId",
          "entryId",
          "date",
          "excerpt",
          "events",
          "kind",
          "label",
          "identity",
          "mode",
          "detail",
          "observations",
          "title",
          "experiment",
          "safety",
          "immediateDanger",
          "message",
          "limitations",
          "valence",
          "stress",
          "energy",
          "clarity",
          "social_connection",
          "motivation",
          "calmness",
          "self_compassion",
        ]);
        const issues = parsed.error.issues
          .slice(0, 5)
          .map((issue) => {
            const path =
              issue.path
                .map((p) =>
                  typeof p === "number"
                    ? String(p)
                    : allowed.has(String(p))
                      ? String(p)
                      : "field",
                )
                .join(".") || "response";
            return `${path}: ${issue.code}`;
          })
          .join("; ");
        throw new AnalysisError("AI_SCHEMA_INVALID", issues);
      }
      // Always validate exact source references and coverage before withholding prose.
      // The caller's validator supplies the authoritative source pool. Its numerical
      // rejection alone is recoverable; other validation failures still reject the response.
      let result = parsed.data;
      let withheldProseFields = 0;
      try {
        validate(result);
      } catch (error) {
        if (
          !(error instanceof AnalysisError) ||
          error.message !== "AI_PROSE_NUMBERS"
        )
          throw error;
        // Remove only the rejected numerical prose; leave every evidence/metric field intact.
        const sanitized = withholdNumericalProse(
          result,
          [],
          (result as { coveredSourceIds?: string[] }).coveredSourceIds || [],
        );
        result = schema.parse(sanitized.data);
        withheldProseFields = sanitized.withheld;
        validate(result);
      }
      await guard();
      return {
        data: result,
        meta: {
          requestedModel: model,
          returnedModel: raw.modelVersion,
          at: new Date().toISOString(),
          promptVersion: VERSION,
          schemaVersion: VERSION,
          inputHash: hash(input),
          withheldProseFields,
        },
      };
    } catch (error) {
      const code = classifyProviderError(error);
      if (
        [
          "JOB_CANCELLED",
          "AI_AUTH_ERROR",
          "AI_STRUCTURED_UNAVAILABLE",
          "AI_CONTENT_FILTERED",
          "AI_RATE_LIMIT",
          "AI_QUOTA_EXCEEDED",
        ].includes(code)
      )
        throw error;
      failure = code;
      diagnostic = error instanceof AnalysisError ? error.diagnostic : "";
    }
  }
  throw new AnalysisError(failure, diagnostic);
};

export const provider: Provider = async (
  schema,
  prompt,
  input,
  guard,
  validate,
) => {
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    // Adapt the direct router response to the shared validator without duplicating
    // schema, evidence, consent, or numerical-prose handling.
    const model = process.env.OPENROUTER_MODEL || "openrouter/free";
    if (model !== "openrouter/free" && !model.endsWith(":free"))
      throw new Error("FREE_MODEL_REQUIRED");
    try {
      const result = await openrouterProvider(
        schema,
        prompt,
        input,
        guard,
        validate,
      );
      return result;
    } catch (error) {
      const code = classifyProviderError(error);
      if (
        code === "JOB_CANCELLED" ||
        code === "AI_CONTENT_FILTERED" ||
        !process.env.GEMINI_API_KEY?.trim()
      )
        throw error;
      console.log(`OpenRouter unavailable (${code}); trying Google Gemini.`);
      await guard();
    }
  }
  return geminiProvider(schema, prompt, input, guard, validate);
};

const openrouterProvider: Provider = async (
  schema,
  prompt,
  input,
  guard,
  validate,
) => {
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  await guard();
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 10000,
        temperature: 0.2,
        reasoning: { max_tokens: 1024, exclude: true },
        provider: {
          require_parameters: true,
          max_price: { prompt: 0, completion: 0 },
        },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "still_journal",
            strict: true,
            schema: z.toJSONSchema(schema),
          },
        },
        messages: [
          {
            role: "system",
            content: `${SYSTEM}\n${prompt}\nReturn concise complete JSON. Array limits are ceilings, not targets.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              type: "untrusted_journal_data",
              data: input,
            }),
          },
        ],
      }),
    },
  );
  await guard();
  const raw = await response.json();
  if (!response.ok || raw.error)
    throw new Error(
      upstreamCode(raw.error?.code || response.status, raw.error?.message),
    );
  const choice = raw.choices?.[0];
  if (choice?.finish_reason === "content_filter")
    throw new Error("AI_CONTENT_FILTERED");
  if (choice?.finish_reason !== "stop") throw new Error("AI_OUTPUT_INCOMPLETE");
  if (!raw.model || typeof raw.model !== "string")
    throw new Error("AI_MODEL_MISSING");
  if (
    typeof choice.message?.content !== "string" ||
    !choice.message.content.trim()
  )
    throw new Error("AI_JSON_INVALID");
  const parsed = schema.safeParse(JSON.parse(choice.message.content));
  if (!parsed.success) throw new Error("AI_SCHEMA_INVALID");
  let data = parsed.data;
  let withheldProseFields = 0;
  try {
    validate(data);
  } catch (error) {
    if (
      !(error instanceof AnalysisError) ||
      error.message !== "AI_PROSE_NUMBERS"
    )
      throw error;
    const sanitized = withholdNumericalProse(
      data,
      [],
      (data as { coveredSourceIds?: string[] }).coveredSourceIds || [],
    );
    data = schema.parse(sanitized.data);
    withheldProseFields = sanitized.withheld;
    validate(data);
  }
  await guard();
  return {
    data,
    meta: {
      requestedModel: model,
      returnedModel: raw.model,
      at: new Date().toISOString(),
      promptVersion: VERSION,
      schemaVersion: VERSION,
      inputHash: hash(input),
      withheldProseFields,
    },
  };
};
