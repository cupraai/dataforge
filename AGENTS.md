# Agent instructions

## Working approach

- Complete the requested outcome and necessary verification. Choose planning, investigation depth, and tools to suit the task; expand the investigation when useful, while keeping edits focused.
- Inspect the existing diff and preserve user changes. Never stage changes yourself to Git. Report unrelated defects without expanding the task to fix them.
- Reuse findings and passing checks unless changes or new evidence warrant another look. Keep updates and the final response concise: outcome, verification, and unresolved issues.

## Engineering

- Prefer the simplest robust solution, considering maintenance, runtime, dependencies, and review burden.
- Reproduce reported bugs when feasible and prefer behavioral regression tests. Record verification limits when reproduction or automation is impractical.
- Use comments for non-obvious contracts or rationale; remove obsolete explanations in touched code. `scripts/check_comments.py` limits comment lines to 100 characters.
- Use neutral fixtures and examples. Do not add personal data, machine-specific paths, private project/dataset names, or secrets to source.
- Never manually modify TODO.md or generated files. `backend/schemas.py` owns the wire format; `backend/constants.py` owns shared values. Regenerate frontend API files with `scripts/generate_types.py` or the checks runner.
- When a change introduces a user-facing feature or fixes a critical bug, add one entry under `## Unreleased` in CHANGELOG.md (`### Added`, `### Changed`, `### Fixed`, or `### Removed`). Describe the effect for the user, not the implementation; skip refactors, tests, tooling, and minor fixes. Never edit released sections.
- Follow existing lint and formatting rules. Import directly instead of adding re-export barrels. Use `@/shared/lib/classNames` for conditional classes.
- Format names: lowercase wire values (`"yaml"`), dotted lowercase suffixes (`".txt"`), uppercase user-facing formats (`YAML`). Keep displayed filename suffixes dotted lowercase. Use `CAPTION_SIDECAR_EXTENSION_LIST` to list caption sidecars.
- Use `...` for UI labels, messages, logs, and console output; reserve `…` for truncated text. Preserve syntax such as spreads and `tuple[str, ...]`.

## Verification

- Run commands from the project root using `backend/.venv/Scripts/python` on Windows or `backend/.venv/bin/python` on Linux/macOS.
- Before finishing code changes, run `scripts/run_checks.py --fix` with `--scope backend` or `--scope frontend` when isolated; omit scope for shared tooling or cross-stack changes. Review fixer changes and rerun if auto-fixes return a failure.
- `--lint-only` skips tests but retains type checks; use for changes that do not affect runtime behavior. Documentation-only changes need a content/diff review, not the code suite.
- For UI changes, inspect the affected UI and run relevant covered E2E tests with `npm run test:e2e` from `frontend/`; the checks runner includes them only with `--e2e`. See `docs/development.md` for setup when needed.
- Fix failures caused by the task. Report unrelated failures and blockers without weakening checks. Inspect the final diff before reporting completion.

## Task skills

Skills in `.agents/skills/` supply task-specific repository context. Let native discovery select
relevant skills and use the guidance that helps the task; skills are not mandatory pipelines.
Claude entry points in `.claude/skills/` link to the same source. Paths in shared skill bodies
are relative to the repository root unless stated otherwise.
