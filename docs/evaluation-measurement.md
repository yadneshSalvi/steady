# Local checkpoint measurement

This is an experimental comparison of visible color changes, implemented in `src/lib/vision/measure.ts`. It compares a local baseline and checkpoint with the color direction between a source photo and its chosen YouCam preview. Progress describes that image comparison. It does not establish physical product quantity, technique quality, comfort, task completion, or agreement with a makeup artist.

The historical results are from 31 October 2026 UTC and the geometry review is from 1 November 2026 UTC. They are separated below because changing the sampled cheek region changes the measured color statistics. No participant application sessions or independently annotated physical-makeup examples were evaluated.

## Implemented method

The IMAGE detector processes the exact captured bitmap. It uses an independent worker/Face Landmarker instance rather than reusing temporally smoothed video landmarks. Source-photo landmarks are detected once and reused for a pixel-aligned source/YouCam preview pair. A still request carries a request ID; inference and model startup have bounded timeouts and a failed worker can be recreated.

Cheeks now use a smooth, landmark-derived cheekbone/apple oval; the 31 October observations used the earlier six-landmark outlines. `geometry.regionPolygon` supplies the same source-coordinate polygon to both guides and measurement. Lips retain their anatomical landmark polygon. Sampling removes pixels within 5% of the shorter bounding dimension of every edge, approximately 10% overall. The inner mouth is excluded from lip sampling. Black/white clipping and transparent pixels are rejected. A 4×4 grid supplies the coarse heatmap; the heatmap is a regional summary rather than a dense per-pixel estimate.

Illumination correction uses three multiplicative gains in **linear RGB**, mapping the checkpoint's unchanged forehead patch to the baseline. Reference statistics drop the brightest 5% of samples to reduce highlight contamination. A separate nose-bridge patch is held out of the fit. Its corrected CIEDE2000 residual, plus spatial residuals across forehead cells, can reject nonuniform illumination. Comparing only the fitted reference means would trivially hide a lighting change; that is not the implemented check.

Region pixels are converted to CIELAB using the sRGB D65 reference white. The result reports mean Δa*, CIEDE2000 between the region means, and the projection of the actual Lab change onto the source→preview Lab change:

```text
progress = clamp(dot(actual_delta_Lab, target_delta_Lab)
                 / dot(target_delta_Lab, target_delta_Lab), 0, 1.5)
```

Cheeks are split toward/away from the nose and into upper/lower halves. Lips use anatomical left/right and upper/lower halves. Each half's Lab change is projected onto that half's own target color vector. A lagging area is reported only when subregion progress differs by at least 0.12. Uniformity describes variation among target-relative cell measurements; it is not a confidence or beauty score.

The engineering guards reject ineligible/missing landmarks, optional explicit occlusion or confidence evidence, pose changes, insufficient pixels, unusable reference patches, clipping, strong new local contrast, nonuniform light, and a color change substantially inconsistent with the target direction. Hand detection is not implemented. The optional landmark-confidence field is caller-supplied; the system does not invent a confidence value from MediaPipe's landmark coordinates.

Thresholds are explicitly **uncalibrated**. They include 96 region samples, 48 forehead samples, 24 held-out samples, 8° relative roll, 0.075 relative yaw proxy, 4.5 ΔE00 for held-out/spatial lighting residuals, and 0.55–1.8 channel gains. A target below 1.2 Lab-vector magnitude or 0.75 ΔE00 is too subtle. Verdict bands are below 85%, 85–115%, and above 115%. These values provide deterministic experimental behavior and have not been validated as human perceptual cutoffs.

An abstention returns `progress: null` with a specific reason and no heatmap. It never substitutes an invented percentage. Pose recovery asks the user to return to the original baseline position; starting a new baseline over applied pigment would erase the earlier change from the denominator.

## Historical recorded fixture observations — 31 October

These observations used the earlier six-landmark cheek geometry, now identified as `landmark-polygon-v1`. Their denominator is **one AI-created source portrait**, 18 genuine YouCam outputs (3 look families × 2 textures × 3 intensities), and both cheeks. The output intensity parameters are 25, 45, and 65. They do not imply equivalent physical product amounts. All recipes explicitly disable both skin-smoothing settings. Source, recipe, and output identities are recorded in `public/examples/recorded-ladders.json`.

`tests/fixtures/sample-landmarks.json` contains 478 landmarks observed from the exact 1024×1280 source image in IMAGE/CPU mode with `@mediapipe/tasks-vision` 1.2.0. The fixture pins source and model checksums. The landmark harness observed 66 ms warm inference; that excludes cold model startup and is not a webcam/device benchmark.

There are 12 full-target definitions (6 full renders × 2 cheeks) and 36 source→checkpoint region comparisons. Each checkpoint level is compared with the corresponding full target:

| Checkpoint                 | Comparisons | Observed progress range | Outcome                   |
| -------------------------- | ----------: | ----------------------: | ------------------------- |
| Light render, intensity 25 |          12 |            33.65–38.80% | All intermediate, `build` |
| Build render, intensity 45 |          12 |            67.48–69.66% | All intermediate, `build` |
| Full render, intensity 65  |          12 |                 100.00% | All `at_target`           |

Full-versus-full is a pipeline consistency check: the numerator and target use the same generated change. It is not independent evidence of physical accuracy. The lighter render supplies a real intermediate numerator rather than an invented demonstration percentage. The recorded regions are fairly uniform, so the engine does not manufacture an “outer cheek lighter” claim.

Selecting a lower ladder level as the target is a separate question. Among all 36 selectable target regions (18 renders × 2 cheeks), 31 pass the existing magnitude guard and **5 abstain as `target_too_subtle`**: terracotta/light on both cheeks and textures, plus terracotta/satin/build on the left cheek. Their target Lab magnitudes are 0.59–1.18 and ΔE00 values 0.36–0.76. The thresholds were retained; the sample does not force a percentage when its chosen target is too subtle. The same light renders remain measurable as intermediate checkpoints against the corresponding full targets.

An independent local Node harness measured 11.05–21.35 ms for these pure pixel comparisons, excluding image decoding, landmark detection, and model startup. This is not evidence that a complete real-camera checkpoint finishes within one second on a phone.

## Software and historical perturbation checks

The CIEDE2000 implementation matches all **34 published Sharma/Wu/Dalal supplementary test pairs**, including the hue discontinuity cases, within 0.0001 absolute error in both directions. The independent run's maximum absolute error was 0.00004950. The source is the authors' [implementation notes and supplement](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/); the numeric reference cases are stored unchanged in `tests/fixtures/ciede2000.txt`.

Synthetic known-color tests exercise no change, intermediate change, full change, overshoot, global linear-RGB exposure/white-balance changes, eroded boundaries, near-zero targets, low resolution, pose change, high-contrast obstruction, explicit occlusion, and lip/mouth separation. An 8-bit uniform-patch illumination test allows six percentage points of drift to include systematic byte quantization; the observed drift was 4.83 points. This is a software tolerance, not an estimate of camera accuracy.

A disjoint held-out patch test changes the nose bridge while leaving the fitted forehead unchanged. The fitted gains remain exactly `[1,1,1]`, but the held-out residual triggers `lighting_changed`. A separate forehead-gradient test rejects spatially varying light even when the average fit nearly cancels it. Both operate independently of the pigment-region mean.

Synthetic perturbations of the actual recorded pixels also recovered global exposure change: one independent rose/satin/light comparison moved from 37.831% to 38.131% (0.30 percentage points). A global white-balance perturbation of the unchanged source returned 0% and ΔE00 0.052. A nonuniform left-side perturbation abstained with a 5.445 spatial ΔE00 residual. These are controlled software perturbations, not additional real lighting captures.

The 31 October combined measurement/domain run passed **145 tests across 11 files**. Focused ESLint and the repository TypeScript check passed at that observation. Reproduce the color, synthetic, recorded-pixel, geometry, worker-protocol, timeout, singleton, eye-method, and repair checks without provider keys or paid calls:

```sh
pnpm exec vitest run tests/measurement.test.ts tests/measurement-eyes.test.ts tests/measurement-recorded.test.ts tests/still-detector.test.ts tests/face-tracker-worker.test.ts tests/geometry.test.ts tests/eye-goal.test.ts tests/planner.test.ts tests/planner-state.test.ts tests/youcam.test.ts tests/youcam-recorded-integrity.test.ts
pnpm exec eslint src/lib/vision/measure.ts src/lib/vision/still-detector.ts src/lib/vision/face-tracker.worker.ts src/lib/vision/geometry.ts src/lib/planner src/lib/youcam/recipes.ts tests/measurement.test.ts tests/measurement-eyes.test.ts tests/measurement-recorded.test.ts tests/still-detector.test.ts tests/face-tracker-worker.test.ts tests/eye-goal.test.ts
pnpm typecheck
```

## Historical synthetic-camera browser timing — 31 October

This run used `landmark-polygon-v1`. `tests/e2e/local-mirror.spec.ts` exercised the real VIDEO and IMAGE models in Chromium **156.0.8078.4** using a **1024×1280 canvas stream at 12 fps**. It used the synthetic source and exact recorded rose/satin Light/Full frames, with fixture-controlled studio API responses. The test did not use a physical webcam or a participant and did not upload the measured frames. These timings do not measure the later oval geometry.

Five **warmed** checkpoint operations produced the following attachment values, rounded for display:

| Frame condition                        | Result         | Progress | Elapsed |
| -------------------------------------- | -------------- | -------: | ------: |
| Recorded Light                         | `build`        |  38.017% | 45.0 ms |
| Recorded Full                          | `at_target`    | 100.272% | 43.8 ms |
| Nonuniform light on the held-out patch | `insufficient` | No claim | 41.0 ms |
| Full frame rotated 22°                 | `insufficient` | No claim | 37.4 ms |
| Return to Full at the baseline angle   | `at_target`    | 100.272% | 42.3 ms |

The instrumented interval covers **exact frame capture, IMAGE inference, PNG encoding, and pixel calculation**. It excludes **model startup, JPEG encoding, persistence, and UI rendering**. These five observations establish the warmed synthetic-camera processing path in that browser; they do not establish complete checkpoint latency on a hardware camera or phone, a population latency distribution, or cosmetic accuracy. The application path uses `local_camera` provenance, while the attachment explicitly identifies its evidence class as `synthetic_canvas_camera_engineering_test`.

The scoped JSON evidence is emitted under `test-results/review-camera-timing/**/synthetic-camera-measurements.json`. With the local production build/server available, reproduce the case with:

```sh
pnpm exec playwright test tests/e2e/local-mirror.spec.ts --output=test-results/review-camera-timing
```

## Historical defined-eyes addendum — 31 October

The eye goal adds two draft interpretations of the same eye emphasis: a fine upper line using confirmed eyeliner/pen and high precision short strokes, and softly tapped eye shadow using confirmed shadow with a clean fingertip or a suitable sponge. Precision describes the proposed action; it is not measured or inferred from the user. New technique definitions have their own version-one identities. Existing cheek/lip version-one instructions and alternatives were retained.

At this observation, both eye methods had **Light 25 and Full 65** previews; Build was unavailable for this goal. The exact frozen recipes were matte `eye_liner`/`HalfRim19` in `#3A2B2B` and matte `eye_shadow`/`1color1` in `#6B4A40`, each with both smoothing fields explicitly zero. The official [Makeup VTO schemas](https://docs.makeupar.com/reference/makeup_vto) require pattern names to match catalog labels. `src/lib/youcam/fixtures/eye-patterns.json` stores the selected official single-color catalog entries and catalog/excerpt checksums. Schema and recipe labels derive from this excerpt. A regression test rejects the unsupported `Shadow1color1` alias that failed an initial shadow request; that failed task supplied no published preview.

The upper-lid polygons use the crease-side landmark row and upper eye contour. Sampling and heatmap masks exclude the full eye-surface contour. Guidance concerns the comfortably closed upper-lid skin above the lashes and excludes the waterline. It requires products/tools labeled for eyelid makeup and preserves pause/skip choices. The image polygons cannot establish safe tool contact, pressure, or a suitable technique for an individual.

For a comparable checkpoint, the eye position must match the original baseline after the hand moves away. An additional uncalibrated guard abstains when landmark-derived eye openness changes by more than 0.1 of eye width. Degenerate eye geometry and a lack of usable spatial cells also abstain rather than returning a partial score. Synthetic tests verify known darkening, ocular-pixel exclusion, outer/inner differences, insufficient lid resolution, changed openness, and near-zero targets. This does not establish shape/edge accuracy for a thin eyeliner line.

The historical recorded-eye denominator is **one synthetic portrait, four genuine YouCam outputs, and eight region comparisons** (2 methods × 2 levels × 2 eyes). Source/model landmarks are the same pinned IMAGE fixture used above. `tests/fixtures/measurement-recordings-r1.json` preserves their source, recipe hashes, and output identities independently of later active-preview changes. The engine was run without weakening the existing thresholds:

| Checkpoint against its Full target | Comparisons |         Observed progress |
| ---------------------------------- | ----------: | ------------------------: |
| Light fine liner                   |           2 | 38.58% left; 45.06% right |
| Light soft shadow                  |           2 | 43.80% left; 43.92% right |
| Full liner/shadow                  |           4 |                   100.00% |

All eight of those comparisons were eligible. Full target ΔE00 values were 2.486/2.636 for left/right liner and 5.326/5.946 for shadow. The sampled regions had 1,395 left-eye and 1,505 right-eye pixels. Full-versus-full remains a consistency check, not independent physical validation.

Selecting Light as the target has its own denominator: **7 of 8 possible eye target regions pass the magnitude guard**. The left-eye Light liner abstains as `target_too_subtle` because its Lab magnitude is 1.121, below 1.2 (ΔE00 0.970). This is retained and tested rather than forcing feedback. The same render is a valid intermediate numerator against the larger Full liner target.

The eye planner tests enumerate 288 movement/tool/product combinations without assuming unknown movements are comfortable. A tool-only shadow repair ranks the same shadow product above a switch to liner. A liner↔shadow repair explicitly changes the appearance goal, preserves any completed eye byte for byte, explains that two sides may differ, and sets the goal-change flag only when accepted. It does not imply removal or rewriting of earlier pigment. These are deterministic software invariants, not participant outcomes or artist approval.

## Shared cheek oval review — 1 November

`cheekbone-oval-v2` replaces the six-point cheek outlines with 48-point smooth ovals. For the left cheek, landmarks 330/346 define the medial apple and lateral cheekbone, with landmark 280 defining the lower apple; the right-side counterparts are 101/117/50. The center is the midpoint of the apple/cheekbone anchors. The major-axis vector is 0.9 times their separation, and the minor-axis vector is 0.85 times the center-to-lower-apple vector. The outline is `center + major × cos(angle) + minor × sin(angle)`. These normalized source-coordinate vectors follow the face rather than a screen-aligned rectangle. They transform consistently under affine scale, roll, reflection, and source aspect ratio.

The same exported `regionPolygon` function feeds the guide and sampling mask. Missing, nonfinite, degenerate, or out-of-frame cheek anchors hide the polygon. Eye/lip outlines, erosion, reference patches, target magnitude requirements, and pose/lighting guards are unchanged. A private overlay on the exact source portrait was rendered and visually inspected with the two axes and original outline visible. The new outline follows the higher cheekbone/apple area smoothly, without the earlier lower-edge notch. That is an engineering placement review on one fictional face, not anatomical validation across people.

All **31 historical PNG outputs** were decoded again against the exact pinned IMAGE source fixture: 9 legacy previews, 18 cheek ladder outputs, and 4 original eye outputs. `tests/fixtures/measurement-recordings-r1.json` freezes their checksums and identities. No images were regenerated and no provider calls were made for this re-evaluation. The private numerical report is `artifacts/private/review-round2/cheek-geometry/measurement-report-v2.json`.

| Historical checkpoint under the new oval            | Comparisons | Observed progress | Outcome                    |
| --------------------------------------------------- | ----------: | ----------------: | -------------------------- |
| Cheek Light 25 against matching Full 65             |          12 |      33.20–38.45% | All `build`                |
| Cheek Build 45 against matching Full 65             |          12 |      66.09–69.13% | All `build`                |
| Cheek Full 65 against itself                        |          12 |           100.00% | All `at_target`            |
| Nine legacy outputs against themselves, both cheeks |          18 |           100.00% | All `at_target`            |
| Original eye Light against matching Full            |           4 |      38.58–45.06% | All `build`, unchanged     |
| Original eye Full against itself                    |           4 |           100.00% | All `at_target`, unchanged |

The oval samples 5,515–5,535 usable cheek pixels on this source, compared with 2,308–2,437 under the earlier outline. **35 of 36 selectable cheek target regions pass**; terracotta/satin/Light on the left cheek still abstains (`target_too_subtle`, Lab magnitude 1.064, ΔE00 0.705). Four previously subtle target regions now have enough signal inside the new mask. This follows the change in sampled source/render pixels; the 1.2 Lab and 0.75 ΔE00 guards were not reduced. The original eye target denominator remains 7 of 8, with the subtle left-eye Light liner retained. Recomputed results do not overwrite historical stored scalar observations; geometry identity separates the two scopes.

Pure Node pixel comparisons in the R2 harness took 23.81–29.44 ms, excluding decoding, landmark inference, capture, and model startup. This is a different scope from the warmed browser timings. The development-server and optimized-build browser observations for the 48-segment geometry are recorded separately below; no hardware-camera or phone latency claim follows from these harnesses.

The local `regionalProgress` array exposes the existing four half-region projections and sample counts for spatial explanation. It is excluded from scalar session persistence. Secondary horizontal guidance appears only for a cheek `build` result whose dominant lag is vertical, with supported inner/outer measurements differing by at least 0.12. It supplements the measured dominant area and never replaces it. Missing local data, abstentions, overshoot, and an `at_target` result do not produce that extra instruction. Identity comparisons include geometry version and sample checkpoint ID. Consecutive-stall detection requires both fields to match, so a change of recorded frame or mask cannot masquerade as stalled progress. Two historical observations with both fields absent remain compatible.

After adopting the R2 recordings, the focused vision/history/guidance check passed **164 tests across 9 files**, plus focused ESLint and formatting. This is a focused observation before the final repository/browser gates, not a final release-gate count:

```sh
pnpm exec vitest run tests/geometry.test.ts tests/measurement.test.ts tests/measurement-eyes.test.ts tests/measurement-recorded.test.ts tests/measurement-historical.test.ts tests/measurement-guidance.test.ts tests/measurement-secondary-guidance.test.ts tests/measurement-round2.test.ts tests/review-flow-state.test.ts
```

## Recorded spatial and warm-shadow review — 1 November

The adopted R2 assets use the same source bytes and IMAGE landmark fixture. `public/examples/recorded-round2.json` binds six actual YouCam `Circle2` first-pass renders (three colors × satin/matte, intensity 45) and two revised warm-shadow targets to their exact recipes and output bytes. The manifest SHA256 is `5d4560f533cf985b97fc7c2d9015e2738621f08709867e3c8ecb4456a6c5fe97`. The original 31 PNGs and three manifests remain unchanged. The published first passes are separate provider outputs, not painted or composited checkpoints.

All six first passes were evaluated on both cheeks against all three existing target levels: **36 comparisons**. All 12 Full-target comparisons returned `build` at **36.90–41.39%**, and all 12 Build-target comparisons returned `build` at **54.40–59.96%**. The actual dominant lag was `upper` throughout; every eligible `build` comparison also had a supported inner/outer gap above 0.12. Against Light, 10 comparisons were `at_target`, terracotta/satin/left retained `target_too_subtle`, and terracotta/satin/right returned `over` at **115.93%**. Neither the abstention nor the over-target result produces an extra build instruction.

The default rose/satin first pass gives the following target-relative results with `cheekbone-oval-v2`:

| Selected target | Left cheek progress | Right cheek progress | Verdict on both |
| --------------- | ------------------: | -------------------: | --------------- |
| Light 25        |              97.90% |              100.08% | `at_target`     |
| Build 45        |              54.40% |               54.90% | `build`         |
| Full 65         |              37.53% |               37.67% | `build`         |

Against Full, uniformity is 0.389 left and 0.442 right. The actual dominant lag is **upper** on both cheeks and remains the engine's result. The independent half-region projections also support a horizontal explanation:

| Half against Full | Left cheek | Right cheek |
| ----------------- | ---------: | ----------: |
| Inner             |     52.93% |      51.16% |
| Outer             |     23.37% |      25.99% |
| Upper             |     19.81% |      21.35% |
| Lower             |     55.69% |      53.35% |

These are each half's mean Lab projection, not a pixel-weighted average of already projected heatmap cells. The inner-minus-outer gaps exceed 0.12, so the `build` result can additionally say the outer part is lighter. The selector is not forced to say `outer`. The Light-target result produces no secondary build instruction even though its spatial distribution remains uneven. All six comparisons passed the existing quality/lighting guards, with zero held-out and forehead-spatial lighting residual on the aligned generated pixels. This does not establish how a real partial application would look or register.

The adopted warmer upper-lid previews use official `eye_shadow` pattern `1color20`, matte `#805036`, Light 25 and Full 45, with smoothing explicitly disabled. The comparison keeps the earlier eye polygons and target guards:

| Revised eye measurement           |             Left eye |            Right eye |
| --------------------------------- | -------------------: | -------------------: |
| Light checkpoint against Full     |      59.00%, `build` |      59.05%, `build` |
| Full checkpoint against itself    | 100.00%, `at_target` | 100.00%, `at_target` |
| Full target ΔE00                  |                2.427 |                2.763 |
| Full target Lab-vector magnitude  |                2.740 |                3.148 |
| Light target ΔE00                 |                1.452 |                1.658 |
| Light target Lab-vector magnitude |                1.618 |                1.861 |

Both selected Light targets also pass. An earlier `1color20`/`#9C694B` pilot at 20/45 was too subtle on both eyes: Full target Lab magnitudes 1.066/1.185 and ΔE00 0.577/0.708. It remains a failed measurement candidate; its lower signal was not rescued by reducing the guards. The revised files have separate identities, and the original `1color1` shadow outputs remain historical evidence.

A separate added-darkening audit fixes a below-eye quadrilateral from the **source** landmarks, independently of the upper-lid measurement mask. It spans ±0.38 eye widths along the eye-corner axis and 0.07–0.23 eye widths below the lower-lid landmark mean. The same pixel centers are compared in the source, original Full 65, and revised Full 45 using raw sRGB→D65 Lab with no fitted illumination correction:

| Fixed below-eye patch | Pixels | Original Full 65 mean ΔL* | Revised Full 45 mean ΔL* |
| --------------------- | -----: | ------------------------: | -----------------------: |
| Left eye              |  1,150 |                    −2.489 |                    0.000 |
| Right eye             |  1,103 |                    −3.532 |                    0.000 |

Every original-output patch pixel was more than 1 L* darker; none of the revised-output patch pixels was. A separate exact RGB comparison found zero changed patch pixels for either revised Light or Full. The source's natural shadows remain present. This measures added darkness in those fixed image patches; it is not a claim to remove shadows, diagnose skin, or improve health. A side-by-side private crop with the untinted patch outlines was visually inspected.

These eight R2 outputs are adopted public recording assets under `public/examples/round2/`. Raw bytes were preserved and checked before/after evaluation. Permanent coverage in `tests/measurement-round2.test.ts` pins the manifest and all eight outputs, evaluates every first pass against its three target levels on both cheeks, checks both revised eye targets, and repeats the independent below-eye audit. The private numerical reports are `artifacts/private/review-round2/cheek-geometry/published-measurement-report.json`, `eye-revision-measurement-report.json`, and `eye-revision-below-eye-rgb.json`. The evaluators made no provider calls. The final integrated browser gate and deployment are separate from these pixel observations.

## R2 synthetic-camera browser timing — 1 November, development server

A fresh local **development-server** run passed the four targeted browser cases in 13.3 seconds. Its `local-mirror.spec.ts` timing case exercised the real IMAGE and VIDEO models with `cheekbone-oval-v2` in Chromium **156.0.8078.4**, using a **1024×1280 canvas stream at 12 fps**. The timed frames were the original uniform rose/satin Light 25 and Full 65 ladder outputs; this is separate from the new `Circle2` spatial first-pass comparison. Studio API responses were fixture-controlled, and measured frames were not uploaded.

The five warmed checkpoint observations were:

| Frame condition                        | Result         | Progress | Elapsed |
| -------------------------------------- | -------------- | -------: | ------: |
| Original uniform Light 25              | `build`        |  37.946% | 65.0 ms |
| Full 65                                | `at_target`    |  99.860% | 97.4 ms |
| Nonuniform light on the held-out patch | `insufficient` | No claim | 53.4 ms |
| Full frame rotated 22°                 | `insufficient` | No claim | 43.2 ms |
| Return to Full at the baseline angle   | `at_target`    |  99.860% | 59.9 ms |

The interval includes **exact capture, IMAGE inference, PNG encoding, and pixel calculation**. It excludes **model startup, JPEG encoding, persistence, and UI rendering**. These are five observations in one development-server browser run, not an optimized-build benchmark or a comparison establishing the cause of any timing difference from R1. There was no physical webcam or participant. Ordinary camera lighting, physical blush, phone performance, and complete workflow latency remain unverified.

The [sanitized development timing JSON](evidence/measurement-timing-r2-dev.json) preserves the exact attachment values, browser/frame metadata, development-server scope, and source-attachment checksum. It omits session and asset IDs. The private source attachment is under `artifacts/private/review-round2/targeted-browser/**/synthetic-camera-measurements.json`. The optimized-suite observation follows separately; these development-server values and the historical R1 observations remain preserved.

## R2 synthetic-camera browser timing — 1 November, optimized build

The separate **local optimized production-build** browser suite passed **24/24 cases in 80.675931 seconds**. Its timing attachment uses the same Chromium **156.0.8078.4**, **1024×1280 canvas stream at 12 fps**, `cheekbone-oval-v2`, real IMAGE/VIDEO models, original uniform rose/satin Light/Full ladder frames, and fixture-controlled studio APIs. This is a local build observation, not a deployed-production or physical-webcam benchmark.

| Frame condition                        | Result         | Progress | Elapsed |
| -------------------------------------- | -------------- | -------: | ------: |
| Original uniform Light 25              | `build`        |  37.946% | 55.6 ms |
| Full 65                                | `at_target`    |  99.860% | 54.0 ms |
| Nonuniform light on the held-out patch | `insufficient` | No claim | 38.1 ms |
| Full frame rotated 22°                 | `insufficient` | No claim | 36.0 ms |
| Return to Full at the baseline angle   | `at_target`    |  99.860% | 53.5 ms |

These five warmed intervals include **exact capture, IMAGE inference, PNG encoding, and pixel calculation**, excluding **model startup, JPEG encoding, persistence, and UI rendering**. The same color results and abstentions were recovered in this run. The timing observations do not identify the cause of differences between build modes or establish a latency distribution. Measured frames were not uploaded; no physical webcam or participant was involved.

The separate [sanitized optimized timing JSON](evidence/measurement-timing-r2-optimized.json) preserves the exact metrics and source-attachment checksum without session/asset IDs. Its private source is under `artifacts/private/review-round2/optimized-browser/**/synthetic-camera-measurements.json`. The R1 and development-server evidence above remains unchanged in scope.

## Limits and pending evaluation

An image-only color comparator cannot distinguish every region-local lighting change from makeup. A colored light that affects only the measured cheek in the target's color direction can produce identical pixels while both reference patches remain unchanged. A test deliberately demonstrates that ambiguity. The engine will report the visible color change in that case; it cannot establish its cause. Smooth skin-colored hands or tools may also evade the contrast heuristic. Forehead or bridge makeup, expression changes, camera tone mapping, autofocus, texture, and imperfect landmark registration can invalidate the assumptions.

The implemented measurements cover broad cheek/lip and visible upper-lid color changes. Eyeliner geometry, tool contact, pressure, safety, and physical execution are not measured. Generated-target proximity is separate from user satisfaction and physical completion, and the user remains the decision maker. Baseline/checkpoint pixels and heatmap/landmark geometry belong only in ephemeral browser memory; `summarizeMeasurement` returns scalar numbers, method, and reasons for session history.

Still pending: permission-cleared physical before/after captures, independent artist/participant annotations, participant/session-separated evaluation, skin-appearance and device coverage, calibrated abstention/false-ready rates, genuine hand/tool occlusions, stable real-camera lighting, and complete on-device workflow latency including startup and UI/persistence. The one-portrait generated fixtures and warmed synthetic-camera check do not answer those questions.

The implementation uses the official [MediaPipe IMAGE and VIDEO APIs](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js). Worker protocol tests mock inference to check ownership and correspondence; the stored source landmark fixture separately records an actual model invocation.
