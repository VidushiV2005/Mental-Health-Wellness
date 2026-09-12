import { embed } from "../lib/embeddings";
console.log(
  "Preparing the local MiniLM model. Only model files are downloaded.",
);
const result = await embed("Preparing local narrative embeddings.", "semantic");
console.log(
  `${result.method}: ${result.vector.length} dimensions. Set EMBEDDING_MODE=semantic in .env.local and restart the app.`,
);
