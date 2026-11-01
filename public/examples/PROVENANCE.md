# Recorded output provenance

These **41 images are genuine YouCam Makeup Virtual Try-On outputs** generated from one AI-created fictional adult portrait. They demonstrate API rendering and STEADY's local measurement path. They are virtual previews, not participant photographs, physically applied makeup, or evidence of comfort, ability, safety, or task completion.

The account owner authorized the source image and publication of these integration examples. Provider terms apply. No real person, celebrity, third-party reference photograph, or product-brand endorsement is represented. Source-image generation details and permission are recorded in [the image provenance](../images/PROVENANCE.md) and [its manifest](../images/provenance.json).

## Exact common source

- Source: `public/images/studio-portrait.jpg`, asset identity `sample-portrait-v1`.
- Dimensions: 1024×1280.
- SHA-256: `ab3cb20c55f3b4a7046b5b9b72eceef3376370070426a28bef009caaf7b932cd`.
- Source provenance: `synthetic_inspiration`, created using OpenAI `gpt-image-2` on October 31, 2026.

Each catalog binds its full effect recipes and original returned image bytes to that source. Output pixels were not recolored, retouched, or synthesized locally to exaggerate a result. `generatedAt` is STEADY's ingestion time, not a provider-issued generation timestamp. Public request/task identities are SHA-256 digests; raw provider IDs, temporary download URLs, account secrets, and private storage paths are excluded.

## Catalogs

| Batch                                   | Count | Published files                                                                                    | Exact recipe record                                               |
| --------------------------------------- | ----: | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Original method comparison              |     9 | `previews/{rose,terracotta,berry}-{tap,sweep,sponge}.png`                                          | [recorded-samples.json](recorded-samples.json), recipe revision 2 |
| Cheek intensity ladder                  |    18 | `ladder/{rose,terracotta,berry}-{satin,matte}-{light,build,full}.png`                              | [recorded-ladders.json](recorded-ladders.json), recipe revision 3 |
| Defined eyes                            |     4 | `eyes/{liner,shadow}-{light,full}.png`                                                             | [recorded-eyes.json](recorded-eyes.json), schema version 1        |
| R2 compact blush passes and warm shadow |     8 | `round2/blush-{rose,terracotta,berry}-{satin,matte}.png`, `round2/shadow-{light,full}-warm-v2.png` | [recorded-round2.json](recorded-round2.json), recipe revision 4   |
| R3 stronger warm upper-lid pair         |     2 | `round3/shadow-{light,full}-warm-v4.png`                                                           | [recorded-round3.json](recorded-round3.json), recipe revision 5   |

The original 31 outputs were ingested on October 31, 2026 UTC; the eight R2 and two adopted R3 additions were ingested on November 1 UTC. Every request explicitly sets `skinSmoothStrength: 0` and `skinSmoothColorIntensity: 0`. Provider intensity settings describe the virtual image; they are not calibrated physical makeup quantities or stroke counts.

The nine legacy records retain their original recipes and checksums. For each color family, tap used satin intensity 64/glow 18, sweep used matte intensity 75, and sponge used satin intensity 60/glow 10. These originals are not relabeled as the newer ladder levels. The original [README](README.md) describes that nine-image batch.

The new cheek ladder uses Light 25, Build 45, and Full 65, with blush pattern `1color1`. The satin variants use glow 10; matte variants have no glow field. The exact shades remain rose `#BE6680`, terracotta `#BF7153`, and berry `#9D526C`.

The historical eye catalog uses Light 25 and Full 65 only. Fine liner is matte `eye_liner`, pattern `HalfRim19`, color `#3A2B2B`. Its recipe remains current. The historical shadow is matte `eye_shadow`, pattern `1color1`, color `#6B4A40`. The [original catalog excerpt](../../src/lib/youcam/fixtures/eye-patterns.json) pins those official single-color labels and checksums. These files and recipes remain available to saved plans.

R2 adds six compact `Circle2` blush passes at intensity 45, preserving each family's exact color and satin/glow 10 or matte texture. These are separate simulated first-pass inputs, not replacements for the 25/45/65 target ladder. R2 shadow plans retain matte `eye_shadow`, `1color20`, warm brown `#805036`, at Light 25 and Full 45. The [R2 catalog excerpt](../../src/lib/youcam/fixtures/round2-patterns.json) contains the selected official entries and snapshot hashes. The new manifest is pinned at SHA-256 `5d4560f533cf985b97fc7c2d9015e2738621f08709867e3c8ecb4456a6c5fe97`.

## Observed recording usage and failure

The first review round generated **18 successful cheek outputs and four successful eye outputs**, using **22 observed YouCam units**. The read-only account snapshots changed from **1,006 to 984**. The nine earlier method outputs were preserved and were not regenerated in that round. These figures describe that recording batch, not a live account balance or all historical service usage.

One initial eye-shadow request used the unsupported alias `Shadow1color1`. The provider task definitively failed, the recorder stopped, and the failure was verified as **uncharged**. Its private evidence was archived before the corrected official `1color1` request was made. The failed task supplied no published image or successful catalog record. The recipe schema and regression tests reject that alias. An ambiguous submission remains a different state and must never be retried blindly.

R2 used **10 successful requests and 10 observed units**, with account snapshots **962→952** on November 1, 2026 UTC. Each request was submitted once. Six compact blush passes and two revised warm-shadow targets were adopted. Two earlier successful shadow trials (`1color20`, `#9C694B`, matte 20/45) were too subtle for the unchanged target guards and were not adopted. They are successful provider outputs with unsuitable measurement signal, not failed provider tasks or participant outcomes. Their original bytes and private ledger remain preserved: Light SHA-256 `15f0917ec6286fd476310762b10427697c715aca53372bd4357a90f3b920f95f`, Full `fdc40e266bb30685b25910afa7baa6aed6d92116f460d32673d68807df543e2c`. All 31 earlier PNGs and their three manifests remain byte-identical. No additional paid production smoke is included in R2.

The two separate resumable R2 ledgers persist the exact source/catalog/recipe identities, a pre-submission state, the returned task ID, and output hashes before publication. An initial Node invocation without the React server condition failed during module loading before any provider access or task attempt; it was corrected before the approved pilot. Dry-run reproduction is `NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/record-round2.ts` and the corresponding `record-round2-eyes.ts`. New submissions require both the explicit live flag and exact job selection. `pnpm exec tsx scripts/publish-round2.ts` verifies completed ledgers and copies only the eight adopted original outputs; it performs zero provider calls and refuses to overwrite changed published bytes.

R3 adopts a stronger warm `1color20` shadow pair in matte `#68402B`, Light 35 and Full 65, at new immutable `round3/shadow-{light,full}-warm-v4.png` URLs. The manifest SHA-256 is `b7bc1b755bb7f36f012eea7b5e1b536ae1b2156a55701c0be50cdd0dd45f5342`. R1 `makeLegacyEyeRecipe` and R2 `makeRound2EyeRecipe` reproduce the older request contracts; saved targets are matched to their exact original recipe, rather than silently moved to the current palette. All 39 earlier PNGs and four manifests remain byte-identical.

R3 used **four successful, once-only requests and four observed units (952→948)** on November 1, 2026 UTC. The first `#805036` matte 35/65 pair passed the existing measurement guards but missed the requested Full strength aim. These two successful, non-adopted trials remain private and unchanged: Light SHA-256 `ab70927db75585ccd890b83280011a091ab70f87144a60a047735288f919fda2`, Full `f7bd76f6c0e1f887cc7826600ca1d0764045da708c424c198ab6862f53a7a289`. The separately approved deeper Full trial reached regional ΔE00 4.434/4.707 with the original eye masks; only then was its matching Light requested. Both adopted levels leave every pixel unchanged in the two fixed below-eye audit patches. The [sanitized R3 recording evidence](../../docs/evidence/measurement-recordings-r3.json) preserves the exact counts, hashes, and scalar pixel results. The budget is closed; there were no ambiguous retries or additional paid production requests.

`scripts/record-round3-eyes.ts` and `scripts/record-round3-eyes-deeper.ts` retain separate locked, resumable ledgers. Each task entered a persisted submitting state before its one POST and stored its returned task identity before polling. `scripts/publish-round3.ts` performs zero provider calls, verifies the successful approved pair and all 43 historical files, and refuses to overwrite changed public bytes. Public assets are copied from the returned PNG bytes without retouching or re-encoding.

## Simulation and display

Sample screens use one Sample badge; Evidence & limits explains image origins and limitations. The cheek sample measures its compact first-pass render; eye samples measure their actual Light render. These are simulated checkpoint inputs, described on the Evidence page. Progress, heatmap, and spatial guidance come from the source/checkpoint/chosen-target pixels. The same first-pass bitmap is measured when the chosen cheek target changes; it is never blended or recolored to force a percentage. New observations retain the checkpoint's exact output SHA-256 and geometry version so history can reconstruct those same pixels.

Public ladder thumbnails may be resized and encoded as WebP by Next.js for display. Measurement and provenance continue to load the full original files. Private authenticated images bypass that public optimizer, and the compact text-only ladder requests no thumbnails.

The [measurement evaluation](../../docs/evaluation-measurement.md) reports the exact denominators, intermediate values, target-subtlety abstentions, and known lighting/occlusion limits. A generated-target comparison does not establish physical execution or satisfaction. Personal uploads and lip-enabled recipes cannot reuse this synthetic-source catalog. Legacy previews attach only to their original exact recipe contracts; current ladders and eye outputs use their separately pinned manifests.

Offline verification requires no provider key or paid request:

```sh
pnpm exec vitest run tests/youcam-recorded.test.ts tests/youcam-recorded-integrity.test.ts tests/round2-recordings.test.ts tests/eye-goal.test.ts tests/measurement-recorded.test.ts tests/measurement-round2.test.ts tests/round3-recordings.test.ts tests/delta-a-centroid.test.ts
```

The loader verifies manifest, source, recipe, and output hashes before attachment. Recording/publishing scripts are operator tools; ordinary app builds and sample browsing do not generate paid replacement images.
