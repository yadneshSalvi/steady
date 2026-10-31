# Local checkpoint measurement

This is an experimental comparison of visible color changes, implemented in `src/lib/vision/measure.ts`. It compares a local baseline and checkpoint with the color direction between a source photo and its chosen YouCam preview. Progress describes that image comparison. It does not establish physical product quantity, technique quality, comfort, task completion, or agreement with a makeup artist.

The results below were observed on 31 October 2026 UTC. No participant application sessions or independently annotated physical-makeup examples were evaluated.

## Implemented method

The IMAGE detector processes the exact captured bitmap. It uses an independent worker/Face Landmarker instance rather than reusing temporally smoothed video landmarks. Source-photo landmarks are detected once and reused for a pixel-aligned source/YouCam preview pair. A still request carries a request ID; inference and model startup have bounded timeouts and a failed worker can be recreated.

Cheek and lip masks use the existing anatomical landmark polygons. Sampling removes pixels within 5% of the shorter bounding dimension of every edge, approximately 10% overall. The inner mouth is excluded from lip sampling. Black/white clipping and transparent pixels are rejected. A 4×4 grid supplies the coarse heatmap; the heatmap is a regional summary rather than a dense per-pixel estimate.

Illumination correction uses three multiplicative gains in **linear RGB**, mapping the checkpoint's unchanged forehead patch to the baseline. Reference statistics drop the brightest 5% of samples to reduce highlight contamination. A separate nose-bridge patch is held out of the fit. Its corrected CIEDE2000 residual, plus spatial residuals across forehead cells, can reject nonuniform illumination. Comparing only the fitted reference means would trivially hide a lighting change; that is not the implemented check.

Region pixels are converted to CIELAB using the sRGB D65 reference white. The result reports mean Δa*, CIEDE2000 between the region means, and the projection of the actual Lab change onto the source→preview Lab change:

```text
progress = clamp(dot(actual_delta_Lab, target_delta_Lab)
                 / dot(target_delta_Lab, target_delta_Lab), 0, 1.5)
```

Cheeks are split toward/away from the nose and into upper/lower halves. Lips use anatomical left/right and upper/lower halves. A lagging area is reported only when subregion progress differs by at least 0.12. Uniformity describes variation among target-relative cell measurements; it is not a confidence or beauty score.

The engineering guards reject ineligible/missing landmarks, optional explicit occlusion or confidence evidence, pose changes, insufficient pixels, unusable reference patches, clipping, strong new local contrast, nonuniform light, and a color change substantially inconsistent with the target direction. Hand detection is not implemented. The optional landmark-confidence field is caller-supplied; the system does not invent a confidence value from MediaPipe's landmark coordinates.

Thresholds are explicitly **uncalibrated**. They include 96 region samples, 48 forehead samples, 24 held-out samples, 8° relative roll, 0.075 relative yaw proxy, 4.5 ΔE00 for held-out/spatial lighting residuals, and 0.55–1.8 channel gains. A target below 1.2 Lab-vector magnitude or 0.75 ΔE00 is too subtle. Verdict bands are below 85%, 85–115%, and above 115%. These values provide deterministic experimental behavior and have not been validated as human perceptual cutoffs.

An abstention returns `progress: null` with a specific reason and no heatmap. It never substitutes an invented percentage. Pose recovery asks the user to return to the original baseline position; starting a new baseline over applied pigment would erase the earlier change from the denominator.

## Recorded fixture observations

The denominator is **one AI-created source portrait**, 18 genuine YouCam outputs (3 look families × 2 textures × 3 intensities), and both cheeks. The output intensity parameters are 25, 45, and 65. They do not imply equivalent physical product amounts. All recipes explicitly disable both skin-smoothing settings. Source, recipe, and output identities are recorded in `public/examples/recorded-ladders.json`.

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

## Software and perturbation checks

The CIEDE2000 implementation matches all **34 published Sharma/Wu/Dalal supplementary test pairs**, including the hue discontinuity cases, within 0.0001 absolute error in both directions. The independent run's maximum absolute error was 0.00004950. The source is the authors' [implementation notes and supplement](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/); the numeric reference cases are stored unchanged in `tests/fixtures/ciede2000.txt`.

Synthetic known-color tests exercise no change, intermediate change, full change, overshoot, global linear-RGB exposure/white-balance changes, eroded boundaries, near-zero targets, low resolution, pose change, high-contrast obstruction, explicit occlusion, and lip/mouth separation. An 8-bit uniform-patch illumination test allows six percentage points of drift to include systematic byte quantization; the observed drift was 4.83 points. This is a software tolerance, not an estimate of camera accuracy.

A disjoint held-out patch test changes the nose bridge while leaving the fitted forehead unchanged. The fitted gains remain exactly `[1,1,1]`, but the held-out residual triggers `lighting_changed`. A separate forehead-gradient test rejects spatially varying light even when the average fit nearly cancels it. Both operate independently of the pigment-region mean.

Synthetic perturbations of the actual recorded pixels also recovered global exposure change: one independent rose/satin/light comparison moved from 37.831% to 38.131% (0.30 percentage points). A global white-balance perturbation of the unchanged source returned 0% and ΔE00 0.052. A nonuniform left-side perturbation abstained with a 5.445 spatial ΔE00 residual. These are controlled software perturbations, not additional real lighting captures.

The combined measurement/domain run passed **145 tests across 11 files**. Focused ESLint and the repository TypeScript check passed. Reproduce the color, synthetic, recorded-pixel, geometry, worker-protocol, timeout, singleton, eye-method, and repair checks without provider keys or paid calls:

```sh
pnpm exec vitest run tests/measurement.test.ts tests/measurement-eyes.test.ts tests/measurement-recorded.test.ts tests/still-detector.test.ts tests/face-tracker-worker.test.ts tests/geometry.test.ts tests/eye-goal.test.ts tests/planner.test.ts tests/planner-state.test.ts tests/youcam.test.ts tests/youcam-recorded-integrity.test.ts
pnpm exec eslint src/lib/vision/measure.ts src/lib/vision/still-detector.ts src/lib/vision/face-tracker.worker.ts src/lib/vision/geometry.ts src/lib/planner src/lib/youcam/recipes.ts tests/measurement.test.ts tests/measurement-eyes.test.ts tests/measurement-recorded.test.ts tests/still-detector.test.ts tests/face-tracker-worker.test.ts tests/eye-goal.test.ts
pnpm typecheck
```

## Synthetic-camera browser timing

`tests/e2e/local-mirror.spec.ts` exercised the real VIDEO and IMAGE models in Chromium **156.0.8078.4** using a **1024×1280 canvas stream at 12 fps**. It used the synthetic source and exact recorded rose/satin Light/Full frames, with fixture-controlled studio API responses. The test did not use a physical webcam or a participant and did not upload the measured frames.

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

## Defined-eyes addendum

The eye goal adds two draft interpretations of the same eye emphasis: a fine upper line using confirmed eyeliner/pen and high precision short strokes, and softly tapped eye shadow using confirmed shadow with a clean fingertip or a suitable sponge. Precision describes the proposed action; it is not measured or inferred from the user. New technique definitions have their own version-one identities. Existing cheek/lip version-one instructions and alternatives were retained.

Both eye methods have **Light 25 and Full 65** previews; Build is unavailable for this goal. The exact frozen recipes are matte `eye_liner`/`HalfRim19` in `#3A2B2B` and matte `eye_shadow`/`1color1` in `#6B4A40`, each with both smoothing fields explicitly zero. The official [Makeup VTO schemas](https://docs.makeupar.com/reference/makeup_vto) require pattern names to match catalog labels. `src/lib/youcam/fixtures/eye-patterns.json` stores the selected official single-color catalog entries and catalog/excerpt checksums. Schema and recipe labels derive from this excerpt. A regression test rejects the unsupported `Shadow1color1` alias that failed an initial shadow request; that failed task supplied no published preview.

The upper-lid polygons use the crease-side landmark row and upper eye contour. Sampling and heatmap masks exclude the full eye-surface contour. Guidance concerns the comfortably closed upper-lid skin above the lashes and excludes the waterline. It requires products/tools labeled for eyelid makeup and preserves pause/skip choices. The image polygons cannot establish safe tool contact, pressure, or a suitable technique for an individual.

For a comparable checkpoint, the eye position must match the original baseline after the hand moves away. An additional uncalibrated guard abstains when landmark-derived eye openness changes by more than 0.1 of eye width. Degenerate eye geometry and a lack of usable spatial cells also abstain rather than returning a partial score. Synthetic tests verify known darkening, ocular-pixel exclusion, outer/inner differences, insufficient lid resolution, changed openness, and near-zero targets. This does not establish shape/edge accuracy for a thin eyeliner line.

The recorded-eye denominator is **one synthetic portrait, four genuine YouCam outputs, and eight region comparisons** (2 methods × 2 levels × 2 eyes). Source/model landmarks are the same pinned IMAGE fixture used above. `public/examples/recorded-eyes.json` pins each exact recipe, source, and output. The engine was run without weakening the existing thresholds:

| Checkpoint against its Full target | Comparisons |         Observed progress |
| ---------------------------------- | ----------: | ------------------------: |
| Light fine liner                   |           2 | 38.58% left; 45.06% right |
| Light soft shadow                  |           2 | 43.80% left; 43.92% right |
| Full liner/shadow                  |           4 |                   100.00% |

All eight of those comparisons were eligible. Full target ΔE00 values were 2.486/2.636 for left/right liner and 5.326/5.946 for shadow. The sampled regions had 1,395 left-eye and 1,505 right-eye pixels. Full-versus-full remains a consistency check, not independent physical validation.

Selecting Light as the target has its own denominator: **7 of 8 possible eye target regions pass the magnitude guard**. The left-eye Light liner abstains as `target_too_subtle` because its Lab magnitude is 1.121, below 1.2 (ΔE00 0.970). This is retained and tested rather than forcing feedback. The same render is a valid intermediate numerator against the larger Full liner target.

The eye planner tests enumerate 288 movement/tool/product combinations without assuming unknown movements are comfortable. A tool-only shadow repair ranks the same shadow product above a switch to liner. A liner↔shadow repair explicitly changes the appearance goal, preserves any completed eye byte for byte, explains that two sides may differ, and sets the goal-change flag only when accepted. It does not imply removal or rewriting of earlier pigment. These are deterministic software invariants, not participant outcomes or artist approval.

## Limits and pending evaluation

An image-only color comparator cannot distinguish every region-local lighting change from makeup. A colored light that affects only the measured cheek in the target's color direction can produce identical pixels while both reference patches remain unchanged. A test deliberately demonstrates that ambiguity. The engine will report the visible color change in that case; it cannot establish its cause. Smooth skin-colored hands or tools may also evade the contrast heuristic. Forehead or bridge makeup, expression changes, camera tone mapping, autofocus, texture, and imperfect landmark registration can invalidate the assumptions.

The implemented measurements cover broad cheek/lip and visible upper-lid color changes. Eyeliner geometry, tool contact, pressure, safety, and physical execution are not measured. Generated-target proximity is separate from user satisfaction and physical completion, and the user remains the decision maker. Baseline/checkpoint pixels and heatmap/landmark geometry belong only in ephemeral browser memory; `summarizeMeasurement` returns scalar numbers, method, and reasons for session history.

Still pending: permission-cleared physical before/after captures, independent artist/participant annotations, participant/session-separated evaluation, skin-appearance and device coverage, calibrated abstention/false-ready rates, genuine hand/tool occlusions, stable real-camera lighting, and complete on-device workflow latency including startup and UI/persistence. The one-portrait generated fixtures and warmed synthetic-camera check do not answer those questions.

The implementation uses the official [MediaPipe IMAGE and VIDEO APIs](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js). Worker protocol tests mock inference to check ownership and correspondence; the stored source landmark fixture separately records an actual model invocation.
