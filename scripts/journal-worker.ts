import { existsSync } from "node:fs";
// Server-only process. Never load secrets into the browser or print provider payloads.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { schedule } = await import("../lib/journal/scheduler");
const { runOne } = await import("../lib/journal/pipeline");
const once = process.argv.includes("--once");
const batch = process.argv.includes("--batch");
const deadline = Date.now() + 12 * 60 * 1000;
let processed = 0;
console.log(
  `Journal worker started (${once ? "one job" : batch ? "bounded batch" : "continuous"}). OpenRouter first; Gemini fallback.`,
);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
do {
  try {
    await schedule();
    const job = await runOne();
    if (batch && !job) break;
    if (job) processed++;
    if (job)
      console.log(
        `Journal job ${job.id}: ${job.status}${"error" in job && job.error ? ` (${job.error})` : ""}`,
      );
    if (!job && !once) await new Promise((r) => setTimeout(r, 5000));
  } catch (error) {
    console.error(
      "Worker iteration failed:",
      error instanceof Error ? error.name : "UnknownError",
      error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string" &&
        /^[A-Z0-9_]{1,64}$/.test(error.code)
        ? error.code
        : "NO_SAFE_CODE",
      error instanceof Error
        ? /endpoint.*(?:not|missing|specif)/i.test(error.message)
          ? "DATABASE_ENDPOINT_MISSING"
          : /insecure|sslmode|SSL.*required/i.test(error.message)
            ? "DATABASE_SSL_REQUIRED"
            : /password authentication/i.test(error.message)
              ? "DATABASE_PASSWORD_REJECTED"
              : /SNI|server.?name/i.test(error.message)
                ? "DATABASE_SNI_REQUIRED"
                : "DETAILS_WITHHELD"
        : "DETAILS_WITHHELD",
    );
    if (once || batch) {
      process.exitCode = 1;
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
} while (
  !once &&
  !stopping &&
  (!batch || (processed < 8 && Date.now() < deadline))
);
