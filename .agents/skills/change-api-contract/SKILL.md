---
name: change-api-contract
description: Change API request or response payloads, shared constants, or generated wire guards across the Python backend and TypeScript frontend.
---

# Change an API contract

Identify the affected route, schema, and frontend consumers before changing a wire value.
Keep request semantics separate from response serialization, especially optional versus
nullable fields, defaults, and enum values.

## Sources and consumers

- `backend/schemas.py` owns the wire models. `backend/constants.py` owns shared values;
  inspect `SHARED_CONSTANTS` when a constant must reach the frontend.
- `EXTRA_WIRE_MODELS` includes models that need generation outside the ordinary OpenAPI
  reachability path. `GUARDED_WIRE_MODELS` chooses models needing generated runtime guards.
  Update these registries only when the changed model requires it.
- `scripts/generate_types.py` generates frontend `types.ts`, `constants.ts`,
  `wireGuards.ts`, and `src/test/colorAdjustCases.ts`. Inspect the relevant generator
  path if the output differs from the intended contract; do not patch the output.

Change the owning schema or constant and update its producer and consumers together.
Use the project's venv interpreter from `AGENTS.md` to run
`scripts/generate_types.py`, then inspect the affected generated definitions even though
they are gitignored.

Verify representative serialized values at the backend boundary and their frontend use.
Start with `backend/test_schemas.py` and the affected route/client tests where relevant.
A type check alone cannot prove the server returns the promised shape.

Treat this as a cross-stack change for the checks required by `AGENTS.md`. Update user
documentation when accepted inputs or visible behavior change.
