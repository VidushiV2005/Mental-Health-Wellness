# Verification record

Journal-first revision checked locally on Windows, Node 24 and Next.js 16.3.5, September 13, 2026.

## Automated checks

- 35 tests cover existing legacy statistical behavior plus the new input/null contract, normalization, long text/period hierarchy, chronological coverage, provenance and fallback, deterministic score/pattern rules, timezone/DST boundaries, additive migration preservation, transactional rollback, owner isolation, report revisions, cache reuse/invalidation, account deletion, consent revocation, stale-worker fencing, exclusive claims/recovery, scheduling deduplication, and free structured-provider transport/error handling.
- Tests use temporary SQLite databases, synthetic content and mocked inference. No paid model or real provider request is needed.
- TypeScript strict checking and Next production build passed during implementation; run the commands below after any subsequent edits.
- Formatting is checked with the repository's Prettier command.

```powershell
npm test
npm run typecheck
npm run format:check
npm run build
```

## Browser checks

- Existing account/session flow and a new synthetic demo remained usable after restarting the development server for the additive schema.
- Paragraph-first save succeeded with every optional numeric field left blank; the saved journal displayed each as not supplied.
- Overview consent-needed, persisted queued state, explicit AI_NOT_CONFIGURED failure, and populated ready state were inspected. Settings shows separate sharing, daily, weekly and monthly permissions.
- The one-shot worker command completed successfully against the local database.
- A separate account named Synthetic QA contains an explicitly mocked report to inspect metrics, gaps, evidence, pattern counts, shared report layout and export/print controls without provider transmission.
- Mobile journal and overview/navigation were checked at 390 × 844. Document content width measured 375 pixels within the 390-pixel viewport; no page-level horizontal overflow. The temporary viewport override was reset.
- Report detail and desktop layout were visually inspected. Print-specific CSS and JSON actions are implemented; a physical print or generated PDF has not been independently validated.
- Synthetic test accounts/records are local QA fixtures, not participant data or live model results.

## Unverified / not deployed

- Live OpenRouter inference: not verified; requires the user's own key and an available free structured-output endpoint.
- PostgreSQL: additive SQL and transaction adapter are implemented, but no PostgreSQL service was available for an integration run. The exercised adapter is SQLite.
- Production worker: runnable continuous/one-shot commands and deployment instructions are included, but no production service has been activated.
- Public deployment, clinical validity, model interpretive accuracy and a formal security/accessibility audit are not claimed.
- Free routes can fail or return invalid/incomplete output. Exact-quote and schema validation reduce fabrication risk but cannot certify the semantic interpretation.
- Very large/verbose histories can exceed safe hierarchy/output limits and fail explicitly. Completed day caches persist; incomplete day chunks are recomputed on retry.
- Web rate limiting is per process. Multi-replica deployment needs a shared limiter and further operational review.

## Provider failure fix

Numerical-prose rejection no longer aborts an otherwise valid response. The pipeline withholds the affected prose fields, removes unsupported optional suggestions, records a withholding count in provider metadata, and reruns all validation. Evidence, coverage, metric values and deterministic statistics remain validated. A regression test verifies completion with unsupported numerical prose while preserving exact evidence and metric fields. Suite: 37 passing tests.

The prose validator now permits supplied source dates and exact numeric journal phrases, while rejecting unsupported digits and calculated statistics in prose. Rejected prose receives a safe corrective instruction on the provider's next attempt. Regression suite: 36 tests passed, with type checking and production build also passing. Existing failed jobs are unchanged until explicitly retried.

Timeouts, interrupted connections, malformed JSON and schema mismatches now receive distinct codes. Temporary transport failures requeue automatically; schema diagnostics expose only fixed field names/issue codes. The full 35-test suite, strict type check and production build passed. A live retry of the user's failed report was not performed because automatic approval review rejected transmitting its private journal payload without specific confirmation. Restart an existing worker so it loads the corrected implementation.
