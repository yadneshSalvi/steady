# Operations, privacy, and recovery

## Deployment

Target the Next.js framework on Vercel with Node 22.x. Install with `pnpm install --frozen-lockfile` and build with `pnpm build`. Configure `.env.example` variables in the correct Vercel environment, with a separate production `BETTER_AUTH_SECRET` and canonical HTTPS `BETTER_AUTH_URL`. Attach an independent Neon database and a **private** Blob store. Run `pnpm db:migrate` against the intended database before release; additive migrations are tracked in `steady_migrations`.

Do not overwrite development credentials with production values. Local development uses an isolated `steady_dev` database. Blob namespaces begin `steady/development/`, `steady/preview/`, or `steady/production/`. Public model and fictional-media files are reproducible application resources, not private storage. Keep the production domain public for judging while preview deployments remain protected.

`vercel.json` schedules `/api/cron/cleanup` daily at 03:17 UTC. Configure `CRON_SECRET`; the route checks its bearer token. Inspect Workflow state and sanitized logs after release. Logs contain internal job IDs and stable categories, never credentials, signed image URLs, raw model responses, selected images, or voice transcripts.

The production studio is [steady-taupe-pi.vercel.app](https://steady-taupe-pi.vercel.app). The historical October 31 release ran Node 22.x with migrations001–003 and the application deployment recorded in [release verification](release-checklist.md). Its public entry/configuration requests returned 200 and unauthenticated session/cleanup requests returned 401. That smoke checked cleanup authorization rather than running a scheduled deletion cycle.

During the first review round, additive migration004 was applied to the production database. It adds shared balance-cache state, retry-attempt supersession, hashed-IP AI accounting, and release of confirmed pre-submission failures. That application and its subsequent session-recovery fix were deployed and verified. R2 and R3 require no new migration. The release owner records each source revision, commands, deployment, and post-deployment checks in the release record; historical smoke checks do not replace a new release gate.

In the historical deployment smoke, a production preview completed once through Workflow and retained its provider task, Workflow run ID, and private Blob output. The deployed Gemini helper also completed. Those release logs showed the PostgreSQL driver's SSL-mode forward-compatibility warning for `sslmode=require`, with no corresponding request failures. Review explicit TLS-mode configuration before a driver upgrade; this review did not change TLS behavior.

## Provider access and budgets

`YOUCAM_LIVE_ENABLED=false` prevents fresh paid preview tasks while the sample and manual studio remain usable. Enable deliberately after an integration check. The adapter uses `YOUCAM_API_KEY` and the Makeup VTO endpoint on `YOUCAM_API_BASE_URL`; provider credentials remain server-side.

The reviewed code uses these configurable defaults:

| Guard                               |   Default | Scope                                                                                |
| ----------------------------------- | --------: | ------------------------------------------------------------------------------------ |
| `YOUCAM_BALANCE_FLOOR`              | 200 units | Account-balance headroom retained before fresh work                                  |
| `YOUCAM_DAILY_JOB_LIMIT`            |   12 jobs | Application/database day                                                             |
| `YOUCAM_SESSION_JOB_LIMIT`          |    6 jobs | Anonymous owner/database day across all studios                                      |
| `YOUCAM_IP_DAILY_JOB_LIMIT`         |    8 jobs | Hashed IP/database day                                                               |
| `YOUCAM_ADAPTATION_DAILY_JOB_LIMIT` |    2 jobs | Additional ceiling per owner/day during application; also consumes the ordinary caps |

Zero is a valid configured cap. The adaptation ceiling is bounded at two even if configured higher. During application or a repair proposal, only the selected missing level is requested: one Light, Build, or Full target for the current remaining method. This supports eye changes and cream-to-powder repair without silently switching the chosen level. Initial method requests queue only the target levels that fit the available reservation/balance headroom and report deferred levels. Creating or deleting a studio cannot reset the owner allowance. A global limiter also allows 80 provider requests per five-minute window for STEADY. These are application safeguards, not provider pricing guarantees or a distributed quota shared with another application's database.

Balance reads are shared through PostgreSQL within STEADY, keyed by a credential digest that never reaches the browser. Successful reads have a five-minute cache; failed reads have a 30-second cache and authorize no paid task. Held reservations are deducted above the floor. Reservation and submission boundaries both check availability. If the floor or balance-read guard blocks work, the app says fresh previews are resting and retains recorded targets and manual controls.

A terminal failure or cancellation with neither a provider task ID nor `submission_started_at` releases its reservation and can be superseded by an explicit fresh attempt for the same recipe. A known provider task is resumed without a new paid submission. Once a POST may have happened, the reservation remains consumed/held and `unknown_submission` blocks automatic resubmission. Studio deletion does not delete the independent ledger.

R3 reconciles target ownership inside the studio transaction. A live job belonging only to a discarded proposal is marked `target_orphaned`; a job still bound to an accepted or shared exact target remains active. Only a demonstrably unsubmitted orphan releases its reservation. An explicit request for that exact owner/source/recipe can resume an orphan with a known provider task ID without another paid POST. An uncertain submission stays blocked, and explicit user cancellation or a definitive paid failure is not silently revived. Stale poll responses cannot overwrite a newer studio revision or a different studio.

The account API reported one YouCam unit per successful Makeup VTO result on October 31, 2026. The earlier production-release check observed 1,028 units. In the first review round, 18 cheek ladder and four eye outputs used **22 observed units**, with balance **1,006→984**. One initial eye-shadow request using unsupported `Shadow1color1` definitively failed and was uncharged; the corrected official label `1color1` produced that round's shadow outputs. R2 used **10 observed units**, **962→952**, on November 1 UTC: six compact blush passes, two revised warm-shadow targets, and two successful but too-subtle eye trials that were not adopted. All ten requests completed once. The R2 public catalog contained 39 successful outputs. These are dated observations, not a live balance or a reason to retry an ambiguous POST. R2 had no additional paid production smoke.

R3 used **four observed units**, **952→948**, for two separately ledgered eye pairs. The first pair passed signal guards but missed the stronger target's visual/color-difference goal; it remains private. The adopted deeper warm pair adds two public outputs, bringing the catalog to 41 while preserving all 39 historical PNGs and four manifests byte-for-byte. No further paid recording or production smoke is authorized for this round. [Provenance](../public/examples/PROVENANCE.md) separates adopted and rejected batches and their exact hashes.

Inspect the adapter smoke's dry run before submitting:

```sh
NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/smoke-youcam.ts
NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/smoke-youcam.ts --confirm-live
```

The explicit live flag is required. Evidence and outputs go under ignored `artifacts/private/`. Keep task identifiers, temporary URLs, and personal inputs out of public evidence. Public recorded outputs must use the fictional portrait and exact source/recipe hashes.

`scripts/record-ladders.ts` and `scripts/record-eyes.ts` are explicit operator recording tools. Their default dry runs make no provider request; `--confirm-live` authorizes new work and `--publish-synthetic` publishes already verified successful bytes. They call the provider outside the web-job reservation flow, so inspect their planned recipes and account budget first. Preserve the nine original recipe-revision-two records; do not regenerate or relabel them as revision-three ladder targets. A failed or uncertain recording plan needs reconciliation rather than a blind rerun.

The R2 operators are `scripts/record-round2.ts` and `scripts/record-round2-eyes.ts`. Run them with `NODE_OPTIONS=--conditions=react-server`; an unflagged invocation only prepares or inspects the fixed plan. A live run additionally requires `--confirm-live` and exact `--jobs=...` IDs. Each recorder owns a separate immutable ledger, persists submission intent before POST, resumes known task IDs, and refuses ambiguous or failed attempts. `scripts/publish-round2.ts` is an offline verifier/publisher with no provider access and refuses changed existing publication bytes. The older eye recorder retains the frozen R1 recipe builder so recipe evolution cannot relabel its historical ledger.

R3 follows the same bounded protocol with `scripts/record-round3-eyes.ts` and `scripts/record-round3-eyes-deeper.ts`, separate immutable ledgers, and exact requested job IDs. Use `NODE_OPTIONS=--conditions=react-server`; unflagged runs make no provider request. `scripts/publish-round3.ts` verifies and publishes existing approved bytes offline. Historical recipe builders remain available for old recordings and saved sessions; current defaults do not relabel them.

Gemini/OpenAI analysis is independent of YouCam credits and requires separate consent. Each provider has a 35-second default and 40-second maximum timeout, fitting sequential fallback into the 90-second route. Request attempts are reserved transactionally in rolling one-hour buckets:

| Category                | App | Anonymous owner | Hashed IP |
| ----------------------- | --: | --------------: | --------: |
| Selected-image analysis | 120 |              60 |        30 |
| Short voice commands    | 720 |             360 |       180 |

The corresponding variables are `AI_HOURLY_REQUEST_LIMIT`, `AI_OWNER_HOURLY_REQUEST_LIMIT`, `AI_IP_HOURLY_REQUEST_LIMIT`, and the equivalent `VOICE_` variables in `.env.example`. A rejected/missing same-origin or consent check cannot authorize a provider call. Limits count logical request attempts, including provider failures, rather than tokens or dollar spend. Audit rows record category/purpose, consent version, owner, and hashed IP without storing the inspiration/tool image or audio clip.

The Facial Color Tones Analyzer is deferred. Its checked operation costs 20 units and the [documented output](https://docs.makeupar.com/reference/ai_skin_tone_analysis) contains color values without an undertone field. No tone task was added to this round, and no automatic undertone or shade-suitability claim is made.

## Retention and deletion

Studios and private assets expire 30 days after creation. Saved methods use that same session lifetime. Deletion from review or access settings revokes access immediately; a durable workflow removes private objects and then database rows. The UI accurately says private deletion is queued.

Daily cleanup retries soft-deleted studios, removes expired upload intents and incoming objects, and removes unregistered normalized photos older than 24 hours. A database outage postpones compensation until ownership can be verified. Minimal independent budget reservations remain for 35 days to prevent deletion abuse; AI usage audit rows remain seven days. Provider retention follows the account's terms and settings; local deletion does not claim to erase provider-side copies.

Anonymous ownership is browser-specific. Losing cookies does not expose data to another browser, but this release has no email-based recovery. Automatic expiration still applies. Local comfort settings are separate device preferences and can be reset in access settings.

Ordinary camera frames, per-region application baselines, captured checkpoint images, landmarks, and heatmaps remain in browser memory. A tab marker records only that a baseline was captured. Measuring a step saves scalar measurement values, target identity/level, provenance, timing, geometry version, and the reported-pass flag. Simulated R2/R3 observations also bind the exact public checkpoint SHA-256. Reload/cache eviction can remove local images while preserving those numbers. A sample review can recompute only its matching public checkpoint and geometry; historical cheek scalars are preserved without a new-geometry heatmap. A personal review cannot reconstruct an actual capture from the virtual preview. **Done with this step** is a separate user confirmation and does not require or invent a measurement.

Uploading a checkpoint still for an optional AI second opinion is a separate action with explicit consent and the private-asset retention policy above. Planning-source and final photos are also explicitly selected uploads; they are not the automatic in-memory application baseline. Restart a lost baseline only when the user confirms that the area remains clear of newly applied product. A pose or lighting mismatch should return to the original capture conditions or use personal judgment, not silently reset earlier progress.

## Recovery decisions

| State                                 | Response                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Revision conflict                     | Load the latest saved state, then repeat the intended choice.                                              |
| Interrupted upload                    | Retry upload/finalization; intent ownership and idempotent finalization prevent cross-studio attachment.   |
| Source, recipe, or candidate changed  | Do not attach a stale result. Request or choose a matching preview.                                        |
| Known provider task ID                | Query that task and recover its output; do not create a duplicate paid task.                               |
| `unknown_submission` without an ID    | Stop automatic submission. Inspect provider records and the private ledger before any manual decision.     |
| Preview failed or rendering paused    | Instructions remain available. Recorded samples require an exact fictional input match.                    |
| Partial preview batch                 | Show queued/deferred target counts; choose an existing ready level or try later within the remaining caps. |
| Camera/model unavailable              | Hide the guide; use text, speech, the person's own mirror, and manual checkpoints.                         |
| Pose, eye position, or light changed  | Return to the original baseline conditions and check again; keep applied pigment in the physical history.  |
| Original local baseline unavailable   | Keep the current result or deliberately restart only an area confirmed clear of newly applied product.     |
| Target too subtle                     | Report the specific abstention and offer the user's judgment; do not invent progress.                      |
| AI unavailable, invalid, or uncertain | Explain the limitation, preserve manual choices, and never mark physical completion.                       |
| Delete workflow failed                | Keep access revoked and retry durable erasure or authenticated cleanup.                                    |

Do not overwrite completed physical history, represent a generated preview as an applied result, or refill allowances by deleting reservations. Durable job state and the private ledger are the source of truth for provider reconciliation.
