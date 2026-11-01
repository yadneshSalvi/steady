# Release verification

## Review round 2 — released and verified

R2 replaces the cheek guide with a shared smooth anatomical oval, shows a translucent uncropped heatmap with measured spatial feedback, adds compact first-pass recordings and a warmer upper-lid shadow target, and completes the selected-target generation flow for remaining eye or cheek repairs. Existing recordings, saved recipes, completed-side snapshots, and earlier scalar observations retain their identities. No database migration is required.

Application commit `88f47f29649fa8339580b460cb425fd05e63895d` deployed on November 1, 2026 UTC as `dpl_Bs3kZRMZZE7fv3JBKJ2eyUuarXMj`, reaching `READY` at [steady-taupe-pi.vercel.app](https://steady-taupe-pi.vercel.app). The immutable deployment URL is [steady-39o40drcs-yadneshsalvis-projects.vercel.app](https://steady-39o40drcs-yadneshsalvis-projects.vercel.app). Later documentation-only commits do not change this application build.

- [x] Complete local unit/invariant/PostgreSQL suite: **366/366 tests across 36 files**, with zero failures or skips, including 26 cases in a disposable local PostgreSQL schema. Remote database URLs are rejected by that test suite.
- [x] Lint with zero warnings, TypeScript, and optimized production build pass. The build contains 19 generated pages and the pinned local model/runtime assets.
- [x] All 31 historical PNGs and three original manifests remain byte-identical. The eight adopted R2 outputs have exact source/recipe/request/task/output hashes in a separately pinned manifest. Ten successful, one-attempt provider requests used exactly ten observed units, **962→952**; two too-subtle eye trials remain privately preserved and are not adopted. Canonical verification used zero additional paid YouCam submissions. A read-only account check after the canonical suite at **2026-11-01 05:50:53 UTC** confirmed 952 units.
- [x] Independent local in-app browser inspection passes at **1366×768, 1440×813, 1440×900, and 390×844**: compact hero label, full smooth cheek guide, complete padded 42%-opacity heatmap, spatial text, and no horizontal overflow. The broader-tool notice opens its proposal directly; Other changes is one click away.
- [x] Saved R2 sample history reloads the exact first-pass bitmap. Default Rose/Full shows 38% on each cheek with genuine upper lag and secondary outer/inner readings of 23/53% left and 26/51% right. New warm shadow Light measures 59% of Full. These remain labeled simulations.
- [x] Actual local thumbnail HTTP responses for the six unique Rose ladder images are 256×320 WebP, totaling 24,694 bytes versus 5,120,771 bytes for their originals. The 99.52% reduction describes those thumbnail payloads only. Full measurement originals are unchanged; compact text-only ladders contain no images.
- [x] Complete optimized browser suite: **24/24 passed in 80.675931 seconds**, one Chromium worker, zero failures, skips, flakes, or retries. The real private upload/isolation/erasure test is enabled. New cases cover four viewport sizes, actual partial-render spatial feedback and full heatmap containment, direct stalled repair, selected eye/powder target generation, polling, explicit safe retry, and preserved completed history. Automated fresh-provider calls are blocked or mocked.
- [x] Repository formatting and whitespace checks pass. Application/test source is frozen.
- [x] Pre-release source/client credential scan found zero matches across **246 text files**, including **38 client chunks**, against **27 configured values**. The deployment dry run listed 261 entries totaling 40,176,607 bytes and contained zero private files. Credentials, plans, private ledgers, captures, and execution artifacts remain excluded.
- [x] Final documentation/source/client scan found zero matches across **247 text files**, including **38 client chunks**, against **27 configured values**.
- [x] Complete canonical browser suite: **24/24 passed in 129.390367 seconds**, one Chromium worker, fresh isolated application contexts, and zero failures, skips, flakes, or retries. No protection state or owner cookies were shared. Private upload/isolation/erasure passed against the deployed services; fresh provider operations remained blocked or mocked within the automated suite. The separate wrapper elapsed time was 130.14 seconds and is not the browser-test duration.
- [x] The final database assertion found zero provider jobs for the nine exactly tagged browser-test owners. Scoped cleanup removed those owners and three remaining test studios; no tagged records remained, and independent review studios were preserved.
- [x] Independent canonical in-app browser inspection repeats the four viewport checks and actual six-thumbnail WebP audit. A fresh sample shows 38% toward Full, true upper lag, and outer 23% versus inner 53% with the complete translucent oval, legend, and simulation label.
- [x] A previously saved canonical studio reopens at the same URL with its **38% left and 37% right** readings intact. Its earlier geometry is explained; the application does not invent new-geometry heatmaps for those historical readings. No regeneration is required.

[Sanitized production evidence](evidence/review-round2-release.json), [local acceptance](evidence/review-round2-local.json), [measurement evaluation](evaluation-measurement.md), and [recording provenance](../public/examples/PROVENANCE.md) define the evidence. Refreshed IMAGE/VIDEO timings are reported separately from R1. Physical webcam plus real blush remains unverified; synthetic inputs do not establish human application outcomes. Earlier releases below retain their dated evidence.

## Session recovery follow-up — released and verified

A failed session lookup previously fell through to anonymous sign-in, which could block an existing owner from reopening a private studio. The client now preserves that identity on network errors, unsuccessful HTTP responses, and malformed session data. It permits anonymous sign-in only after an HTTP 200 response containing literal JSON `null`. A session-read 429 can retry the GET once after a supported `X-Retry-After` or `Retry-After` delay of at most 60 seconds; an uncertain sign-in POST is never automatically repeated. Existing studio setup, preview, and provider behavior is unchanged.

- [x] Seventeen focused auth regressions pass. The complete local unit/PostgreSQL suite passes 265/265 tests across 29 files, including 13 database cases in a disposable local schema.
- [x] Production build, lint with zero warnings, TypeScript, formatting, and whitespace checks pass. Private execution artifacts are excluded from the product lint target.
- [x] The complete browser suite passes 20/20 tests in 64.117728 seconds against the optimized local build, with no failures, skips, or retries. The new recovery regression forces one session-read 429, then verifies exactly two session GETs, an unchanged owner cookie and complete saved Berry/Build studio, and zero recovery-phase anonymous, studio-mutation, or preview POSTs. The suite also verifies actual private upload/isolation/erasure without paid YouCam submissions.
- [x] Application `836b18762500d2fca63d30fe4716aeefad4c3815` deployed as `dpl_FWdtp8MKFsB9LTYCJfM2DXDXVsNX`; canonical production reached READY with normal availability. The complete deployed suite passed **20/20 in 110.81 seconds**, using one worker, no retries and fresh isolated app contexts. The session recovery case and real private upload/isolation/erasure passed with zero paid YouCam submissions.
- [x] Independent in-app browser verification reopened the prior saved studio after deployment: its 38% left and 37% right simulated checkpoints, heatmaps and selected Full target remained intact. No new generation was needed.
- [x] Final source/client credential scan found zero matches across 222 text files, including 37 client chunks, against 27 configured values. Environment files, private artifacts and plans remain ignored.

[Sanitized follow-up evidence](evidence/session-recovery-release.json) records the exact checks. This supersedes the feature release’s application build below; its feature, protected-floor and bounded live-provider evidence remains valid. Later documentation-only commits do not change this deployed application.

## November review round — released and verified

This round adds measured local checkpoints, exact intensity ladders, eye-goal adaptation, budget/retry hardening, and a shorter provenance system. On November 1, 2026 IST (October 31 UTC), application commit `8fc4712f451c6288019100ff8482389151adc54e` was deployed to [steady-taupe-pi.vercel.app](https://steady-taupe-pi.vercel.app). Deployment `dpl_CQg5WmKoS1X23LsiYFLtYtAGTWVZ` reached `READY` with the normal balance floor. The October record below describes the previous release; subsequent documentation-only commits do not alter this application build.

- [x] Migration 004 applied to the isolated local database and production Neon; additive and compatible with the previous deployed code.
- [x] Local `pnpm lint`, TypeScript and production build pass; 19 generated pages and pinned model/runtime assets.
- [x] Integrated unit/invariant/local PostgreSQL suite: 248/248 tests passed across 28 files. Database cases use a disposable schema and reject remote database URLs. This includes corrupted recording ledgers, preserved pre-review sessions, complete recorded-sample coverage, and deployment-cookie isolation.
- [x] Entire browser suite against the final production build: 19/19 passed in 49.3 seconds, including the real private Blob upload, ownership and durable-erasure test. Both sample-mode entry points clear unsupported optional lips, and every supported sample setup has recorded targets. No paid preview submission occurred.
- [x] Real MediaPipe IMAGE/VIDEO synthetic-camera path: baseline → intermediate → Full → uneven-light abstention → pose abstention → Full recovery; scalar-only checkpoint commands and no image upload.
- [x] Warm synthetic-camera timing captured separately: five 1024×1280 checks took 37.4–45.0 ms in Chromium 156. Model startup, persistence, UI rendering, physical webcam behavior and participant use are excluded.
- [x] Independent browser review at 1366×768 and 390×844: cheek and eye samples, target changes, same-product/appearance-changing repair, per-step history and reachable controls. Keyboard, 200% reflow and scoped Axe checks passed in the automated journey.
- [x] Frozen pre-review compatibility: six saved sessions and five original version-1 technique definitions continue without changing confirmed instructions; seven regression tests pass.
- [x] Eighteen cheek and four eye recordings added; exact source/recipe/output hashes verified. Historical nine recordings preserved. Observed spend 22 units; balance 1006→984. One invalid-pattern attempt definitively failed and was not charged.
- [x] Repository formatting and final source/client credential scan pass. The scan compared 18 configured credential values across 220 candidate text files and found no matches or private artifact paths.
- [x] Protected deployment with an elevated balance floor: 17/17 browser checks passed. A real personal upload followed by a fresh-preview request returned `503 LIVE_PREVIEWS_RESTING` with zero provider jobs; recorded samples remained usable. Owner/stranger access, rejected asset injection, and durable private-object erasure passed.
- [x] Canonical production in-app browser journey: Quick sample → Full target → 38% left checkpoint → cream-brush adaptation preserving one confirmed step → 37% right checkpoint → matching per-step result history.
- [x] Bounded fresh personal workflow using an explicitly synthetic QA portrait: three intensity levels succeeded, each with exactly one provider attempt, a persisted task/workflow, and private output. All images loaded; switching to Light persisted without another generation. Balance 984→981 matches the three-unit spend. No console warnings or errors observed.
- [x] Final complete browser sweep on canonical production: 19/19 tests passed with fresh isolated application contexts, including eye adaptation, camera/measurement paths, both sample contract guards, mobile/reflow/accessibility, and real private upload/isolation/erasure. Fresh-preview requests were blocked within the automated suite; the separate bounded three-unit workflow above exercised the real provider.

The source contains no human-study or calibrated cosmetic-accuracy claim. See [measurement evaluation](evaluation-measurement.md), [recording provenance](../public/examples/PROVENANCE.md), and [operations](operations.md) for the scope and recovery rules.

## Previous deployed release — October 31, 2026

This checklist records implementation checks without representing synthetic scenarios as participant outcomes.

Production was verified on October 31, 2026 at [steady-taupe-pi.vercel.app](https://steady-taupe-pi.vercel.app), running Node 22.x. The verified application commit is `c26c9cb98e4674a64ea5bba7deb05caff5fc046d`; Vercel deployment `dpl_2UDBdqSU3QhVbupDmG7Q5RYRepoV` reached `READY`. Subsequent documentation-only commits do not change this deployed application record.

- [x] Independent PostgreSQL database and private Blob configured; local and production environments separated.
- [x] Migrations001–003 applied locally and to the production Neon database.
- [x] Exact current runtime/package versions pinned with a frozen pnpm lockfile.
- [x] Finite planner, tri-state constraints, immutable completed actions, and consent/ownership boundaries tested.
- [x] Gemini/OpenAI live selected-image probes and constrained output tests passed.
- [x] Real YouCam adapter smoke, nine exact recorded sample outputs, and local and production application workflows passed without duplicate submission.
- [x] Personal-path synthetic baseline uploaded privately; actual provider result copied into private application storage.
- [x] Camera-denial/manual checkpoint and local-model synthetic-video checks passed.
- [x] Optional microphone VAD/command path tested in browser; actual synthesized speech tested through authenticated transcription endpoint.
- [x] Desktop/mobile walkthrough, adaptation, review, saved-method reuse, deletion, and accessibility inspected.
- [x] Final combined lint, TypeScript, formatting, 76 unit/invariant tests, and 12 browser tests pass on the frozen source.
- [x] Production build passes, including public fixture tracing and local model/runtime assets.
- [x] Final diff/path and secret-exclusion review passes; no `.env`, private captures, plans, or execution artifacts staged.
- [x] Deployment verified at the public canonical URL with private previews protected and scheduled cleanup configured.

Production checks returned 200 for the public entry and `/api/config`, and 401 for unauthenticated `/api/sessions` and `/api/cron/cleanup`. All three exact recorded sample methods displayed correctly. A fresh rose/tapping preview reached `succeeded` with one attempt, a persisted provider task and Workflow run, and a private Blob output. Gemini interpreted the synthetic terracotta inspiration with a lighting caveat and left the user's selection unchanged until confirmation.

See [evaluation](evaluation.md) for test scope and limitations, [operations](operations.md) for recovery, and [asset provenance](asset-licenses.md) for sample rights and hashes. No human recruitment or artist review is a release gate, and no human-study result is claimed.
