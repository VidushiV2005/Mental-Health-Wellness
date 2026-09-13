# BTech project guide

## Title and scope

Mental Health Wellness (interface: Still) is a journal-first AI awareness system. The revised user specification replaces the earlier aggregate-statistics chatbot design. It uses OpenRouter, not the OpenAI API. It is a software-engineering demonstration, not a validated mental-health instrument.

## Module mapping

| Responsibility                           | Implementation                                      |
| ---------------------------------------- | --------------------------------------------------- |
| Journal and account UI                   | components/workspace.tsx, components/journal-ui.tsx |
| Metrics, evidence and reports UI         | components/journal-insights.tsx                     |
| Input validation and auth                | lib/validation.ts, lib/auth.ts, API routes          |
| Additive storage / transactions          | lib/db.ts                                           |
| Normalization and evidence checks        | lib/journal/normalize.ts                            |
| Versioned rubrics and schemas            | lib/journal/prompts.ts, schema.ts                   |
| Free-only structured transport           | lib/journal/provider.ts                             |
| Daily and hierarchical period pipeline   | lib/journal/pipeline.ts                             |
| Deterministic scores / patterns          | lib/journal/statistics.ts                           |
| Consent, caches, queue and fencing       | lib/journal/store.ts                                |
| Calendar scheduler and worker entrypoint | lib/journal/scheduler.ts, scripts/journal-worker.ts |

## Demonstration

1. Show an empty account or explicitly synthetic demo. State that sample observations are not research findings.
2. Save a short paragraph without touching ratings; reload and show that numeric fields remain missing.
3. Show the timezone and separate journal-sharing/daily/weekly/monthly permissions. Explain that older aggregate consent does not authorize raw journal transmission.
4. With your own configured key and an active worker, request a range and show queued/generating/ready or an honest provider-error state. Without a key, show the not-configured state; do not claim an AI result.
5. Inspect score provenance and an exact source excerpt. Explain narrative priority, dimension-specific rating fallback and nulls.
6. Explain equal-day weighting, missing dates, contributor thresholds and why comparison may be withheld.
7. Open Patterns. Explain distinct-day counts, semantic rather than keyword extraction, plans versus experienced activities, and why non-mention is not absence.
8. Open a report, export JSON and use its print action. Edit the original journal and show the report remains a historical snapshot while live analysis becomes stale.
9. Explain the independent worker and true calendar-week/month schedule. Closing the browser does not stop server jobs.
10. Export account data and explain that historical messages are retained despite retiring Companion.

For UI-only inspection without inference, the optional synthetic preview script is documented in the README. Its outputs and model metadata explicitly say mocked. Never report mock numbers as live model performance.

## Viva questions

**What is AI responsible for?** Evidence-linked narrative interpretation and semantic extraction. Code validates structure/source references and computes the displayed descriptive quantities. Schema validation cannot prove that an interpretation is psychologically correct.

**Why not use numeric form values in the first prompt?** They can anchor narrative scoring. The system deliberately scores text first and applies numeric fallback only to dimensions with insufficient text.

**What does strength mean?** Amount/clarity of supporting text under an unvalidated rubric. It is not a calibrated probability, diagnostic confidence, or psychometric reliability estimate.

**Why do gaps remain?** An unwritten day is unknown, not evidence of neutral mood. Frequent writers also should not make a single date count more heavily.

**What distinguishes this from a chatbot?** Durable normalized daily datasets, reproducible code-based aggregations, evidence-linked reports, independent scheduled processing, consent fencing and immutable revisions. There is no active Companion conversation.

**Can it establish that walking helps mood?** No. The mentioned/not-mentioned comparison is observational, subject to selection and context, and may derive both the activity and emotional estimate from the same narrative. It is not independent evidence of causation.

**Why keep older code and vectors?** To preserve historical artifacts and prior project work. Local embeddings/Pearson/RMSSD utilities no longer drive the active UI. The shift is architectural, not a relabeling of old mood scores.

**Why use a global worker lease?** It gives a transparent, conservative concurrency bound across processes for a small academic deployment. It trades throughput for easier auditability. Higher-scale concurrency would need partitioned leases and equally strong fencing.

## Evaluation plan

Use consented, de-identified or synthetic journals with human annotations. Measure evidence-reference validity, semantic extraction precision/recall, synonym grouping quality, contradiction/negation handling, rubric agreement and repeatability across provider/model changes. Include prompt-injection, sparse-text, long-history, historical-crisis and missing-data cases.

Separately test user comprehension of AI estimates versus ratings, uncertainty and association-versus-causation. Software tests verify invariants, not clinical safety or effectiveness. A participant study needs institutional approval as applicable, explicit provider-sharing consent, minimal identifying data and a retention/deletion plan.

Known future work: a model-quality benchmark, specialist safety review, calibration research, PostgreSQL deployment testing, end-to-end encryption/retention controls, email verification/password recovery, shared web rate limiting and a formal accessibility audit. None are claimed complete.
