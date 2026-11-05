# Development

[Documentation](README.md)

For running the app, see [Getting started](getting-started.md). Contributor and agent rules are in [AGENTS.md](../AGENTS.md).

## Stack

- **Backend:** Python 3.13.x, FastAPI, SQLite, Pillow, ffmpeg, and the OpenAI client. Optional tagging uses PyTorch and Ultralytics YOLO-World.
- **Frontend:** React 19, TypeScript 7, Vite, SCSS, TanStack Query for server data, and TanStack Router for navigation.
- **Integrations:** OpenAI-compatible model servers, ComfyUI, and AI-Toolkit; see [Configuration](configuration.md).

## Run with hot reload

Complete [setup](getting-started.md#install-and-run), then run `dev.bat` (or `.\dev.ps1`) on Windows, or `./dev.sh` on Linux/macOS. The launcher regenerates API files, starts the API at `http://localhost:18080` and Vite at `http://localhost:18081`, waits for both, and opens the browser. Vite proxies `/api` to the backend.

| Windows | Linux and macOS | Effect |
| --- | --- | --- |
| `-BackendOnly` / `-FrontendOnly` | `--backend-only` / `--frontend-only` | Start one server |
| `-NoBrowser` | `--no-browser` | Do not open the browser |
| `-NoReload` | `--no-reload` | Turn off API reload. Use it during long jobs, because a reload triggers job recovery and restarts resumable workers |
| `-Detach` | `--detach` | Exit once ready; stop later with `stop.bat` or `./stop.sh` |

Windows opens a console per server; Unix uses one terminal with `[api]` and `[ui]` prefixes. Windows also has `start-backend.ps1` and `start-frontend.ps1` to run one server in the current terminal.

Stopping the launcher stops its servers. Use the stop script for detached or directly started servers and leftovers, after stopping any supervising launcher.

`scripts/dev-common.ps1` and `scripts/dev-common.sh` share port defaults, environment precedence, dependency and build stamps, and leftover-process cleanup. Keep both implementations aligned, and never kill foreign processes to free a port.

### Development variables

| Variable | Default | Effect |
| --- | --- | --- |
| `DATAFORGE_PYTHON` | auto-detected | Interpreter for Unix setup; set it in the shell when running `./setup.sh` |
| `DATAFORGE_RELOAD` | on | Development API reload; `0`, `false`, `no`, `off`, or blank turns it off |
| `DATAFORGE_DISABLE_DOTENV` | off | `1`, `true`, `yes`, or `on` skips loading `.env` in the Python backend; used by tests and CI |
| `DATAFORGE_DISABLE_TAGGING` | off | `1`, `true`, `yes`, or `on` keeps the background tagger from starting; set by the E2E backend |

These are read at startup. Launcher options override the reload preference.

## Project layout

```text
backend/               API, media handling, captions, and persistence
  automation/          Job runners
  routes/              HTTP endpoints
  data/                SQLite, thumbnails, and models (gitignored)
frontend/              React UI
  src/shared/          Shared modules and generated API files
  e2e/                 Playwright end-to-end tests
  dist/                Production build (gitignored)
scripts/               Launchers, checks, generation, and Git hooks
docs/                  User and contributor documentation
comfy_workflows/       ComfyUI presets
comfy_fill_templates/  Generative fill workflows
ostris_templates/      AI-Toolkit training templates
llm_templates/         Local model chat templates
sample_media/          Example dataset
.agents/skills/        Shared agent skills (.claude/skills/ links to them)
.github/workflows/     CI: backend, frontend, and end-to-end jobs
.env.example           Commented app environment settings
setup / start / dev / stop (.bat, .ps1, .sh)   Launchers
```

## Generated code

`backend/schemas.py` defines the wire format and `backend/constants.py` the shared values. [`scripts/generate_types.py`](../scripts/generate_types.py) generates:

| File | Contents |
| --- | --- |
| `frontend/src/shared/types.ts` | Request/response types from OpenAPI |
| `frontend/src/shared/constants.ts` | `constants.SHARED_CONSTANTS` |
| `frontend/src/shared/wireGuards.ts` | Runtime guards for `schemas.GUARDED_WIRE_MODELS` |
| `frontend/src/test/colorAdjustCases.ts` | Python Adjust outputs used to verify the TypeScript pipeline |

These files are gitignored and must never be edited by hand. A fresh clone needs generation before the frontend can build. Setup, the launchers, and the checks regenerate them, writing only changed content. If you change schemas, constants, or the Adjust pipeline during development, rerun generation yourself. Frontend-only types belong with the module that uses them.

## Commands

Run from the project root. `<python>` means `backend/.venv/Scripts/python` on Windows or `backend/.venv/bin/python` on Linux/macOS.

### Checks

Before finishing code changes, run the checks:

```bash
<python> scripts/run_checks.py --fix
```

This generates API files, then runs formatting, lint, type checks, the comment, theme, and transition checks, and the backend and frontend tests. Backend tools include Ruff and ty; frontend tools include oxlint, Prettier, TypeScript, and Vitest. Tool configuration and pins live in each project's manifest. See [AGENTS.md](../AGENTS.md) for verification requirements; documentation-only changes need a content and diff review instead.

| Option | Effect |
| --- | --- |
| `--fix` | Apply formatting and lint fixes. If it changes files, the run finishes but fails so you review them; rerun afterwards |
| `--scope backend` / `--scope frontend` | Check one side, for isolated changes. Omit it for shared tooling or cross-stack changes. Frontend checks still need the backend venv for generation |
| `--lint-only` | Skip tests but keep type checks |
| `--e2e` | Also run the end-to-end tests after the frontend tests. Cannot be combined with `--lint-only` or `--scope backend` |
| `--no-coverage` | Skip coverage, which makes tests noticeably faster |

Each step prints one compact line; a failed step prints its output and stops the run. CI runs this runner for each side separately.

Tests run under coverage by default, and the run ends with one coverage line per side (coverage.py and Vitest's v8 provider). While coverage is on, Vitest's per-test timeout is 20s instead of 5s, because instrumentation slows the heaviest tests enough to time out; plain `npm test` keeps the 5s budget.

### Other commands

| Task | Command |
| --- | --- |
| API with reload | `<python> scripts/dev_server.py` (`--reload`, `--no-reload`, `--port`, `--host`) |
| Production server | `<python> scripts/prod_server.py` (`--port`, `--host`, `--access-log`); needs a UI build |
| UI build | `cd frontend && npm run build` (type check, then build) |
| Generate API files | `<python> scripts/generate_types.py` |
| Backend lint / type check / tests | `<python> scripts/run_lint.py` (`--fix`, `--check`) / `run_typecheck.py` / `run_tests.py` (`-v`) |
| Frontend lint / format / type check | `cd frontend && npm run lint` (or `lint:fix`) / `npm run format` (or `format:check`) / `npm run typecheck` |
| Frontend tests | `cd frontend && npm test`, or `npm run test:watch` |
| End-to-end tests | `cd frontend && npm run test:e2e`; install Chromium once with `npx playwright install chromium` |
| Check FFmpeg selection | `<python> scripts/check_ffmpeg.py` |
| Install Git hooks | `scripts/install-git-hooks.ps1` or `.sh` |

### CI and end-to-end tests

The **Checks** workflow has three jobs: backend, frontend, and end-to-end. All use the exact Python 3.13.12 release recorded in `.python-version`, as does Windows setup; local setup and server startup accept any final Python 3.13.x and reject other release series and prereleases.

- **Backend** runs the scoped checks against the pinned FFmpeg 7.1.5.
- **Frontend** generates files with Python, runs its scoped checks, and then `npm run build`. Vite reports asset sizes and gzip estimates in the build log.
- **End-to-end** runs separately from `run_checks.py` and the pre-commit hook. Locally, `run_checks.py --e2e` adds the suite to a full run.

The E2E suite drives Chromium against its own backend on port 18090 and Vite on 18091. It covers the gallery, inspector, toolbar, captioning jobs, caption backups, folder instructions, review queues, media editing and generative fill, the video editor and preview playback, the workflow inspector, notifications, quick actions, and LoRA training. Results do not depend on what runs on the machine:

- **No real services.** `scripts/e2e_backend.py` clears every app variable from the environment, answers vision requests with a stand-in model, and points ComfyUI and AI-Toolkit at a stub that refuses every request. Tagging is off, and the database and thumbnail cache are temporary.
- **One folder per run.** `frontend/e2e/runDirectory.ts` makes a `dataforge-e2e-*` temp folder with an owner marker. A run deletes only folders whose marker names a process that has exited, so the last run's fixtures stay for inspection until the next run, and two runs never delete each other's. Two runs at once still collide on the ports; the second fails to start.

## Agent workflows

[AGENTS.md](../AGENTS.md) holds the shared repository policy; [CLAUDE.md](../CLAUDE.md) imports it for Claude Code, and `.github/copilot-instructions.md` points to it as well. Model and reasoning-effort choices belong in the host application, not in repository instructions. The guidance is written for GPT-6.1 Sol and Claude Opus 5.5 without prescribing how either model plans, investigates, or implements a task.

Skills add repository-specific context for debugging, change review, API contracts, and UI verification. They load when relevant instead of imposing a workflow on every change.

| Host | Skill discovery | Explicit invocation |
| --- | --- | --- |
| Codex | Shared sources in `.agents/skills/` | `$debug-regression`, `$review-changes`, `$change-api-contract`, `$verify-ui` |
| Claude Code | Entry points in `.claude/skills/` link to the shared sources | `/debug-regression`, `/review-changes`, `/change-api-contract`, `/verify-ui` |

- The Claude entry points duplicate only discovery metadata; keep workflow guidance in the shared sources. When adding or renaming a skill, keep its name and description aligned in both places.
- Other tools that support `.agents/skills/` can use the shared sources too.
- New Codex skills appear on the next turn; restart the session if they do not. In Claude Code, check the `/` menu for the four commands.
- Choosing a skill stays the agent's judgment; repository checks and CI verify the resulting code.

For discovery behavior, see the official [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Claude skills](https://code.claude.com/docs/en/skills), and [Claude instruction imports](https://code.claude.com/docs/en/memory#import-additional-files) documentation.

## Reviewing documentation

When a change moves a control, changes what is kept or replaced, or touches startup and recovery text, check the user-facing wording too:

- **Moved controls:** search `docs/` for the old location and label, such as "toolbar gear".
- **History and retention:** the docs say what a new run keeps or replaces, and for how long.
- **Scope:** jobs and Review follow [one scope rule](user-guide.md#scope); link to it rather than paraphrasing it.
- **Recovery text:** in-app help and docs name the command for every platform, or link to [Getting started](getting-started.md).
- **Tables:** one fact per cell; move conditions and caveats into a sentence below the table.

## Versioning

Settings > About reads `version` from `backend/pyproject.toml`. The installed pre-commit hook runs the checks and bumps the patch version.

- **Minor or major release:** edit and stage the version yourself. The hook keeps a staged value that differs from the parent commit, so amending does not bump it twice. An unstaged manual edit is not overwritten.
- **Path-limited commits** (`git commit <paths>`): the post-commit hook stages the bumped version to keep the index aligned.
- **`--no-verify`** skips the bump.

Agents must follow AGENTS.md's rule against staging changes themselves.

User-facing changes get one entry under **Unreleased** in [CHANGELOG.md](../CHANGELOG.md); see AGENTS.md for when.

## Testing Unix launcher changes

PowerShell launchers can be tested on Windows. `bash -n` checks Unix syntax only; test behavior on Linux/macOS from a clean clone:

- Setup and production start succeed; stopping frees the port.
- Development hot reload works; `Ctrl+C` also stops uvicorn's reload child.
- Production start clears a leftover DataForge Vite listener.
- An unchanged build is reused; a frontend source change triggers a rebuild.
- A foreign process holding the UI port is identified and left running.
