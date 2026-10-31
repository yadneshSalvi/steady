# STEADY implementation guidance

- This is an independent project repository. Keep all application changes inside this repository unless a task explicitly requests otherwise.
- Read the local `plans/` documents when available before beginning implementation. They describe the approved product direction and proposed implementation. Planning material is intentionally untracked; public builds and deployment must never require it.
- Preserve `.env` and any existing credentials. Do not print secret values, embed them in client bundles, or commit them. `.env.example` contains placeholders only.
- Keep `plans/`, `.env`, and environment overrides ignored. Stage explicit files and verify the staged paths before commits or pushes.
- Treat proposed capabilities and validation targets as unverified until demonstrated. Distinguish actual provider results, recorded results, synthetic fixtures, and real participant outcomes.
- Follow official YouCam endpoint schemas, asynchronous task behavior, and observed API responses. Do not infer physical fit, clinical efficacy, or other unsupported measurements from generated appearance previews.
- Build a coherent, accessible experience with deliberate typography, spacing, motion, and complete loading, recovery, empty, and error states. Follow this project's own art direction rather than a generic dashboard template.
- Keep server credentials, private uploads, and provider operations behind appropriate server boundaries. Verify current framework and deployment limits before implementation.
- Use meaningful integration, accessibility, and end-to-end verification for the workflows being built. Document actual commands and results as the application takes shape.
- Add public setup, operating, and judge-access instructions with the implementation. No package manifest or runnable app exists at bootstrap.
