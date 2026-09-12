import type { Entry } from "./types";
import { randomUUID } from "node:crypto";
import { lexicalEmbedding } from "./embeddings";
export function demoEntries(): Entry[] {
  const stories = [
    [
      "A walk outside",
      "A walk through the park helped me slow down. The fresh air and walking outside made the evening feel lighter.",
      ["Outdoors", "Movement"],
    ],
    [
      "Project deadlines",
      "Project deadlines and assignments kept me busy. Studying for the exam alongside the project took a lot of focus.",
      ["Studies", "Deadlines"],
    ],
    [
      "Time with friends",
      "Spent time with friends over dinner. Talking with friends and sharing stories helped me feel connected.",
      ["Friends", "Connection"],
    ],
  ] as const;
  return Array.from({ length: 28 }, (_, i) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (28 - i));
    const sleep = Math.round((5.5 + ((i * 7) % 11) / 4) * 10) / 10;
    const stress = Math.max(
      1,
      Math.min(10, Math.round(13 - sleep + Math.sin(i) * 0.8 - i / 28)),
    );
    const mood = Math.max(1, Math.min(10, Math.round(sleep - 0.7 + i / 30)));
    const story = stories[i % stories.length];
    const narrative = story[1];
    return {
      id: randomUUID(),
      date: date.toISOString().slice(0, 10),
      stress,
      energy: Math.round(sleep),
      clarity: Math.max(1, mood - 1),
      valence: mood,
      sleep,
      workload: Math.min(10, stress + 1),
      activity: 10 + mood * 5,
      narrative,
      tags: [...story[2]],
      createdAt: date.toISOString(),
      embedding: lexicalEmbedding(narrative),
      embeddingMethod: "lexical-v1",
    };
  });
}
