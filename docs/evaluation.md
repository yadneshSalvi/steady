# Engineering evaluation

This document separates the initial October 31, 2026 release evidence from the subsequent review round. No participant or makeup-artist study was performed in either. Software checks, fictional images, rendered targets, and controlled perturbations establish implementation behavior, not calibrated cosmetic quality or measured accessibility benefit. Final repository-wide gate results and the reviewed application's production deployment are recorded by the release owner in [release verification](release-checklist.md).

## Review-round additions

The implementation now measures a local captured still against an in-memory application baseline and the exact chosen source/YouCam target. It uses IMAGE landmarks from the captured bitmap, linear-RGB reference gains, an independent held-out skin patch and spatial lighting residuals, CIELAB/CIEDE2000, target-direction progress, and a coarse regional heatmap. It can abstain for pose, eye position, light, insufficient pixels, occlusion/contrast, or a subtle target. Automatic checkpoint persistence contains scalar values and provenance rather than images or landmarks. An optional uploaded-still AI opinion remains a separate consented action.

The camera-free sample uses actual source/Light/target pixels and labels its checkpoint as simulated. Personal review retains its scalar observations after local pixel memory is lost; it does not replace an actual checkpoint with a virtual result. [Measurement evaluation](evaluation-measurement.md) gives the exact fixture denominators, independent color-science checks, measured ranges, abstentions, and the unresolved ambiguity between local colored illumination and cosmetic pigment. It includes 36 cheek comparisons from 18 ladder outputs and eight eye comparisons from four eye outputs on one synthetic source. These are generated-fixture checks, not independent physical-makeup ground truth.

A separate Chromium 156.0.8078.4 browser check used a 1024×1280 canvas camera stream at 12 fps with the real VIDEO/IMAGE models. Five warmed checkpoint operations took 45.0, 43.8, 41.0, 37.4, and 42.3 ms. The scope includes exact capture, IMAGE inference, PNG encoding, and pixel calculation; it excludes model startup, JPEG encoding, persistence, and UI rendering. Light measured 38.017% and Full 100.272%; nonuniform light and a 22° image rotation abstained, and returning to the Full frame restored 100.272%. This was a synthetic-camera engineering test, not a physical webcam or participant benchmark. The scoped JSON attachment and reproduction command are described in the measurement report.

The recorded catalogs now contain **31 successful exact outputs**: nine unchanged legacy method previews, 18 cheek ladder renders, and four eye renders. The 22 new successes used **22 observed units**, with account snapshots **1,006→984**. One initial `Shadow1color1` request definitively failed and was verified uncharged before the corrected official `1color1` recipe was submitted. Its failed task produced no published record. Full source/recipe/output identities and failure handling are described in [recorded-output provenance](../public/examples/PROVENANCE.md).

The Defined eyes goal demonstrates a change from fine liner/high precision short strokes to softly tapped shadow/low precision tapping. Repair preserves a completed eye exactly and marks a changed appearance goal only on acceptance. Tool repair ranks same-product alternatives before product changes; a mixed-product proposal explicitly explains that completed and remaining sides may differ. Two qualifying measured passes toward the same target can offer adaptation, with the user retaining the decision. A fresh synthetic browser walkthrough exercised fine liner, a reported movement change, and a measured soft-shadow simulation; this is interaction evidence rather than actual application.

A separate frozen compatibility regression passed seven cases covering six pre-round session snapshots and five original technique definitions from commit `d8ef475`. The fixture tests continue those saved sessions and preserve completed actions and original recipes. Reproduce that narrow check with `pnpm exec vitest run tests/legacy-session.test.ts`. This does not stand in for the release owner's final full-suite gate.

Operating changes include the 200-unit balance floor, daily 12/app, 6/owner, and 8/hashed-IP fresh-preview caps, a two-job adaptation ceiling, partial-queue reporting, pre-submission retry accounting, and rolling app/owner/IP AI/voice caps. [Operations](operations.md) gives the exact defaults and failure behavior. Migration004 has been applied to the production database; the earlier deployed code remains active at this documentation checkpoint, pending the reviewed application's deployment and smoke checks.

The checked Facial Color Tones Analyzer operation costs 20 units but its [documented result](https://docs.makeupar.com/reference/ai_skin_tone_analysis) exposes color values without an undertone field. That integration remains deferred. No undertone inference, tone-based shade-suitability claim, or tone-analysis task was added to this round.

## Historical release checks — October 31

The initial release gate passed lint, TypeScript, formatting, all 76 unit/invariant tests across 13 files, and all 12 browser tests against that production build. The combined browser run took 55.1 seconds and included the actual private-upload/deletion service test. The enlarged-view capture was inspected to confirm that its instruction rail and controls reflowed rather than being cropped. Those counts describe the initial release, not the current review branch.

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
pnpm start         # run the built application in a separate terminal
pnpm test:e2e      # requires the local server and development services
```

For the real private-upload/deletion service test, explicitly enable it with local test credentials. It creates and removes only its own synthetic test studio and blocks all preview submissions:

```sh
STEADY_RUN_PRIVATE_UPLOAD_E2E=1 node --env-file-if-exists=.env --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test
```

The initial unit and invariant tests covered the finite planner, tri-state comfort, tool requirements, preserved completed actions, immutable physical history, exact recipes and source binding, geometric mirror/crop transforms, constrained AI responses, voice grammar, recorded-sample integrity, quota boundaries, transaction compensation, workflow replay, and cancellation races. The planner sweep checked 6,912 setup combinations. Targeted PostgreSQL predicate checks used temporary tables in a rolled-back transaction and did not modify application records.

That release verified the recorded sample's source bytes, all nine original effect recipes, and output hashes offline. Personal or lip-enabled inputs could not receive those recorded outputs. The real external API tests remain separately opt-in; normal unit tests do not spend YouCam credits.

## Historical browser evidence — October 31

| Scenario                      | Observed behavior                                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete sample studio        | Setup, comparison, start, checkpoint, explicit confirmation, adaptation, resume, review, finish, save, fresh reuse, and deletion completed.                                                                                                                             |
| Pause/reload after adaptation | Confirmed left-cheek action persisted while the remaining action used another supported method; resuming required physical-state confirmation.                                                                                                                          |
| Desktop/mobile access         | Eight representative screens reported zero Axe WCAG A/AA violations in the scoped scans. At 390×844, primary mirror controls were visible and no horizontal overflow was observed.                                                                                      |
| Keyboard and enlarged view    | Tab reached primary mirror controls with visible focus, and Enter opened and confirmed a checkpoint. A half-size CSS viewport at device-pixel ratio 2 exercised the 200% browser-zoom equivalent; instructions and controls remained reachable through vertical reflow. |
| Camera permission denied      | Clear fallback retained text instructions and a manual checkpoint; the user could explicitly confirm a step without an uploaded photo.                                                                                                                                  |
| Actual local face model       | A fictional portrait rendered as a canvas video stream produced a regional polygon with the real MediaPipe runtime; pausing removed it. No frame upload occurred.                                                                                                       |
| Optional microphone           | Browser recording/VAD consumed a generated tone, accepted a mocked exact command response, paused the studio, and stopped tracks when disabled. This tests control wiring, not speech accuracy.                                                                         |
| Actual speech endpoint        | A synthesized Daniel voice saying “Steady, check” returned the exact bounded command through authenticated Deepgram transcription. Missing consent returned 400. Another synthesized voice was misheard and safely rejected.                                            |
| Selected-image helper         | Live inspiration and workbench analysis succeeded; suggestions stayed unselected until confirmation. Delayed-response tests rejected results for a replaced image and recovered from cancellation/deadline.                                                             |
| Sign-in burst recovery        | A simulated 429 ended the busy state, explained the wait, preserved setup choices, and allowed retry. The combined test harness honors the actual server retry window between fresh anonymous owners.                                                                   |
| Private baseline upload       | A synthetic fixture exercised the personal upload path and was normalized and retained privately. This was not a real participant capture.                                                                                                                              |
| Private ownership and erasure | The actual Blob service test returned owner 200, unauthenticated 401, and foreign-owner 404; browser asset injection was rejected. Delete revoked access immediately, then the workflow removed the database studio and private object. No preview task was requested.  |

Automated tests and browser inspection also check revision conflicts and owner isolation. A zero-violation Axe scan is a useful check, not full accessibility conformance or evidence from assistive-technology users. Hardware camera quality, browser/device diversity, speech accents, tremor, fatigue, occlusion, and long-session usability have not been established by these synthetic scenarios.

## Historical live provider evidence — October 31

The first YouCam adapter smoke completed a real task for the fictional portrait and used one observed unit. Its cheek effect was localized but too subtle for comparison. Nine subsequent exact sample recipes, using stronger illustrative intensities and explicit zero smoothing, each completed once. No tuning duplicate or ambiguous submission occurred in that batch.

A separate application workflow then completed one personal-path synthetic-fixture preview. PostgreSQL recorded one attempt and a provider task ID; the output was copied to private Blob and displayed through the authenticated asset route. This verifies the browser→API→reservation→Workflow→YouCam→private result path. The synthetic portrait and rendered target remain distinct from a physical result.

[AI evaluation](evaluation-ai.md) records the actual Gemini 4 Argon and GPT-6 Astra probes, timings, and limitations. Exposure-change and identical-image probes exercised abstention. No model-generated assessment is treated as an independent label of real-world correctness.

## Historical production verification — October 31

The public [production studio](https://steady-taupe-pi.vercel.app) was verified on October 31, 2026 using the application commit and deployment recorded in [release verification](release-checklist.md). The canonical entry and `/api/config` returned 200; unauthenticated `/api/sessions` and `/api/cron/cleanup` returned 401. All three exact recorded sample previews were visually checked in the deployed application.

One fresh production rose/tapping preview completed with `state=succeeded` and `attempts=1`. The provider task ID, Workflow run ID, and private Blob output persisted, and no retry was needed. This extends the local integration evidence to the deployed browser→API→database→Workflow→YouCam→private result path.

Production Gemini inspiration analysis also succeeded on the synthetic terracotta image. It identified warm terracotta, explained a lighting limitation, and did not select a look automatically. These are operational and synthetic-input checks; they do not establish real-user cosmetic quality, physical accessibility, or participant outcomes.

## Practical limits

Race tests simulate failure boundaries and selected database predicates; they are not a distributed load or penetration test. A crash between a paid POST and task-ID persistence remains inherently ambiguous and intentionally blocks resubmission. The reviewed library covers broad cheek color, optional lips, and the Defined eyes liner/shadow example. Hand tracking, calibrated occlusion/lighting assessment, arbitrary transfer, clinical claims, measured user improvement, and artist validation are not implemented or claimed. Eye polygons and color changes do not establish tool contact, pressure, safety, or thin-line shape accuracy.

Current final-command status is tracked in [release verification](release-checklist.md). Private execution evidence and test captures remain ignored; public evidence contains only synthetic assets and sanitized provenance.
