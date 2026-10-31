# STEADY

**A makeup method that makes room for you.** STEADY turns an appearance goal, the tools a person confirms, and the movements they find comfortable into a small set of usable cosmetic methods. They compare genuine YouCam appearance previews, follow one instruction at a time, and change the remaining method without erasing what they have already confirmed.

The studio uses a warm cream and forest editorial identity, deliberate controls, readable instructions, optional speech, and an unretouched local camera. This is a working Next.js application with private persistence and real provider integrations.

## Start locally

Use Node 22.12 or later and pnpm 10.15.0. PostgreSQL and a private Vercel Blob store are required for persistent personal sessions. The database must be dedicated to this application.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill local server credentials and a development DATABASE_URL.
pnpm db:migrate
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Migration and smoke scripts load Next.js environment precedence, including `.env.local`. Public sample assets and model files are included; the pinned MediaPipe browser runtime is copied from the installed package by `predev` and `prebuild`. No private planning files are needed.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e                 # local server in another terminal
pnpm build
pnpm start                   # production server, after stopping pnpm dev
```

## Implemented capabilities

- Three supported color families, optional lip color, and distinct tap, sweep, and sponge methods when confirmed movements, tools, and products permit them.
- Optional inspiration interpretation and tool suggestions using Gemini 4 Argon with GPT-6 Astra fallback. The user confirms each suggestion; an image does not establish motor ability or tool ownership.
- Owner-bound private photos, durable sessions, optimistic revision checks, saved methods, and fresh reuse without inherited completed steps or photos.
- Real asynchronous YouCam Makeup VTO with explicit zero skin smoothing, database budget reservations, durable workflows, exact source/recipe binding, and private output ingestion.
- Clearly labeled recorded YouCam previews for the exact fictional sample, with source and recipe hashes.
- On-device MediaPipe placement guides, optional browser instruction reading, and optional six-command voice control through short Deepgram audio clips.
- Manual or AI-assisted selected-still checkpoints, explicit user confirmation, pause/resume, adaptation of remaining steps, final photos and self-assessment, and deletion.

## Scope and evidence

The implemented catalog focuses on broad cheek color and an optional lip step. It does not perform arbitrary makeup transfer, diagnose conditions, score beauty, or establish physical accessibility. Camera guides indicate an approximate region; neither a generated target nor an AI observation completes a physical action.

No participant or artist study was performed. Software tests, actual API calls, synthetic scenarios, and browser checks are the release evidence. Real-user research is future evidence, not a claimed result or a release gate. See [evaluation](docs/evaluation.md) and the [live AI evaluation](docs/evaluation-ai.md).

## Project guides

- [Judge walkthrough](docs/judging.md)
- [Architecture and invariants](docs/architecture.md)
- [Deployment, budgets, privacy, and recovery](docs/operations.md)
- [Media and model attribution](docs/asset-licenses.md)
- [Release checks](docs/release-checklist.md)

Credentials, local planning, execution artifacts, and private captures stay outside version control. Public fictional media has explicit [provenance](public/images/PROVENANCE.md).
