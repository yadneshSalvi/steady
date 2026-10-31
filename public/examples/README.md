# Recorded YouCam previews

These nine images are genuine YouCam Makeup Virtual Try-On outputs generated on 31 October 2026 from the project's AI-created sample portrait. They are illustrative virtual targets. No participant applied makeup to create them, and they are not physical results or evidence of ability, comfort or task completion.

`recorded-samples.json` identifies the exact source bytes, full effect recipe, recipe checksum and native output checksum. Provider request and task identities are represented by SHA-256 digests. Raw provider IDs, signed download links and private storage paths are excluded. `generatedAt` records STEADY's output-ingestion time, rather than a timestamp supplied by YouCam.

All records are cheek-only, with optional lips switched off. Every request explicitly sets both `skinSmoothStrength` and `skinSmoothColorIntensity` to zero. Intensity and texture settings illustrate appearance choices; they do not establish physical product quantities or guaranteed application results.

The application verifies the pinned manifest, source, recipe and output checksums before attaching a matching record to the synthetic sample. Personal photos and recipes with lips enabled cannot reuse these images. The interface labels them **Recorded YouCam preview**.

Offline integrity verification needs no provider key and creates no paid task:

```sh
npx vitest run tests/youcam-recorded.test.ts tests/youcam-recorded-integrity.test.ts
```

See the sample source's [provenance record](../images/PROVENANCE.md). Rebuilding the catalog is an explicit operating action through `scripts/smoke-youcam.ts` and the offline `scripts/publish-recorded-samples.ts`; ordinary builds never require private smoke-test files.
