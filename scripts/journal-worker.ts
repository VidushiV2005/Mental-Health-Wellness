import { existsSync } from "node:fs";
// Server-only process. Never load secrets into the browser or print provider payloads.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { schedule } = await import("../lib/journal/scheduler");
const { runOne } = await import("../lib/journal/pipeline");
const once = process.argv.includes("--once");
console.log(
  `Journal worker started (${once ? "one job" : "continuous"}). OpenRouter first; Gemini fallback.`,
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
    if (job)
      console.log(
        `Journal job ${job.id}: ${job.status}${"error" in job && job.error ? ` (${job.error})` : ""}`,
      );
    if (!job && !once) await new Promise((r) => setTimeout(r, 5000));
  } catch (error) {
    console.error(
      "Worker iteration failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    if (!once) await new Promise((r) => setTimeout(r, 5000));
  }
} while (!once && !stopping);
