# Mental Health Wellness · Still

A BTech final year project based on **AI Mental Health Awareness Companion**. Still combines structured journaling, time-series statistics, local narrative clustering, saved awareness reports, and optional OpenRouter explanations.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended).

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. Create an account or choose **Explore a demo workspace**. Each demo creates an isolated account with 28 clearly labeled synthetic journal entries. Real accounts start empty. SQLite is created automatically at `data/wellness.sqlite`; records survive refreshes and server restarts. This file and API keys are ignored by Git.

## OpenRouter, with no paid fallback

Add your own key in `.env.local`, then restart the server:

```dotenv
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openrouter/free
```

The key is server-only. The backend accepts `openrouter/free` or explicit `:free` model IDs and rejects paid model names. Free providers have availability and request limits; this application does not purchase credits or silently switch to paid models. There is no OpenAI API dependency. See https://openrouter.ai/docs/guides/routing/routers/free-router.

The Companion requires consent and sends only the user's question and aggregate numerical evidence to OpenRouter and its selected provider. Raw journal text and narrative keywords are excluded. Normal journaling, calculations, clustering, exports and reports require no AI key. Provider failure is shown as an error, not fabricated text.

## Local semantic embeddings

The default `EMBEDDING_MODE=lexical` provides a fast offline baseline using normalized hashed word and bigram vectors. The UI labels it accurately as word similarity.

For semantic clustering, prepare the free MiniLM model once:

```powershell
npm run embeddings:prepare
```

Then set `EMBEDDING_MODE=semantic` in `.env.local` and restart. New and edited reflections receive local 384-dimensional MiniLM vectors. Model files are cached under `data/models`; journal text stays on the server. When older lexical entries coexist, clustering deliberately uses the lexical baseline for the entire report instead of mixing incompatible vectors. To convert an existing account's entries, edit and save each entry after enabling semantic mode. Fresh accounts should enable semantic mode before the first journal entry. Demo data uses the lexical baseline for instant startup.

## PostgreSQL with pgvector

SQLite is the zero-setup development option. For the synopsis's PostgreSQL architecture, install Docker and run:

```powershell
docker compose up -d
```

Configure `.env.local` and restart:

```dotenv
DATABASE_URL=postgresql://wellness:local-wellness@localhost:5432/wellness
```

The server creates tables, indexes and the pgvector extension on first connection. PostgreSQL stores vectors natively as `vector(384)`. Switching databases uses a separate empty dataset; it does not migrate the SQLite file. Use an account export as a backup before changing storage. Docker credentials are local defaults; configure your own credentials for deployment. The database role needs permission to create the vector extension, or provision that extension as an administrator first.

## What is implemented

- Registration, login/logout, hashed passwords, hashed sessions and account isolation.
- Persistent journal create/read/edit/delete: mood, stress, energy, clarity, sleep, workload, activity, contextual tags and narrative.
- 7/30/90/365-day trends with daily aggregation and missing-data-aware variability.
- Pearson associations with minimum sample, effect-size and conservative interval checks; adjacent-week comparisons and RMSSD.
- Local lexical or MiniLM vectors, cosine similarity clusters, recurring keywords and minimum occurrence qualification.
- User-triggered, immutable reports with data snapshots and JSON export.
- OpenRouter companion with explicit consent, free-only routing and transparent configuration/provider errors.
- Account export/deletion; separate sample workspace; accessible editor, responsive navigation and a one-minute breathing interaction.

## Architecture and academic defense

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system diagram, schema, method definitions, privacy boundaries, API routes, and limitations. Read [docs/PROJECT-GUIDE.md](docs/PROJECT-GUIDE.md) for the viva/demo walkthrough, module mapping, and future evaluation plan.

## Verify and build

```powershell
npm test
npm run typecheck
npm run build
npm start
```

Tests cover independent-day aggregation, correlation qualifications, missing dates, drift, theme thresholds, input validation, account isolation, CRUD/report snapshots, export/deletion, and mocked OpenRouter transport/failure cases. Tests use a separate temporary SQLite database and never call a paid AI service. A real OpenRouter request requires your own key.

## Deployment considerations

Run as a Node server with a persistent disk for SQLite, or use PostgreSQL for a multi-instance deployment. Set `APP_ORIGIN` to your public HTTPS URL and `COOKIE_SECURE=true`. Ensure host/proxy origin handling matches your deployment. Protect the database disk/backups and restrict database network access. Replace the single-process rate limiter with a shared store if scaling horizontally. Automatic migration versioning, email verification, password recovery, a model-quality benchmark and professional accessibility/security audits are future work.

The forest images are served by Unsplash and typefaces by Google Fonts; core content remains usable with local font and color fallbacks if these are unavailable. Statistical outputs are for awareness and are not clinical diagnosis, therapy, treatment recommendations, or validated predictive classifications.
