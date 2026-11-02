---
name: review-changes
description: Review a diff, branch, or pull request for actionable defects and regressions in this repository. Use for review requests rather than ordinary implementation.
---

# Review changes

Establish the requested comparison and inspect its diff, including relevant new files.
Trace changed behavior into immediate callers and consumers where needed. A review request
does not by itself request fixes.

## Review priorities

- For API changes, compare the backend schema, actual returned values, frontend consumers,
  and any runtime guards. Account for absent fields, null values, defaults, and wire enums.
- For media and sidecar operations, check which files are kept, replaced, or deleted,
  including partial failure and retry behavior when those paths change.
- For job and UI changes, inspect the affected cancellation, recovery, selection, and stale
  response paths. Follow the changed state transition rather than surveying all subsystems.
- For launcher changes, check the Windows and Unix implementations together. Syntax checks
  alone do not establish process ownership, port cleanup, or shutdown behavior.
- Compare tests with the user-visible contract. Passing tests do not settle a case they
  never exercise; formatting issues already covered by tooling need no speculative finding.

Report concrete defects introduced by the reviewed change, with a short triggering scenario,
impact, and a precise location. Separate demonstrated problems from open questions, and do
not turn unrelated pre-existing issues or optional refactors into findings.

If there are no actionable findings, say so and state material verification limits.
