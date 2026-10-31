# AI assistance: implemented behavior and evaluation

STEADY uses **Gemini 4 Argon** for selected-image understanding and **GPT-6 Astra** as an alternative when the primary provider is unavailable or returns an invalid response. Model availability was checked against both account APIs on October 31, 2026. Both models were also called successfully with project images; discovery alone was not treated as proof of usable image input.

## Implemented boundaries

- **Inspiration analysis:** maps visible cheek/lip color intent into the three supported palette families. The response explains approximations and unsupported details. The person confirms the suggestion. This is not arbitrary makeup transfer.
- **Tool recognition:** suggests supported visible tool/product categories. Ambiguous or absent items stay unselected. Recognition does not establish product ingredients, safety, hygiene, authenticity, or physical availability.
- **Checkpoint assistance:** compares two selected actual captures for a tentative cosmetic observation. It can abstain when lighting, framing, visibility or exposure is unsuitable. An optional action must match a server-supplied allowed action ID in the relevant region. The model cannot advance a step or declare physical completion.

Live camera frames remain in the browser. Selected stills are normalized, EXIF metadata removed, and image dimensions limited before analysis. The calling route must verify ownership and consent for Google Gemini/OpenAI processing. Results identify the model actually used. No raw model error body, selected image, or credential is logged by the adapter. The OpenAI request sets `store: false`.

Structured JSON schemas and local validation restrict outputs. In-image text is treated as untrusted content. A malformed primary response can fail over; an invalid image is rejected before any provider request. Identical checkpoint files return insufficient evidence locally because they cannot show an intervening change.

## Observed synthetic probes

The first live run used the fictional portraits documented in [asset provenance](../public/images/PROVENANCE.md). These are engineering probes, not independent human labels or a representative accuracy benchmark.

| Probe                                                        | Observed result                                                                                                                                                                             | Model / elapsed time         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Muted berry inspiration                                      | Described pink cheeks and rose-mauve lips, selected the closest rose family, and stated approximation limits. The generated filename is not ground truth; the visible palette is ambiguous. | Gemini 4 Argon / 7.7 s       |
| Terracotta inspiration                                       | Selected terracotta and identified warm lighting as a source of uncertainty.                                                                                                                | Gemini 4 Argon / 7.6 s       |
| Face portrait submitted as a workbench                       | Returned no tools or products; requested a workbench photo.                                                                                                                                 | Gemini 4 Argon / 5.1 s       |
| Identical checkpoint image                                   | Returned insufficient evidence without a model call.                                                                                                                                        | Local integrity check / 1 ms |
| Deliberately darkened checkpoint                             | Abstained because the second image was severely underexposed.                                                                                                                               | Gemini 4 Argon / 5.9 s       |
| Brightness/saturation change without makeup application      | Abstained because the images had different exposure.                                                                                                                                        | Gemini 4 Argon / 7.2 s       |
| Independent alternative-provider tool probe on face portrait | Returned no tools or products.                                                                                                                                                              | GPT-6 Astra / 7.4 s          |
| Synthetic workbench with three visible items                 | Suggested sponge, wide brush and the pot labeled “CREAM BLUSH”; asked the user to confirm each item and verify the product label.                                                           | Gemini 4 Argon / 6.4 s       |

The observed timings are individual local-request measurements, not latency guarantees. Private execution artifacts retain the exact responses, timestamps and source hashes. No participant images were used in these runs.

The adapter's nine unit tests exercise unsupported-file rejection, schema validation and provider failover, safe error messages, unknown inspiration, duplicate tool suggestions, identical-image abstention, image comparability, and rejection of invented action IDs. These tests verify software boundaries; they do not establish model accuracy.

## Reproduce

```sh
pnpm exec vitest run tests/vision-assistant.test.ts
NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/vision-smoke.ts
NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/vision-smoke.ts --confirm-live
VISION_PRIMARY_PROVIDER=openai NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/vision-smoke.ts --confirm-live --case portrait-is-not-workbench
```

The command without `--confirm-live` performs no inference. Live runs use OpenAI/Gemini credentials and **no YouCam units**. Configure `GEMINI_VISION_MODEL`, `OPENAI_VISION_MODEL`, and `VISION_PRIMARY_PROVIDER` on the server when deliberately changing models; record and reevaluate a model change. `VISION_REQUEST_TIMEOUT_MS` is bounded to 10–40 seconds per provider, default 35 seconds, so a sequential fallback fits the 90-second API route budget.

## What this evidence supports

These observations demonstrate a working multimodal integration and several useful abstention behaviors on synthetic inputs. They do not demonstrate calibrated cosmetic quality, accessibility benefits, independent physical completion, clinical outcomes, or comparative improvements for real people. Production text presents observations as tentative and preserves manual decisions.

No participant or artist study was performed. The project is being evaluated with software checks, synthetic scenarios, real provider integration and browser testing. Actual-user research remains future evidence, not a release prerequisite or a claimed result.

References: [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [OpenAI models](https://developers.openai.com/api/docs/models), [OpenAI image input](https://developers.openai.com/api/docs/guides/images-vision).

## Browser integration checks

The local in-app browser was used to exercise the complete interface with generated fixtures on 2026-10-31:

- A terracotta inspiration reference was uploaded through the picker and submitted after image-analysis consent. The live API returned terracotta, visible color attributes and limits involving lighting, exact shade and unsupported brow/lash details. The existing rose selection remained unchanged until **Use this interpretation** was clicked.
- A generated inventory photo produced sponge, broad brush and cream-blush suggestions. None was selected automatically. Confirming only sponge and cream blush yielded a single feasible sponge method; the unconfirmed brush was excluded.
- A generated adult portrait was uploaded through the personal-photo path to test private Blob storage and session creation. This is a synthetic engineering fixture, not a participant baseline or physical result.
- A separate labeled sample completed its first cheek step, changed the remaining method from brush to sponge, survived reload in a paused state, resumed at step 2 of 2, completed and saved a sample method. The result page retained its synthetic-walkthrough label and did not claim an actual outcome.

These checks verify integration and state transitions. They do not expand the evidence claims above.

The personal-path synthetic fixture also completed one actual YouCam request through the local browser, durable workflow and private output ingestion (one attempt, success, no retry). The observed account balance moved from 1,030 to 1,029 units. This result is a provider-generated appearance preview of a fictional source.

For the in-app camera check, a temporary document-scoped `getUserMedia` substitute first returned a permission-denied error, then supplied a canvas video of the fictional portrait. Text guidance remained available after denial. The actual MediaPipe worker produced a face-anchored cheek guide; Pause removed it. A selected frame was saved privately and sent for AI checkpoint analysis after separate consent. The response described the cheek as essentially unchanged, and did not advance the instruction. This validates simulated input and app behavior, not physical camera performance or makeup application. The stream was stopped and the test substitution removed by reloading the document.
