# Architecture and invariants

STEADY is a Next.js 16 App Router application using React 19 and TypeScript. The browser owns interaction, live camera processing, and unsaved selected files. PostgreSQL owns revisions, events, ownership, upload intents, provider jobs, and budget reservations. Private Vercel Blob owns image bytes. Vercel Workflow runs asynchronous previews and deletion jobs. No production session or job depends on a process-memory map or writable local disk.

## A finite application method

The planner compiles a small, versioned technique library into candidates. It requires a comfortable movement and confirmed tool/product for every action. `unknown` differs from `comfortable`; avoided and unconfirmed requirements cannot enter a plan. An infeasible setup produces actionable conflicts rather than a fabricated alternative.

A candidate contains an appearance recipe and ordered physical instructions. These are related representations, not a claim that a rendering parameter determines a physical product amount. Recipe intensity controls YouCam appearance only. The adapter validates finite effect parameters and explicitly sets both skin-smoothing intensities to zero.

Each physical confirmation is an event. Adaptation preserves the completed prefix, changes only remaining actions, and explains any goal change before acceptance. Pause/reload requires confirmation that the saved physical state still matches the person. A sample completion has no physical outcome object. Fresh reuse starts a new studio with no inherited completed steps or photos; sample inventory and comfort are not treated as personal facts.

## Durable ownership and mutation

Better Auth creates an anonymous owner with an HttpOnly session cookie and a 30-day session lifetime. Every studio, asset, and job route checks that owner. A UUID in a URL is not authorization. Clearing the cookie loses access to that anonymous owner's studios; this release has no cross-device account recovery.

Mutations lock the session row and require the expected revision. A stale window receives a conflict and reloads the latest state. Events and session JSON are written in the same transaction. Source capture, virtual target, checkpoint observation, user confirmation, and final result have separate fields and provenance.

## Private photo lifecycle

The browser obtains an owner-bound upload intent with a server-generated private Blob pathname scoped to the environment and studio. Direct upload bypasses the serverless request-body limit. Finalization verifies the intent, size, real file type, dimensions, stage, and ownership; strips metadata; applies EXIF orientation; and writes a normalized JPEG. The incoming object is then deleted.

Private images are served through authenticated, no-store asset routes. Browser-created asset metadata cannot enter a session event. Server-generated object paths are tracked across the entire SQL transaction; failed writes are compensated, and an uncertain commit is checked before deleting a possibly committed object. Daily cleanup removes abandoned incoming objects and older unregistered normalized photos after a grace period.

## Paid operation boundary

A PostgreSQL advisory lock serializes budget reservation across instances. Daily global, anonymous-owner, and hashed-IP allowances are checked before dispatch. Deleting a studio does not delete these independent reservations. A five-minute provider request window reserves capacity for the other project using the account.

The workflow stores `submitting` and `submission_started_at` before a paid YouCam POST. That unsafe step has zero automatic retries. A known task ID is reused; a crash or timeout after an ambiguous submit becomes `unknown_submission` and is not submitted again. SQL and an external paid API cannot form one atomic transaction; the explicit uncertain state is intentional.

Success is downloaded promptly from an allowed HTTPS output host, normalized, copied into private storage, and bound to the exact source and recipe. Cancellation remains authoritative even after provider acceptance and does not promise a refund. A replay after output persistence repairs the UI projection without another paid task.

## AI and local vision boundaries

Gemini/OpenAI receive only selected stills after separate image-analysis consent. Schemas, finite tool/product/action IDs, normalization, and semantic validation constrain responses. Suggestions do not change inventory, comfort, goals, or step completion automatically. Identical checkpoint inputs abstain locally. Model provenance is retained with observations.

The face model runs in a browser worker. It consumes bounded camera frames, permits one inference at a time, rejects stale or unsuitable geometry, applies the video's cover crop and mirror transform, and draws a regional guide. It does not alter the face image. This release has no hand tracking or calibrated occlusion classifier. An unusable face hides the guide while instructions remain available.

Optional voice detects short utterances locally and sends them through an authenticated route to Deepgram Nova-3. The server returns only six exact wake-word commands. No raw audio or free-form transcript is persisted by STEADY. The client discards responses for a changed step, requires a checkpoint before `next`, and uses `stop` to open confirmation.

## Infrastructure choice

Neon PostgreSQL, private Vercel Blob, and Vercel Workflow replace a separately hosted queue/storage stack. This preserves independent durable database state, private object ownership, and asynchronous execution while using the owner's existing Vercel project. Environment prefixes isolate development, preview, and production objects. Production needs its own database credentials, auth secret, canonical origin, and scheduled cleanup.
