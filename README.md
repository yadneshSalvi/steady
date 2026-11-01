# STEADY

**A makeup method that makes room for you.** Choose a look, confirm your tools and comfortable movements, then compare genuine YouCam targets. STEADY guides one step at a time, measures local image-color change toward your chosen stopping point, and changes the remaining method while preserving what you have already confirmed.

**[Open the studio](https://steady-taupe-pi.vercel.app)** · **Quick sample** opens the camera-free walkthrough in one click. Choose a method, compare Light / Build / Full, and measure a compact recorded blush pass against your target. See which part needs more color through a translucent heatmap and measured spatial guidance. **Explore the eye sample** demonstrates fine liner changing to warm, softly tapped shadow while keeping eye emphasis.

Round three passes local release checks: **479 unit/database tests** and **28 optimized browser tests**. Production verification is pending; the live release remains round two until that check completes.

## What the studio does

- Offers three cheek color families, optional lip color, and Defined eyes. Every method requires a comfortable movement and confirmed tools and products.
- Shows one shared color target with compact method choices. Cheek targets have Light, Build and Full; eye targets have Light and Full. The mirror keeps the active region target in an inset. Personal studios explicitly generate a missing selected target.
- Uses **Done with this step** to advance, whether or not you measure. Early finishing lives inside **Make this easier**. Measurement replaces the instruction card, with the heatmap aligned over the mirror guide.
- Captures a local baseline, detects landmarks on the exact checkpoint bitmap, and shows measured progress, a regional heatmap, and a method-specific next step. Changed pose, uneven light, occlusion signals, or an indistinct target produce a reason to pause the measurement.
- Prefers another tool or movement using the same product. A cream brush can replace fingertip taps; fine liner can become softly tapped shadow. Appearance or product changes are explained before acceptance.
- Saves private studios, measured numbers, and explicit confirmations. Local measurement frames stay in browser memory. A selected image is uploaded only through a separate consented photo or AI action.
- Includes optional image interpretation, instruction reading, bounded voice commands, and a brand-free tool/product/texture/shade note with copy and print controls.

## Run locally

Use Node 22.12 or later and pnpm 10.15.0, a dedicated development PostgreSQL database, and a private Vercel Blob store for personal sessions.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
# Configure development credentials; do not use the production database.
pnpm db:migrate
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Scripts follow Next.js environment precedence, including `.env.local`. The pinned MediaPipe runtime is copied from the installed package by `predev` and `prebuild`; the face model and fictional assets are included.

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm start                       # stop the development server first
pnpm test:e2e                    # against the local running application
```

The sample uses hash-verified recordings and never creates a fresh YouCam task. Fresh personal previews use durable reservations, a cached account-balance floor, and application/owner/IP limits. See [operations](docs/operations.md) for database integration checks and the separate private-upload browser test.

The round-three local release passes formatting, zero-warning lint, TypeScript, the optimized build, **479 unit/database tests across 39 files**, and **28 browser tests in 106.252090 seconds**. Browser checks include private upload/isolation/erasure, both desktop viewports, mobile access, direct step completion, and preserved session ownership. No fresh YouCam submission was made by the automated browser suite. [Release verification](docs/release-checklist.md) records exact results and preserves the earlier deployed releases.

## Evidence and limits

The measurement is experimental image-color change relative to a chosen virtual target, not product quantity, physical completion, or clinical assessment. Unchanged recorded Full targets measure 100%; lighter recordings produce intermediate values. Synthetic tests cover normalization, pose changes, abstention, and actual IMAGE/VIDEO model execution. No participant or makeup-artist study is claimed. Physical camera diversity and real application benefit remain unverified.

[Evidence & limits](https://steady-taupe-pi.vercel.app/evidence) centralizes provenance and limitations. The interface uses one plain **Sample** marker on each sample working screen or saved-method card, concise consent when a selected still or audio leaves the device, and one **Built with YouCam** footer credit. Per-image disclosure chips and repeated guidance notes are removed. Source, recipe, output and measurement identities remain recorded; alt text stays descriptive. The [measurement report](docs/evaluation-measurement.md) gives exact fixture results, abstention cases, timing scope, and reproducible checks. The app does not infer disability, diagnose conditions, score beauty, or transfer arbitrary references.

## Project guides

- [Judge walkthrough](docs/judging.md)
- [Architecture and invariants](docs/architecture.md)
- [Deployment, budgets, privacy, and recovery](docs/operations.md)
- [Engineering evaluation](docs/evaluation.md) and [selected-image AI evaluation](docs/evaluation-ai.md)
- [Media and model attribution](docs/asset-licenses.md)
- [Release verification and deployed commit](docs/release-checklist.md)

Credentials, plans, private captures, and execution artifacts remain outside version control. Public fictional inputs and recorded outputs have explicit source, recipe, and output provenance.
