# Release verification

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
