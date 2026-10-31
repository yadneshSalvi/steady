# Release verification

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
