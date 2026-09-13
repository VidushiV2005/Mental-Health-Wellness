# Worker deployment and recovery

## Local activation

Journal analysis tries OpenRouter first and falls back to Google Gemini. Set `OPENROUTER_API_KEY`, `OPENROUTER_MODEL=openrouter/free`, `GEMINI_API_KEY` and
`GEMINI_MODEL=gemini-3.6-flash` in `.env.local`. Restart both web and worker after
changing providers, then enable combined OpenRouter/Gemini sharing in Settings. Previous
OpenRouter consent does not authorize sending journals to Google.

1. Use Node 24, install dependencies with `npm install`, and configure the existing `.env.local`.
2. Run `npm run dev` for the web application.
3. In a separate terminal at the same project root, run `npm run worker`.
4. In Settings, select a timezone and explicitly enable journal sharing plus the automatic permissions you want.
5. Save a journal or request a range/report. The UI polls saved job progress, not the provider.

`npm run worker:once` performs one schedule scan and claims at most one job. It is useful for smoke checks; a single invocation is not a permanently running scheduler. The continuous worker checks for work every five seconds when idle. It loads `.env.local`; environment variables already supplied by the process take precedence.

## Exact production activation example (Linux)

This is a deployment recipe, **not a claim that it has been deployed**.

- Provision a non-root service account `still`, the checked-out project at `/srv/mental-health-wellness`, and Node 24/npm on that host.
- Run `npm ci` and `npm run build` there. The worker uses `tsx`, so do not omit development dependencies unless you separately compile/package the worker.
- Create a protected environment file `/etc/still.env` readable by the service account, with `DATABASE_URL` or an absolute `SQLITE_PATH`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.6-flash`, `APP_ORIGIN=https://your-domain`, and `COOKIE_SECURE=true`.
- Run the web service with the same environment/database and `npm start`, behind an HTTPS reverse proxy.
- Install the example below as `/etc/systemd/system/still-worker.service`, adjusting the absolute npm path and project directory for your host.

```ini
[Unit]
Description=Still journal analysis worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=still
WorkingDirectory=/srv/mental-health-wellness
EnvironmentFile=/etc/still.env
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=75

[Install]
WantedBy=multi-user.target
```

Then activate and inspect:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now still-worker
sudo systemctl status still-worker
sudo journalctl -u still-worker --since today
```

On Windows, use an equivalent service/process supervisor with this project as its working directory and `npm.cmd run worker` as the command; do not rely on a browser tab remaining open. On a managed platform, provision a continuously running background-worker service sharing the web application's database/environment. A purely serverless route deployment is not enough.

## Schedule semantics

- Weekly: the preceding complete Monday–Sunday week in the saved IANA timezone.
- Monthly: the preceding complete calendar month in that timezone.
- Each scan considers only the two most recent completed periods of each enabled kind. This bounds downtime backfill and calls.
- Existing date-only journal strings do not shift when timezone preferences change.
- Stable owner/kind/range/timezone schedule keys prevent duplicate scheduled snapshots. Scheduled failures remain visible and can be retried explicitly.
- No entries in a period means no queued provider work, not an invented empty report.
- Enabling scheduling permits analysis of these bounded recent completed periods, including journal entries written before the permission was enabled.
- Manual ranges accept 1–365 calendar days through the API. UI presets use trailing 7/30/365-day ranges; scheduled months are true calendar months, not trailing 30-day periods.

## Locking, recovery and idempotency

A global database lease limits processing to one job at a time across processes. Each claim gets a random fencing token and a three-minute lease. Guards renew it before provider calls and writes. A 90-second provider timeout is shorter than the lease.

After an interrupted process, an expired running job is reclaimed with a fresh token. Three interrupted claims exhaust automatic recovery; the job becomes failed for explicit retry. Transient rate-limit/provider errors may requeue the job with a bounded delay/attempt count. Permanent setup, authorization, schema/evidence/context errors remain actionable failures.

Repeated active manual report requests return the same job. A request after successful completion receives a new job/report ID and reruns period synthesis. Completed valid day caches are reused. Partial day chunks are not cached independently; if a long day fails mid-way, retry processes that day again.

Journal edits fence in-flight results and requeue existing requested ranges at the new revision. Consent changes cancel pending work. Before every retry and final database write, the worker verifies ownership, current consent/automatic scope, data revision and lease. A late response cannot recreate a deleted account or overwrite an edited journal's current analysis.

## Operational checks

- `npm run ai:check` tests the actual daily-analysis and report pipeline using a short invented journal. It loads `.env.local`, makes real provider requests in priority order (using quota), and does not read or write the journal database. Success ends with `Report validated`. It prints only response metadata and sanitized errors.
- Gemini receives a structural JSON schema; size and numeric bounds are enforced by the original local schema before saving. Sending every nested bound was rejected by Gemini in live testing. A synthetic daily-analysis and report check passed with `gemini-3.6-flash` on 2026-09-13.
- Restart the worker after code changes; `tsx` does not hot-reload this command. The updated worker prints `OpenRouter first; Gemini fallback` on startup and includes error codes on failed-job lines.
- Requests use a small reasoning budget to reserve output space for the JSON answer. Token-limit failures retry with a larger completion allowance. Models may differ in how they honor reasoning budgets; incomplete answers remain rejected.
- `AI_QUOTA_EXCEEDED`: Google reports an exhausted daily Gemini quota. No automatic retry is queued for this error. Wait for quota reset, or configure a key with available quota and restart web and worker, then explicitly retry the failed job. Quota limits belong to the Google project.
- `AI_OUTPUT_INCOMPLETE`: the model did not finish its answer. Safe diagnostics include token counts when available; no reasoning text is logged.
- `GET /api/health` verifies database access, not worker liveness or provider capability.
- Queued indefinitely: verify the worker is running against the same DB/path and has file/network permissions.
- `AI_NOT_CONFIGURED`: set the server key and restart both processes.
- `AI_MODEL_INVALID`: set `GEMINI_MODEL=gemini-3.6-flash` or another supported Gemini model ID.
- `AI_STRUCTURED_UNAVAILABLE`: Gemini rejected the request or model; check the configured model and structured-output support.
- `AI_RATE_LIMIT`: wait for Gemini capacity or retry later.
- `AI_TIMEOUT` / `AI_NETWORK_ERROR`: temporary transport failures are retried automatically within the job attempt limit.
- `AI_JSON_INVALID` / `AI_SCHEMA_INVALID`: malformed JSON or incorrect required fields. Schema diagnostics contain fixed field names and issue codes only; no journal or response values. Subsequent attempts receive safe schema correction hints; local validation remains required. Evidence/coverage failures remain rejected. Existing `AI_RESPONSE_INVALID` records were produced by the older generic handler; retry with the updated worker for a specific error.
- Context/reduction errors: nothing was silently dropped; very large or verbose outputs exceeded safe bounds.

Logs include job IDs, statuses and sanitized error codes, not journal text, provider response bodies or keys. Do not add raw payload logging for troubleshooting. Database snapshots contain sensitive journal content: restrict access, encrypt backups and define retention. For a consistent SQLite backup, stop web and worker cleanly before copying the data directory, or use a supported SQLite online-backup mechanism. Never copy a live WAL database as an isolated .sqlite file and assume the copy is complete.
