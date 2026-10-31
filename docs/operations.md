# Operations, privacy, and recovery

## Deployment

Target the Next.js framework on Vercel with Node 22.x. Install with `pnpm install --frozen-lockfile` and build with `pnpm build`. Configure `.env.example` variables in the correct Vercel environment, with a separate production `BETTER_AUTH_SECRET` and canonical HTTPS `BETTER_AUTH_URL`. Attach an independent Neon database and a **private** Blob store. Run `pnpm db:migrate` against the intended database before release; additive migrations are tracked in `steady_migrations`.

Do not overwrite development credentials with production values. Local development uses an isolated `steady_dev` database. Blob namespaces begin `steady/development/`, `steady/preview/`, or `steady/production/`. Public model and fictional-media files are reproducible application resources, not private storage. Keep the production domain public for judging while preview deployments remain protected.

`vercel.json` schedules `/api/cron/cleanup` daily at 03:17 UTC. Configure `CRON_SECRET`; the route checks its bearer token. Inspect Workflow state and sanitized logs after release. Logs contain internal job IDs and stable categories, never credentials, signed image URLs, raw model responses, selected images, or voice transcripts.

The verified production studio is [steady-taupe-pi.vercel.app](https://steady-taupe-pi.vercel.app), running Node 22.x with migrations001–003 applied. The [release record](release-checklist.md) identifies the application commit and `READY` deployment. Public entry/configuration requests returned 200 and unauthenticated session/cleanup requests returned 401. The scheduled cleanup is configured; the deployment smoke checked its authorization boundary rather than running a scheduled deletion cycle.

A production preview completed once through the deployed Workflow and retained its provider task, Workflow run ID, and private Blob output. The deployed Gemini helper also completed. Release logs showed the PostgreSQL driver's SSL-mode forward-compatibility warning for `sslmode=require`, with no corresponding request failures. Review explicit TLS-mode configuration before a driver upgrade; no TLS behavior was changed for this release.

## Provider access and budgets

`YOUCAM_LIVE_ENABLED=false` prevents fresh paid preview tasks while the sample and manual studio remain usable. Enable deliberately after an integration check. The adapter uses `YOUCAM_API_KEY` and the Makeup VTO endpoint on `YOUCAM_API_BASE_URL`; provider credentials remain server-side.

Default application guards are 16 new jobs per database day globally, 4 per anonymous owner, and 8 per hashed IP per day. `YOUCAM_SESSION_JOB_LIMIT` names the anonymous-owner allowance, not a newly opened studio: creating or deleting a studio cannot reset it. Zero is a valid configured limit. Reservations remain spent/reserved after an ambiguous submit; a known failure before submission can release one. A global request limiter allows 80 provider requests per five-minute window for STEADY. These are configurable abuse safeguards, not provider pricing promises.

The account API reported one YouCam unit per Makeup VTO result on October 31, 2026. A read-only balance check after production verification confirmed 1,028 units remaining; this is a release-time snapshot, not a live balance. Record live calls in the private execution ledger. A comparison can request multiple methods, so check its candidate count. Never repeat a paid POST to recover an uncertain result.

Inspect the adapter smoke's dry run before submitting:

```sh
NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/smoke-youcam.ts
NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/smoke-youcam.ts --confirm-live
```

The explicit live flag is required. Evidence and outputs go under ignored `artifacts/private/`. Keep task identifiers, temporary URLs, and personal inputs out of public evidence. Public recorded outputs must use the fictional portrait and exact source/recipe hashes.

Gemini/OpenAI analysis is independent of YouCam credits and requires separate consent. Each provider has a 35-second default and 40-second maximum timeout, fitting sequential fallback into the 90-second route. Separate serialized usage buckets allow 60 selected-image requests and 360 short voice requests per owner per hour. The audit records purpose and consent version without retaining the inspiration/tool image or audio clip.

## Retention and deletion

Studios and private assets expire 30 days after creation. Saved methods use that same session lifetime. Deletion from review or access settings revokes access immediately; a durable workflow removes private objects and then database rows. The UI accurately says private deletion is queued.

Daily cleanup retries soft-deleted studios, removes expired upload intents and incoming objects, and removes unregistered normalized photos older than 24 hours. A database outage postpones compensation until ownership can be verified. Minimal independent budget reservations remain for 35 days to prevent deletion abuse; AI usage audit rows remain seven days. Provider retention follows the account's terms and settings; local deletion does not claim to erase provider-side copies.

Anonymous ownership is browser-specific. Losing cookies does not expose data to another browser, but this release has no email-based recovery. Automatic expiration still applies. Local comfort settings are separate device preferences and can be reset in access settings.

## Recovery decisions

| State                                 | Response                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Revision conflict                     | Load the latest saved state, then repeat the intended choice.                                            |
| Interrupted upload                    | Retry upload/finalization; intent ownership and idempotent finalization prevent cross-studio attachment. |
| Source, recipe, or candidate changed  | Do not attach a stale result. Request or choose a matching preview.                                      |
| Known provider task ID                | Query that task and recover its output; do not create a duplicate paid task.                             |
| `unknown_submission` without an ID    | Stop automatic submission. Inspect provider records and the private ledger before any manual decision.   |
| Preview failed or rendering paused    | Instructions remain available. Recorded samples require an exact fictional input match.                  |
| Camera/model unavailable              | Hide the guide; use text, speech, the person's own mirror, and manual checkpoints.                       |
| AI unavailable, invalid, or uncertain | Explain the limitation, preserve manual choices, and never mark physical completion.                     |
| Delete workflow failed                | Keep access revoked and retry durable erasure or authenticated cleanup.                                  |

Do not overwrite completed physical history, represent a generated preview as an applied result, or refill allowances by deleting reservations. Durable job state and the private ledger are the source of truth for provider reconciliation.
