---
name: verify-ui
description: Implement or verify UI behavior, layout, and accessibility changes using component tests and the repository's isolated browser suite.
---

# Verify a UI change

Choose the user action and visible outcome to verify. Use colocated component or hook tests
for local behavior and browser tests for interactions that depend on layout, focus, scrolling,
media playback, or navigation.

## Browser setup

Read `docs/development.md#ci-and-end-to-end-tests` and `frontend/playwright.config.ts`
when setting up the browser suite. It starts its own backend and Vite servers on ports
18090 and 18091, separate from the normal development ports.

The E2E backend uses temporary data and stand-in services. Do not point it at a user's
dataset or use real model, ComfyUI, or training servers. Runs use fixed ports, so run
browser suites sequentially rather than starting competing suites.

From `frontend/`, run the affected spec with
`npm run test:e2e -- e2e/<affected-spec>.spec.ts`.
Install the configured Chromium browser only if it is missing, as documented in the
development guide. Follow `AGENTS.md` for the required final checks.

## Visible checks

Inspect the changed screen in a browser, including keyboard and focus behavior when the
changed control is interactive. Check the relevant loading, empty, error, or recovery
state when the change affects it; a screenshot of the success state cannot verify these.

Use accessible roles, names, and user actions in browser assertions where possible.
For moved controls or changed retention behavior, review the related user-guide wording.
Report what was observed directly, which tests ran, and any unavailable UI inspection.
