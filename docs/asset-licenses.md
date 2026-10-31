# Media, type, and model attribution

## Fictional sample photography

The four photographs in `public/images/` were created for STEADY using OpenAI `gpt-image-2` on October 31, 2026 with the generating account owner's authorized access. The portraits depict fictional adults; the workbench contains fictional unbranded objects. No participant, stock photograph, celebrity, or third-party reference was used. Publication is authorized by the generating account owner; no exclusive copyright or real-person endorsement is implied.

Exact prompts, dimensions, dates, and checksums are in [the provenance record](../public/images/provenance.json), with readable [usage guidance](../public/images/PROVENANCE.md). The baseline is a synthetic starting image, not a virtual cosmetic result. Inspiration images are synthetic and must not be presented as physical application evidence.

## Recorded YouCam outputs

The application ships **31 actual YouCam Makeup VTO outputs** for the same fictional baseline:

| Catalog                                     | Outputs | Manifest                                                          |
| ------------------------------------------- | ------: | ----------------------------------------------------------------- |
| Original method previews, recipe revision 2 |       9 | [recorded-samples.json](../public/examples/recorded-samples.json) |
| Cheek intensity ladder, recipe revision 3   |      18 | [recorded-ladders.json](../public/examples/recorded-ladders.json) |
| Defined-eyes liner/shadow targets           |       4 | [recorded-eyes.json](../public/examples/recorded-eyes.json)       |

They are recorded virtual previews, not fresh requests or physically applied outcomes. The manifests retain source, full effect recipe, recipe/request/task/output digests, timestamps, dimensions, and provenance. Raw task IDs and temporary provider URLs remain private. [The complete recorded-output provenance](../public/examples/PROVENANCE.md) distinguishes the legacy and current recipes, exact source, successful batches, and one failed uncharged shadow request.

The loader verifies the pinned manifest checksum, original source bytes, normalized recipes, and output hashes before attachment. Personal uploads, unsupported sources, and lip-enabled recipes do not fall back to these examples. Output colors were not edited to exaggerate the provider effect.

The original nine recipes and images retain their published identities. Their method-specific intensities are not relabeled as Light/Build/Full. The newer cheek catalog uses 25/45/65, and the eye catalog uses 25/65. Both smoothing fields are zero in every shipped request. An interface may use a lighter recorded output as a **simulated checkpoint** against a larger recorded target; that reuse does not turn the render into an actual capture or evidence of successful makeup application.

The account owner authorized this integration demonstration and publication of the fictional sample's outputs. Provider service terms still apply; no real-person endorsement, artist review, physical accessibility benefit, or exclusive ownership of provider technology is implied.

## Fonts and icons

- Instrument Serif, copyright the Instrument Serif Project Authors: SIL Open Font License 1.1. Regular, italic, and [license](../public/fonts/InstrumentSerif-OFL.txt) are included.
- Manrope: SIL Open Font License 1.1. Variable font and its full copyright [license](../public/fonts/Manrope-OFL.txt) are included.
- Lucide icons: the pinned `lucide-react` package's ISC license applies.

Fonts are self-hosted; no remote font request is needed.

## On-device face model

Google's MediaPipe Tasks Vision package is pinned to `1.2.0`. The official Face Landmarker float16 bundle version 1 is included unchanged at `public/models/face_landmarker.task`, SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.

The upstream [MediaPipe Apache 2.0 license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE) is included [locally](../public/models/MediaPipe-APACHE-2.0.txt). Google's [Face Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker) links the model cards and limitations. The exact [official bundle URL](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) is pinned rather than resolving `latest` at runtime.

The browser runtime is copied from the pinned npm package during build and served locally. No ownership claim is made over upstream models, fonts, icons, or provider software. Package-specific notices remain with their dependencies.

`tests/fixtures/sample-landmarks.json` records an actual IMAGE/CPU invocation of that pinned model on the fictional source, including source/model checksums. It is a synthetic-source engineering fixture rather than participant biometric research data. Live users' baseline/checkpoint pixels and landmark geometry are not automatically published or persisted by the measurement flow.

## Technical reference fixtures

The selected official eyeliner/eyeshadow catalog entries are retained in `src/lib/youcam/fixtures/eye-patterns.json` with source and excerpt checksums. Recipe/schema names derive from their exact labels, `HalfRim19` and `1color1`. The excerpt is reference material from the provider's [Makeup VTO catalogs](https://docs.makeupar.com/reference/makeup_vto); it is not an original STEADY pattern or a cosmetic technique validation.

The 34 numeric CIEDE2000 reference cases in `tests/fixtures/ciede2000.txt` come from Gaurav Sharma, Wencheng Wu, and Edul N. Dalal's [implementation notes and supplementary data](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/), Color Research & Application 30(1), 21–30 (2005). They verify color-difference mathematics and provide no evidence about real-user cosmetic outcomes.
