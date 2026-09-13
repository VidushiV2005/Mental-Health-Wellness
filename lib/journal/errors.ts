export class AnalysisError extends Error {
  constructor(
    code: string,
    public readonly diagnostic: string,
  ) {
    super(code);
    this.name = "AnalysisError";
  }
}
export function classifyProviderError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError")
      return "AI_TIMEOUT";
    if (error instanceof SyntaxError) return "AI_JSON_INVALID";
    if (error instanceof TypeError) return "AI_NETWORK_ERROR";
    if (/^(AI_[A-Z_]+|JOB_CANCELLED)$/.test(error.message))
      return error.message;
  }
  return "AI_PROVIDER_ERROR";
}
export const transientErrors = [
  "AI_RATE_LIMIT",
  "AI_PROVIDER_ERROR",
  "AI_TIMEOUT",
  "AI_NETWORK_ERROR",
];
export const errorDescriptions: Record<string, string> = {
  AI_NOT_CONFIGURED:
    "Add your Google AI Studio key to GEMINI_API_KEY in .env.local, then restart web and worker.",
  AI_MODEL_INVALID:
    "GEMINI_MODEL must be a Gemini model ID such as gemini-3.6-flash.",
  AI_AUTH_ERROR:
    "Google Gemini rejected the API key. Check the server key and restart the worker.",
  AI_STRUCTURED_UNAVAILABLE:
    "Gemini rejected the request or model. Check GEMINI_MODEL and structured-output support.",
  AI_RATE_LIMIT: "Gemini capacity is temporarily rate limited.",
  AI_QUOTA_EXCEEDED:
    "Your Gemini daily quota is exhausted. Retry after your quota resets, or configure a key with available quota and restart both processes.",
  AI_PROVIDER_ERROR: "The provider could not complete the request.",
  AI_CONTENT_FILTERED: "The provider declined to generate this response.",
  AI_PROSE_NUMBERS:
    "The provider included unsupported numbers or statistics in its reflection. Retry will request qualitative wording.",
  AI_TIMEOUT: "Gemini took too long to complete its response.",
  AI_NETWORK_ERROR: "The connection to Google Gemini was interrupted.",
  AI_JSON_INVALID: "The provider returned unreadable JSON.",
  AI_SCHEMA_INVALID: "The provider response did not match the required fields.",
  AI_OUTPUT_INCOMPLETE: "The provider stopped before completing its response.",
  AI_RESPONSE_INVALID:
    "An older worker recorded a generic response error. Retry for detailed diagnostics.",
};
