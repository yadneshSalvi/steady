# Warm heatmap display verification — 2 November 2026

The display scale now derives from the existing look color: Rose `#BE6680` for the cheek sample and brown `#6B4A40` for the eye sample. Zero progress uses a pale tint at 13% opacity; target progress uses the chosen shade at 45% in Review crops or 62% in the mirror. Higher progress deepens toward plum/brown and increases opacity. The legend has identical color/alpha stops over warm skin backing, Less/More labels and the 100% target marker. Measurement, smoothing, region masks, exclusions and blur are unchanged. Compositing tests additionally check increasing visible color travel from the pale low-progress appearance over three warm skin backings in both mirror and crop modes, plus target visibility and warm channels over a deeper backing.

The local captures are actual UI screenshots at 1440×900 from a production build (`next start`, port 3100) and new anonymous recorded-sample sessions. The pointer was moved off the UI. No compositing, retouching, personal frames or provider generation were used.

- [Mirror checkpoint](local/mirror-checkpoint-1440x900.png): 38%, upper 21% / lower 56%; warm rose overlay.
- [Both Review cheeks](local/review-cheeks-1440x900.png): 38% left / 39% right; matching shared legend.
- [Eye checkpoint](local/eye-checkpoint-1440x900.png): 56%, outer 55% / inner 59%; visible brown overlay.
- [Machine checks](local/checks.json): all cell fills have red greater than green/blue, eye fills also have green greater than blue, and opacity varies. Paid requests and browser errors are both empty.

The regression is `tests/e2e/warm-heatmap.spec.ts`. Run `TEST_BASE_URL=http://localhost:3100 STEADY_CAPTURE_HEATMAP_EVIDENCE=1 pnpm exec playwright test tests/e2e/warm-heatmap.spec.ts` against the local production server to refresh evidence. The same test can verify canonical production without the capture environment flag. Generation and transcription routes are blocked and asserted unused.

The affected landing frame is `public/images/product-checkpoint-r4.webp`. It was re-cropped from `.mirror-layout`, copied to both round-four PNG source locations, and encoded at its native 1328×637 size with Sharp WebP quality 82. Hashes and sizes are recorded in `../round3/product-frame-provenance.json`. The ladder and instruction-only mirror frames contain no heatmap and retain their existing captures.

Validation: optimized production build, lint with no warnings, TypeScript, and all 493 unit/integration tests across 40 files pass. Database tests use `TEST_DATABASE_URL=postgres://yadneshsalvi@localhost:5432/steady_dev` and isolate their own random schema. The warm heatmap browser test passes for mirror, both Review cheeks and eye at 1440×900; the existing round-two regression additionally checks full mask containment at 1366×768, 1440×813, 1440×900 and 390×844.

These checks concern recorded synthetic samples and software behavior; they provide no real makeup or participant outcome evidence.
