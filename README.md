# Mental Health Wellness · Still

A BTech final-year, journal-first awareness project. Paragraphs are the primary input; optional numeric ratings stay separate. A consent-gated Google Gemini pipeline produces daily evidence-linked reflections, descriptive estimates and immutable period reports. It is not a diagnostic or clinical service.

## Local setup

Node.js 22.13+ is required; Node 24 is recommended.

```powershell
npm install
# Only create this file if you do not already have local settings:
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Open [the local application](http://127.0.0.1:3000). Register or explore an isolated demo. Real accounts start empty; demo journals are synthetic. SQLite is created at `data/wellness.sqlite` and survives restarts. Existing entries, numeric ratings, vectors, users, reports and historical messages are preserved by the additive migration. Restart an already-running development server after this upgrade.

Journaling, account access and data export do not need AI or an embedding download. A journal save persists first and, only with automatic-daily permission, adds a durable job in the same database transaction.

## Google Gemini setup — server only

Journal analysis tries OpenRouter first when `OPENROUTER_API_KEY` is configured,
then Google Gemini if the router times out, returns unusable output, or has a
provider/auth/quota error. Router requests remain free-only. Without a router key,
Gemini runs directly. Consent cancellation and content filtering do not trigger
fallback. Enable the new combined sharing permission in Settings before analysis.

```dotenv
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openrouter/free
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.6-flash
```

Import dated JSON records without overwriting existing journals:
`npm run journals:import -- "C:\path\entries.json" "account-ID"`.
The file must contain an array of `{ "date": "YYYY-MM-DD", "content": "journal text" }`.
All rows are validated first; exact duplicates are skipped and numerical ratings
remain blank. Imported journal data stays in the ignored local database and is
not committed to GitHub.

Put your own key in the existing `.env.local` file; never use a `NEXT_PUBLIC_` prefix:

```dotenv
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.6-flash
```

Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Fallback requests go directly to `generativelanguage.googleapis.com` using the server-only key. Restart the web server and worker after configuration changes. Gemini returns structured JSON that the app validates before saving. Your Google project's quota and billing apply; the app does not enable billing; fallback uses your configured Gemini key. See [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). OpenRouter environment values select the first provider; Gemini values configure the fallback.

In **Settings**, separately choose:

- Journal-content sharing with OpenRouter, its routed provider, and Google Gemini.
- Automatic daily analysis after saving/editing a journal.
- Weekly reports for complete Monday–Sunday weeks.
- Monthly reports for complete calendar months.

After enabling priority routing, re-enable sharing in Settings and save your choices. Previous OpenRouter or aggregate-only Companion permission does **not** authorize sending journals to Google. Existing journals and reports remain saved; daily analysis is refreshed under the new pipeline version. Daily scoring receives text but not separate numeric ratings. Period synthesis receives derived daily summaries, final metrics, validated evidence and deterministic statistics. Provider privacy/retention policies apply. Revocation stops pending work and prevents late writes, but cannot recall content already transmitted.

## Start the worker

To test API configuration independently with invented text, run `npm run ai:check`.
It makes real Gemini requests using your project's quota and validates both daily analysis and
report synthesis without accessing your saved journals. `AI_QUOTA_EXCEEDED` means
the project's daily quota has run out; wait for its reset before retrying.

In a second terminal, in this same project directory:

```powershell
npm run worker
```

Keep it running independently of the browser. It schedules eligible completed periods and drains durable jobs. For one scheduling/processing iteration:

```powershell
npm run worker:once
```

A database-backed global lease bounds concurrency to one active job across worker processes. Jobs recover after lease expiry (three minutes), with bounded retries. Completed daily caches are reused. Each explicit report regeneration reruns period synthesis and produces a new immutable report revision. Empty ranges never call a provider. Scheduling backfills at most the two most recent complete weeks and months; it does not replay an unlimited history.

**A worker is required. Opening the dashboard does not call AI.** Hosting only the Next.js frontend/API is insufficient for scheduled analysis. See [worker deployment](docs/WORKER-DEPLOYMENT.md) for exact production activation steps. No production worker or public deployment has been activated by this implementation.

## What changed

- Paragraph-first journal editor, up to 60,000 characters; short entries valid.
- Eight nullable subjective dimensions with provenance, evidence strength and explanations.
- Narrative-first estimates; explicit-rating fallback only for insufficient text, never for provider failure.
- Equal observed-day weighting, unfilled gaps and contributor-aware comparisons.
- Semantic activity/person/context/stressor/coping/strength extraction, conservative grouping and source excerpts.
- Shared Overview, Patterns and report pipeline; week/month/year range controls and accessible chart data.
- Versioned consent, timezone preference, durable queues, restart recovery and scheduled reports.
- Immutable reports, JSON export, print styles, explicit report deletion, full account export/deletion.
- Companion UI removed; `/api/companion` returns HTTP 410. Historical messages remain exportable.

Local embedding utilities and older statistics are retained for legacy compatibility; they no longer drive the active dashboard or block journal saves.

## Storage and verification

SQLite is the local default. PostgreSQL/pgvector remains supported by the adapter and existing Docker Compose setup:

```powershell
docker compose up -d
```

Set `DATABASE_URL` using your own database credentials. Web and worker must use the **same** database. Switching between SQLite and PostgreSQL does not transfer records; back up before changing storage. PostgreSQL has not been integration-tested in this environment.

```powershell
npm test
npm run typecheck
npm run format:check
npm run build
npm start
```

Tests use synthetic inputs, isolated temporary SQLite databases and mocked providers. Live Gemini inference requires your Google AI Studio key; use `npm run ai:check` to verify it. The optional `npx tsx scripts/seed-journal-preview.ts` command creates a separate, explicitly synthetic local account/report for UI inspection; it makes no provider call and prints local test credentials. Do not run it on production.

## Project documentation

- [Architecture and scoring methodology](docs/ARCHITECTURE.md)
- [Worker setup, scheduling and recovery](docs/WORKER-DEPLOYMENT.md)
- [BTech demonstration and evaluation guide](docs/PROJECT-GUIDE.md)
- [Verification and known limitations](docs/VERIFICATION.md)
- [Satori attribution and adaptation boundaries](THIRD_PARTY_NOTICES.md)

Before deployment: HTTPS and secure cookies, protected database/backups, provider/privacy review, shared rate limiting for multiple web replicas, and a security/accessibility review. Current data is not end-to-end encrypted. Email verification/password recovery and clinical validation are not implemented. External login imagery/fonts have local visual fallbacks.
