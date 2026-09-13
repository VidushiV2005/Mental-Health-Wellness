import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { entrySchema } from "../lib/validation";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const [file, owner] = process.argv.slice(2);
if (!file || !owner)
  throw new Error("Usage: npm run journals:import -- <JSON file> <account ID>");
const input = z
  .array(z.object({ date: z.string(), content: z.string() }))
  .min(1)
  .max(365)
  .parse(JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")));
// Validate every record before changing the database. Never invent numeric ratings.
const records = input.map((r) =>
  entrySchema.parse({ date: r.date, narrative: r.content }),
);
const { query } = await import("../lib/db");
const { entries, mutateEntry } = await import("../lib/journal/store");
if (!(await query("SELECT id FROM users WHERE id = ?", [owner])).length)
  throw new Error("Account not found");
const existing = await entries(owner);
let added = 0;
for (const record of records) {
  if (
    existing.some(
      (e) => e.date === record.date && e.narrative === record.narrative,
    )
  )
    continue;
  const entry = {
    ...record,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await mutateEntry(owner, entry, null);
  existing.push(entry);
  added++;
}
console.log(
  `Imported ${added} journal entries; skipped ${records.length - added} exact duplicates. No provider calls were made.`,
);
process.exit(0);
