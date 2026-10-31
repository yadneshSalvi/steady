# Engineering evaluation

Evaluation was performed on October 31, 2026 using software checks, synthetic inputs, live provider calls, and desktop/mobile browser inspection. No participant or makeup-artist study was performed. These results establish implementation behavior, not calibrated cosmetic quality or measured accessibility benefit.

## Reproducible checks

The final local release gate passed lint, TypeScript, formatting, all 76 unit/invariant tests across 13 files, and all 12 browser tests against the production build. The combined browser run took 55.1 seconds and included the actual private-upload/deletion service test. The enlarged-view capture was inspected to confirm that its instruction rail and controls reflowed rather than being cropped.

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

Unit and invariant tests cover the finite planner, tri-state comfort, tool requirements, preserved completed actions, immutable physical history, exact recipes and source binding, geometric mirror/crop transforms, constrained AI responses, voice grammar, recorded-sample integrity, quota boundaries, transaction compensation, workflow replay, and cancellation races. The planner sweep checks 6,912 setup combinations. Targeted PostgreSQL predicate checks used temporary tables in a rolled-back transaction and did not modify application records.

The recorded sample's source bytes, all nine effect recipes, and output hashes are verified offline. Personal or lip-enabled inputs cannot receive these recorded outputs. The real external API tests are separately opt-in; normal unit tests do not spend YouCam credits.

## Browser evidence

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

## Real provider evidence

The first YouCam adapter smoke completed a real task for the fictional portrait and used one observed unit. Its cheek effect was localized but too subtle for comparison. Nine subsequent exact sample recipes, using stronger illustrative intensities and explicit zero smoothing, each completed once. No tuning duplicate or ambiguous submission occurred in that batch.

A separate application workflow then completed one personal-path synthetic-fixture preview. PostgreSQL recorded one attempt and a provider task ID; the output was copied to private Blob and displayed through the authenticated asset route. This verifies the browser→API→reservation→Workflow→YouCam→private result path. The synthetic portrait and rendered target remain distinct from a physical result.

[AI evaluation](evaluation-ai.md) records the actual Gemini 4 Argon and GPT-6 Astra probes, timings, and limitations. Exposure-change and identical-image probes exercised abstention. No model-generated assessment is treated as an independent label of real-world correctness.

## Production verification

The public [production studio](https://steady-taupe-pi.vercel.app) was verified on October 31, 2026 using the application commit and deployment recorded in [release verification](release-checklist.md). The canonical entry and `/api/config` returned 200; unauthenticated `/api/sessions` and `/api/cron/cleanup` returned 401. All three exact recorded sample previews were visually checked in the deployed application.

One fresh production rose/tapping preview completed with `state=succeeded` and `attempts=1`. The provider task ID, Workflow run ID, and private Blob output persisted, and no retry was needed. This extends the local integration evidence to the deployed browser→API→database→Workflow→YouCam→private result path.

Production Gemini inspiration analysis also succeeded on the synthetic terracotta image. It identified warm terracotta, explained a lighting limitation, and did not select a look automatically. These are operational and synthetic-input checks; they do not establish real-user cosmetic quality, physical accessibility, or participant outcomes.

## Practical limits

Race tests simulate failure boundaries and selected database predicates; they are not a distributed load or penetration test. A crash between a paid POST and task-ID persistence remains inherently ambiguous and intentionally blocks resubmission. The catalog is limited to broad cheek color and optional lips. Hand tracking, calibrated occlusion/lighting assessment, arbitrary transfer, clinical claims, measured user improvement, and artist validation are not implemented or claimed.

Current final-command status is tracked in [release verification](release-checklist.md). Private execution evidence and test captures remain ignored; public evidence contains only synthetic assets and sanitized provenance.
