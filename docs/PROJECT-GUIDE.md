# BTech project guide

## Title and implementation

**AI Mental Health Awareness Companion** is implemented as Mental Health Wellness, with **Still** as its interface name. The user-supplied synopsis defines the functional requirements; implementation substitutes OpenRouter for the proposed paid OpenAI API, and uses local embeddings to avoid per-entry API costs.

## Module mapping

| Synopsis layer            | Implementation                                  | Demonstration                                                             |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| Collection                | `components/workspace.tsx`, `lib/validation.ts` | Add structured values and a narrative in My journal                       |
| Storage                   | `lib/db.ts`                                     | Records persist in SQLite or PostgreSQL with vector storage               |
| Statistical engine        | `lib/analytics.ts`                              | Select a date window and inspect trend, RMSSD and correlation evidence    |
| Narrative analysis        | `lib/embeddings.ts`, `lib/analytics.ts`         | Local 384-dimensional vectors, cosine groups, recurring keywords          |
| Qualification             | `lib/analytics.ts`                              | Observe how sparse data withholds findings rather than inventing insights |
| Awareness reports         | API report routes and Reports screen            | Generate an immutable snapshot and export it                              |
| Optional interpretation   | `lib/openrouter.ts`                             | Consent to sharing numerical aggregates, ask for an explanation           |
| Security and data control | `lib/auth.ts`, API routes, Settings             | Show user isolation, export and account deletion                          |

## Eight-minute demonstration

1. Open Still and select the demo workspace. State that the 28-day history is synthetic, and illustrates system behavior rather than study results.
2. Use the mood, stress, energy and clarity chart tabs. Explain why multiple check-ins on a day are averaged and missing dates are not filled.
3. Add a new reflection with sleep, workload, activity and contextual tags. Refresh and demonstrate persistence.
4. Open Patterns. Explain Pearson r and the conservative 99% interval; show that association does not establish a cause. Inspect recurring narrative groups and their source entries.
5. Generate a report. Edit a journal entry and show that the saved report remains unchanged.
6. If configured, use the OpenRouter companion to explain the evidence. Show the consent boundary and that raw narratives are excluded from the request. If no key is configured, show the explicit unconfigured state.
7. Export the workspace. Sign out and create a personal account to show that it starts empty and cannot see the demo user's data.

## Questions to prepare for

**Why are embeddings local?** They avoid recurring API charges and avoid sending journal text to a third party. MiniLM maps text to 384 dimensions; cosine similarity compares normalized vectors. Lexical mode is explicitly a simpler baseline and cannot understand synonyms in the same way.

**Why pgvector if clustering happens in Node?** The database supports durable native vector storage. For this per-user academic dataset, bounded in-memory clustering is easier to inspect and test. A production system with large histories would use indexed candidate retrieval and a background embedding queue. The current greedy clustering is approximately quadratic in the number of narratives.

**Why not call these clinical insights?** Inputs are self-reported and not clinical assessments. There is no validated diagnostic model or labeled patient dataset. The system only describes observed patterns.

**What does confidence mean?** The 99% interval is an approximate Fisher-z interval under independence assumptions, not a probability that a personal claim is true. Repeated self-reports can be serially correlated. A stronger study should use block bootstrap intervals and preregistered analysis choices.

**What distinguishes this from a chatbot?** The numerical analysis and evidence qualification are deterministic and independent of the language model. The AI explains existing evidence; it does not compute diagnoses or invent the underlying statistics.

## Evaluation plan and limits

The included tests validate software behavior, not clinical effectiveness. A formal project evaluation should recruit consenting participants, avoid collecting unnecessary identifying data, define a retention plan, and evaluate usability and comprehension. Semantic clusters can be evaluated with a human-labeled set of anonymized or synthetic reflections using pairwise precision/recall and inter-rater agreement. Compare MiniLM against the lexical baseline. Do not present synthetic demo correlations as participant findings.

Potential extensions: proper versioned schema migrations, paginated histories, background re-embedding, configurable retention, shared rate limiting, email verification/password reset, participant study, encrypted storage, and bootstrap analysis that accounts for serial dependence. These are not claimed as completed features.
