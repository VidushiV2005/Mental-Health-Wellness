import { query } from "../db";
import { CONSENT } from "./schema";
import { enqueue, preferences } from "./store";
export function localDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
export function completedPeriods(timezone: string, now = new Date()) {
  const today = localDate(timezone, now),
    weekday = new Date(`${today}T12:00:00Z`).getUTCDay(),
    monday = shift(today, -((weekday + 6) % 7));
  const first = `${today.slice(0, 7)}-01`;
  // Bounded downtime backfill: two complete weeks and two complete months.
  const weekly = [1, 2].map((n) => ({
    start: shift(monday, -7 * n),
    end: shift(monday, -7 * n + 6),
  }));
  const monthly = [1, 2].map((n) => {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - n);
    const start = d.toISOString().slice(0, 10);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return { start, end: shift(d.toISOString().slice(0, 10), -1) };
  });
  return { weekly, monthly };
}
export async function schedule(now = new Date()) {
  const users = await query(
    "SELECT user_id FROM journal_preferences WHERE consent_version = ? AND (weekly = 1 OR monthly = 1)",
    [CONSENT],
  );
  let added = 0;
  for (const user of users) {
    const userId = String(user.user_id),
      p = await preferences(userId),
      periods = completedPeriods(p.timezone, now);
    for (const kind of ["weekly", "monthly"] as const)
      if (p[kind])
        for (const range of periods[kind]) {
          // Stable schedule key intentionally omits mutable revision, avoiding duplicate historical reports.
          try {
            if (
              await enqueue(
                userId,
                kind,
                range.start,
                range.end,
                `${userId}:${kind}:${range.start}:${range.end}:${p.timezone}`,
              )
            )
              added++;
          } catch (e) {
            if (!(e instanceof Error) || e.message !== "CONSENT_REQUIRED")
              throw e;
          }
        }
  }
  return added;
}
