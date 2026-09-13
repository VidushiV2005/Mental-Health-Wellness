import { z } from "zod";
const metric = z.number().int().min(1).max(10).nullable().default(null);
export const entrySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const date = new Date(`${s}T12:00:00Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === s &&
        s <= new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10) &&
        s >= "2000-01-01"
      );
    }, "Choose a valid date between 2000 and today."),
  stress: metric,
  energy: metric,
  clarity: metric,
  valence: metric,
  sleep: z.number().min(0).max(24).nullable().default(null),
  workload: metric,
  activity: z.number().int().min(0).max(1440).nullable().default(null),
  social_connection: metric,
  motivation: metric,
  calmness: metric,
  self_compassion: metric,
  narrative: z.string().trim().max(60000),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
});
export const authSchema = z.object({
  email: z
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
  name: z.string().trim().min(1).max(60).optional(),
});
