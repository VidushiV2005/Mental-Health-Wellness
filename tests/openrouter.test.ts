import test from "node:test";
import assert from "node:assert/strict";
import { explain, explanationPayload } from "../lib/openrouter";
import { analyze } from "../lib/analytics";

test("OpenRouter request uses free model, server auth, bounded output, and no raw journal data", async () => {
  const data = analyze([
    {
      id: "test",
      date: "2026-01-01",
      stress: 4,
      energy: 5,
      clarity: 6,
      valence: 7,
      sleep: 8,
      workload: 5,
      activity: 20,
      narrative: "PRIVATE JOURNAL NEVER TRANSMIT",
      tags: ["private-tag"],
      createdAt: "2026-01-01T12:00:00Z",
    },
  ]);
  assert.ok(!JSON.stringify(explanationPayload(data)).includes("PRIVATE"));
  const previous = global.fetch;
  process.env.OPENROUTER_API_KEY = "test-key-not-real";
  process.env.OPENROUTER_MODEL = "openrouter/free";
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      const request = JSON.parse(String(options?.body));
      assert.equal(request.model, "openrouter/free");
      assert.equal(request.max_tokens, 650);
      assert.ok(!JSON.stringify(request).includes("PRIVATE JOURNAL"));
      assert.ok(!JSON.stringify(request).includes("private-tag"));
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: "There is not enough evidence yet." } },
          ],
        }),
        { status: 200 },
      );
    };
    assert.equal(
      await explain("What can I learn?", data),
      "There is not enough evidence yet.",
    );
    process.env.OPENROUTER_MODEL = "paid-model";
    await assert.rejects(() => explain("test", data), /FREE_MODEL_REQUIRED/);
    process.env.OPENROUTER_MODEL = "openrouter/free";
    global.fetch = async () => new Response("{}", { status: 429 });
    await assert.rejects(() => explain("test", data), /AI_RATE_LIMIT/);
    global.fetch = async () => new Response("{}", { status: 200 });
    await assert.rejects(() => explain("test", data), /AI_PROVIDER_ERROR/);
  } finally {
    global.fetch = previous;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  }
});
