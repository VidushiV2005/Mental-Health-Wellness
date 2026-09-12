const DIM = 384;
const stops = new Set(
  "a an the and or to of in is it my i me with was for at on that this but felt feel today really very have had be been am are as so after before from some more about just not went did doing helped made alongside down lot took kept spent time got things something everything".split(
    " ",
  ),
);
export function words(text: string) {
  return (
    text
      .toLowerCase()
      .match(/[a-z]{3,}/g)
      ?.filter((x) => !stops.has(x)) || []
  );
}
export function lexicalEmbedding(text: string) {
  const tokens = words(text);
  const vector = Array<number>(DIM).fill(0);
  const features = [
    ...tokens,
    ...tokens.slice(1).map((word, i) => `${tokens[i]}_${word}`),
  ];
  for (const word of features) {
    let hash = 2166136261;
    for (const char of word)
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    vector[(hash >>> 0) % DIM] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((x) => x / norm);
}
export function cosine(a: number[], b: number[]) {
  return a.length === b.length ? a.reduce((sum, x, i) => sum + x * b[i], 0) : 0;
}
// The process caches the local model; no journal content is sent to a model host.
let extractor: Promise<unknown> | undefined;
export async function embed(
  text: string,
  mode = process.env.EMBEDDING_MODE || "lexical",
): Promise<{ vector: number[]; method: string }> {
  if (mode !== "semantic")
    return { vector: lexicalEmbedding(text), method: "lexical-v1" };
  extractor ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = `${process.cwd()}/data/models`;
    return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      dtype: "q8",
    });
  })().catch((error) => {
    extractor = undefined;
    throw error;
  });
  const model = (await extractor) as (
    input: string,
    options: Record<string, unknown>,
  ) => Promise<{ data: Float32Array }>;
  const result = await model(text, { pooling: "mean", normalize: true });
  return { vector: Array.from(result.data), method: "minilm-l6-v2-q8" };
}
