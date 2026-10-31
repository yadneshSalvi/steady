# Recorded output provenance

These **31 images are genuine YouCam Makeup Virtual Try-On outputs** generated from one AI-created fictional adult portrait. They demonstrate API rendering and STEADY's local measurement path. They are virtual previews, not participant photographs, physically applied makeup, or evidence of comfort, ability, safety, or task completion.

The account owner authorized the source image and publication of these integration examples. Provider terms apply. No real person, celebrity, third-party reference photograph, or product-brand endorsement is represented. Source-image generation details and permission are recorded in [the image provenance](../images/PROVENANCE.md) and [its manifest](../images/provenance.json).

## Exact common source

- Source: `public/images/studio-portrait.jpg`, asset identity `sample-portrait-v1`.
- Dimensions: 1024×1280.
- SHA-256: `ab3cb20c55f3b4a7046b5b9b72eceef3376370070426a28bef009caaf7b932cd`.
- Source provenance: `synthetic_inspiration`, created using OpenAI `gpt-image-2` on October 31, 2026.

Each catalog binds its full effect recipes and original returned image bytes to that source. Output pixels were not recolored, retouched, or synthesized locally to exaggerate a result. `generatedAt` is STEADY's ingestion time, not a provider-issued generation timestamp. Public request/task identities are SHA-256 digests; raw provider IDs, temporary download URLs, account secrets, and private storage paths are excluded.

## Catalogs

| Batch                      | Count | Published files                                                       | Exact recipe record                                               |
| -------------------------- | ----: | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Original method comparison |     9 | `previews/{rose,terracotta,berry}-{tap,sweep,sponge}.png`             | [recorded-samples.json](recorded-samples.json), recipe revision 2 |
| Cheek intensity ladder     |    18 | `ladder/{rose,terracotta,berry}-{satin,matte}-{light,build,full}.png` | [recorded-ladders.json](recorded-ladders.json), recipe revision 3 |
| Defined eyes               |     4 | `eyes/{liner,shadow}-{light,full}.png`                                | [recorded-eyes.json](recorded-eyes.json), schema version 1        |

All outputs were ingested on October 31, 2026 UTC. Every request explicitly sets `skinSmoothStrength: 0` and `skinSmoothColorIntensity: 0`. Provider intensity settings describe the virtual image; they are not calibrated physical makeup quantities or stroke counts.

The nine legacy records retain their original recipes and checksums. For each color family, tap used satin intensity 64/glow 18, sweep used matte intensity 75, and sponge used satin intensity 60/glow 10. These originals are not relabeled as the newer ladder levels. The original [README](README.md) describes that nine-image batch.

The new cheek ladder uses Light 25, Build 45, and Full 65, with blush pattern `1color1`. The satin variants use glow 10; matte variants have no glow field. The exact shades remain rose `#BE6680`, terracotta `#BF7153`, and berry `#9D526C`.

The eye catalog uses Light 25 and Full 65 only. Fine liner is matte `eye_liner`, pattern `HalfRim19`, color `#3A2B2B`. Soft shadow is matte `eye_shadow`, pattern `1color1`, color `#6B4A40`. The [checked catalog excerpt](../../src/lib/youcam/fixtures/eye-patterns.json) pins the official single-color labels and checksums.

## Observed recording usage and failure

This review round generated **18 successful cheek outputs and four successful eye outputs**, using **22 observed YouCam units**. The read-only account snapshots changed from **1,006 to 984**. The nine earlier method outputs were preserved and were not regenerated in this round. These figures describe this recording batch, not a live account balance or all historical service usage.

One initial eye-shadow request used the unsupported alias `Shadow1color1`. The provider task definitively failed, the recorder stopped, and the failure was verified as **uncharged**. Its private evidence was archived before the corrected official `1color1` request was made. The failed task supplied no published image or successful catalog record. The recipe schema and regression tests reject that alias. An ambiguous submission remains a different state and must never be retried blindly.

## Simulation and display

The interface labels these images as recorded virtual previews. A sample checkpoint reuses the actual lighter render and is explicitly labeled **simulated checkpoint**. Its progress and heatmap are computed from source/Light/chosen-target pixels, rather than assigned a demonstration percentage. The same image retains its virtual origin when serving that simulation.

The [measurement evaluation](../../docs/evaluation-measurement.md) reports the exact denominators, intermediate values, target-subtlety abstentions, and known lighting/occlusion limits. A generated-target comparison does not establish physical execution or satisfaction. Personal uploads and lip-enabled recipes cannot reuse this synthetic-source catalog. Legacy previews attach only to their original exact recipe contracts; current ladders and eye outputs use their separately pinned manifests.

Offline verification requires no provider key or paid request:

```sh
pnpm exec vitest run tests/youcam-recorded.test.ts tests/youcam-recorded-integrity.test.ts tests/eye-goal.test.ts tests/measurement-recorded.test.ts
```

The loader verifies manifest, source, recipe, and output hashes before attachment. Recording/publishing scripts are operator tools; ordinary app builds and sample browsing do not generate paid replacement images.
