---
name: debug-regression
description: Diagnose and fix reproducible bugs or failing tests in this repository. Use for regressions, crashes, incorrect results, and intermittent failures.
---

# Debug a regression

Start with the failing input, action, and expected result. Follow the affected path from a
frontend feature through its API client to the backend route or worker as needed. Use the
observed failure to choose which layer to inspect.

## Repository-specific reproduction

- Backend tests are `unittest` modules directly under `backend/test_*.py`, not a pytest suite
  in `backend/tests/`. The runner at `scripts/run_tests.py` calls
  `testing_fixtures.isolate_test_database()` before discovery. Preserve that isolation when
  running a focused reproduction; inspect the relevant test's fixture setup.
- Frontend unit and component tests are colocated as `*.test.ts` and `*.test.tsx`.
  Browser regressions belong in `frontend/e2e/` when they depend on real browser behavior.
- If the frontend cannot import generated API modules, check generation and the backend
  environment before treating that setup failure as the reported bug.
- For model-server, ComfyUI, or training failures, reuse existing test doubles and neutral
  temporary fixtures. The E2E backend deliberately refuses real external-service requests.

Use a regression test that distinguishes the reported failure from correct behavior.
For timing-sensitive failures, record the triggering sequence and check stale responses,
cancellation, or worker recovery only when the evidence points there.

After the fix, verify the original reproduction and relevant boundary cases. Follow
`AGENTS.md` for final checks and report any part of the reproduction that remains unverified.
