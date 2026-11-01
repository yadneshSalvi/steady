# Architecture and invariants

STEADY is a Next.js 16 App Router application using React 19 and TypeScript. PostgreSQL owns studio revisions, events, ownership, upload intents, provider jobs, and budget reservations. Private Vercel Blob holds explicitly selected and uploaded image assets. Vercel Workflow runs asynchronous previews and deletion jobs. Durable studio/job records do not depend on process memory or writable local disk. Application baselines, captured checkpoint pixels, landmarks, and heatmaps deliberately remain in ephemeral browser memory.

## A finite application method

The planner compiles a small, versioned technique library into candidates. It requires a comfortable movement and confirmed tool/product for every action. `unknown` differs from `comfortable`; avoided and unconfirmed requirements cannot enter a plan. An infeasible setup produces actionable conflicts rather than a fabricated alternative.

A candidate contains an appearance recipe and ordered physical instructions. These are related representations, not a claim that a rendering parameter determines a physical product amount. Recipe intensity controls YouCam appearance only. The adapter validates finite effect parameters and explicitly sets both skin-smoothing intensities to zero.

Each physical confirmation is an event. Adaptation preserves the completed prefix, changes only remaining actions, and explains any goal change before acceptance. Pause/reload requires confirmation that the saved physical state still matches the person. A sample completion has no physical outcome object. Fresh reuse starts a new studio with no inherited completed steps or photos; sample inventory and comfort are not treated as personal facts.

Repair ranks methods that retain the current product above product changes. A cream-blush brush method can therefore preserve cream when another tool is needed. If a completed area and the proposed remaining area use different products, the proposal explains that they may look different. The user decides whether to accept it; applied product is never digitally undone.

The Defined eyes goal compares high precision short strokes with an eyeliner pen against low precision shadow tapping with a clean fingertip or suitable sponge. Those are draft method classifications, not inferred user abilities or artist validation. Liner↔shadow repair changes the appearance goal as well as the movement, preserves a completed eye exactly, and records a goal change only after acceptance. Original version-one cheek/lip technique definitions and stored recipe contracts remain compatible.

## Exact appearance targets

Cheek methods have Light 25, Build 45, and Full 65 YouCam targets. Liner has Light 25/Full 65; current warm upper-lid shadow has Light 25/Full 45. Selecting a stopping point binds the exact recipe, preview asset, and job provenance; those parameter values do not establish physical makeup amounts. Current eye recipes use the checked official single-color patterns `HalfRim19` and `1color20` with zero smoothing. Saved historical shadow plans retain their `1color1` recipe and 25/65 outputs.

The public catalogs contain 39 genuine recorded YouCam outputs on one fictional source: nine legacy method previews, 18 cheek ladder outputs, four historical eye outputs, six compact blush passes, and two revised eye targets. Each manifest has pinned source, recipe, and output checksums. Recorded attachment requires the exact synthetic source and matching recipe; personal uploads cannot receive those examples. Legacy recipes and all original bytes retain their identities. Public ladder thumbnails use responsive Next.js optimization, while full originals remain measurement inputs and authenticated private images bypass that optimizer. [Recorded asset provenance](../public/examples/PROVENANCE.md) identifies every catalog.

## Durable ownership and mutation

Better Auth creates an anonymous owner with an HttpOnly session cookie and a 30-day session lifetime. Every studio, asset, and job route checks that owner. A UUID in a URL is not authorization. Clearing the cookie loses access to that anonymous owner's studios; this release has no cross-device account recovery.

Mutations lock the session row and require the expected revision. A stale window receives a conflict and reloads the latest state. Events and session JSON are written in the same transaction. Source capture, virtual target, checkpoint observation, user confirmation, and final result have separate fields and provenance.

## Private photo lifecycle

The browser obtains an owner-bound upload intent with a server-generated private Blob pathname scoped to the environment and studio. Direct upload bypasses the serverless request-body limit. Finalization verifies the intent, size, real file type, dimensions, stage, and ownership; strips metadata; applies EXIF orientation; and writes a normalized JPEG. The incoming object is then deleted.

Private images are served through authenticated, no-store asset routes. Browser-created asset metadata cannot enter a session event. Server-generated object paths are tracked across the entire SQL transaction; failed writes are compensated, and an uncertain commit is checked before deleting a possibly committed object. Daily cleanup removes abandoned incoming objects and older unregistered normalized photos after a grace period.

## Local checkpoints and review

The planning source photo is distinct from a local application baseline. For a personal camera session, stable eligible tracking triggers a baseline capture before applying color to that region. The browser snapshots a canvas and runs IMAGE inference on that exact bitmap using a separate singleton worker. The VIDEO worker continues to serve the moving guide; its smoothed points are not substituted for still landmarks. Baselines are reused across later passes on the same region.

The pure measurement engine uses the same 48-point anatomical cheek oval as the static and live placement guides, tagged `cheekbone-oval-v2`. It erodes the region mask, excludes the inner mouth or eye surface, fits linear-RGB gains on an unchanged forehead patch, and validates illumination with a disjoint nose-bridge patch plus spatial forehead residuals. It converts to CIELAB, reports Δa* and CIEDE2000, and projects the actual change onto the source→chosen-preview direction. A 42%-opacity graded heatmap and measured subregion comparisons support optional guidance. The crop expands to preserve the full region and padding at the available aspect ratio. Pose, eye-position, light, occlusion/contrast, pixel coverage, and near-zero-target guards can return a reason with no progress claim. These are experimental guards, not calibrated physical-quality or safety classifiers; [measurement evaluation](evaluation-measurement.md) describes their evidence and limits.

Automatic checkpoint persistence contains scalar values, a reason when abstaining, the target/level identity, provenance, elapsed time, and whether the user reported a pass. It contains no checkpoint image, baseline pixels, landmarks, or heatmap geometry. Browser caches hold that media temporarily. Personal review can show remembered local media while available; after a reload or eviction, the saved numbers remain without inventing a replacement personal image. A per-tab marker records that a baseline was captured without storing its pixels; an explicit restart requires confirmation that the area is still clear of newly applied product.

The camera-free sample runs IMAGE landmarks on the fictional portrait. Cheeks use a separate compact `Circle2` blush render as the simulated first pass; eyes use their actual Light render. New observations retain the public checkpoint SHA-256 and geometry version alongside the scalar reading. Review reconstructs only that same image with compatible geometry. Earlier cheek observations keep their saved numbers without synthesizing a replacement heatmap under the new oval. Two consecutive reported build passes with less than 0.1 additional progress toward the same exact target, geometry, and checkpoint identity can offer Make this easier. Its notice opens a broader-tool proposal directly, with Other changes one click away; it never accepts a repair or completes an action automatically.

## Paid operation boundary

A PostgreSQL advisory lock serializes budget reservation across instances. Daily global, anonymous-owner, and hashed-IP allowances are checked before dispatch. Deleting a studio does not delete these independent reservations. A five-minute provider request window reserves capacity for the other project using the account.

Current code defaults are 12 fresh jobs per application/database day, six per anonymous owner, and eight per hashed IP. During application or a repair proposal, a fresh request is limited to the one selected missing target level and a separate ceiling of two adaptation jobs per owner/day; those jobs also consume the ordinary allowances. The active plan, proposal, and candidate projections stay synchronized without changing completed snapshots. An exact source/recipe job can be explicitly rebound across regenerated candidate IDs or historical variant labels; its original input, request hash, and task identity remain unchanged. GET-only polling projects completion into the selected target. Partial initial batches report requested, queued, and deferred counts instead of implying that every target was queued.

A shared PostgreSQL balance cache within this application reads the upstream account balance and subtracts held reservations above a configurable 200-unit floor. Successful reads are cached for five minutes and failed reads for 30 seconds. A failed read or insufficient headroom stops fresh work with a resting message while exact recorded results remain usable. The workflow checks this boundary before submission as well as at reservation. This is an application safeguard, not an atomic reservation with the provider or another application's independent database.

The workflow stores `submitting` and `submission_started_at` before a paid YouCam POST. That unsafe step has zero automatic retries. A known task ID is reused; a crash or timeout after an ambiguous submit becomes `unknown_submission` and is not submitted again. SQL and an external paid API cannot form one atomic transaction; the explicit uncertain state is intentional.

Success is downloaded promptly from an allowed HTTPS output host, normalized, copied into private storage, and bound to the exact source and recipe. Cancellation remains authoritative even after provider acceptance and does not promise a refund. A replay after output persistence repairs the UI projection without another paid task.

## AI and local vision boundaries

Gemini/OpenAI receive only selected stills after separate image-analysis consent. Schemas, finite tool/product/action IDs, normalization, and semantic validation constrain responses. Suggestions do not change inventory, comfort, goals, or step completion automatically. Identical checkpoint inputs abstain locally. Model provenance is retained with observations.

An automatic local measurement does not authorize an upload. The optional second-opinion control separately explains that the chosen still will be stored privately and sent with its scalar measurement, and requires consent. Selected-image and voice request buckets are serialized in PostgreSQL across app, owner, and hashed IP. Defaults per rolling hour are 120/60/30 image requests and 720/360/180 voice requests; a provider failure does not erase the recorded attempt. These are request limits, not token or monetary budgets.

The face model runs in a browser worker. It consumes bounded camera frames, permits one inference at a time, rejects stale or unsuitable geometry, applies the video's cover crop and mirror transform, and draws a regional guide. It does not alter the face image. This release has no hand tracking or calibrated occlusion classifier. An unusable face hides the guide while instructions remain available.

The optional Facial Color Tones Analyzer remains deferred. Its checked 20-unit operation exposes facial color values, with no undertone field in the [documented output schema](https://docs.makeupar.com/reference/ai_skin_tone_analysis). STEADY does not infer an undertone recommendation or claim that endpoint is integrated.

Optional voice detects short utterances locally and sends them through an authenticated route to Deepgram Nova-3. The server returns only six exact wake-word commands. No raw audio or free-form transcript is persisted by STEADY. The client discards responses for a changed step, requires a checkpoint before `next`, and uses `stop` to open confirmation.

## Infrastructure choice

Neon PostgreSQL, private Vercel Blob, and Vercel Workflow replace a separately hosted queue/storage stack. This preserves independent durable database state, private object ownership, and asynchronous execution while using the owner's existing Vercel project. Environment prefixes isolate development, preview, and production objects. Production needs its own database credentials, auth secret, canonical origin, and scheduled cleanup.
