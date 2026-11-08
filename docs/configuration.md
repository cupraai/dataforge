# Configuration

[Documentation](README.md)

Use **Settings** (`Ctrl+,`) to connect services and tune AI jobs. Browsing, manual captioning, editing, and local checks need no model and no `.env` file. Environment variables cover startup options and supply defaults for Settings; see [How settings are loaded](#how-settings-are-loaded). Integration-specific options are in the [ComfyUI](comfyui.md#connect-comfyui) and [AI-Toolkit](ai-toolkit.md#connect-ai-toolkit) guides.

## Settings dialog

| Section | Contains |
| --- | --- |
| **Appearance** | **Color scheme:** Light, Dark, or System, previewed before saving; Quick actions can also switch it. **Gallery:** caption length on large and small cards, megapixels, aspect ratio and tags on large cards, which [card actions](user-guide.md#find-files) appear on hover, and the list's caption preview. **Editor:** line wrapping, line numbers, spell checking and its language, and word suggestions |
| **Vision model** | **Server:** connection and limits. **Sampling:** separate Reasoning and Instruct profiles. **Media input:** image and video budgets |
| **Tagging** | Turning [tagging](user-guide.md#tags) on, its status, files still waiting, minimum confidence, Re-tag everything, and your own vocabulary terms |
| **Integrations** | ComfyUI URL, [generative fill](comfyui.md#generative-fill) model files and steps, and AI-Toolkit URL. Each service has **Test connection** |
| **Storage** | Thumbnail-cache size and limit; **Clear cache** (thumbnails regenerate as you browse) |
| **Data & history** | Job and notification retention; **Clear** for recent folders, recent quick actions, per-folder job options, and per-folder display modes |
| **About** | Version, runtimes, GPU, and storage/config paths; **Copy diagnostics** leaves out the API key |

- **Save** applies edited fields without a restart. A dot on a section marks unsaved changes.
- **Cancel** discards field changes, including a previewed color scheme.
- Each field shows whether its value is saved, comes from the environment, or is the default. **Reset**, then **Save**, removes a saved value.
- **Clear** actions apply immediately, even if you then cancel. They clear app history and cache, never dataset media or captions.

A running AI job keeps the connection it started with, while other settings can change during processing. Finish or cancel it before retuning.

## Connect a vision model

Auto-caption and Verify captions need an OpenAI-compatible chat-completions server that accepts images. Edit captions sends text only, unless **Send media** is on. Install and run the model server separately, then:

1. Open **Settings > Vision model > Server**.
2. Enter the API URL, including `/v1`, and a key if the server requires one. The default URL is `http://127.0.0.1:8888/v1`.
3. Select **Test connection**. It tests the entered address and key and lists the model ids the server reports.
4. Choose the server's model id, then **Save**. The default `qwen38` is only an id, not a model download.
5. Open your dataset and use **Create instructions** to write a system prompt, or inherit one from a parent folder. Run Auto-caption on a small selection first.

The connection test only checks the server's model list; it does not prove that image or audio input works. A saved key is never displayed again. If the key field is blank during a test, the saved or environment key is used.

**llama.cpp** needs the model in GGUF format and its matching multimodal projector, which lets the model see images. Load both:

```bash
llama-server --port 8888 -m <model.gguf> --mmproj <mmproj.gguf>
```

Some download-based llama.cpp setups load the projector automatically; see its [multimodal instructions](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md). If the server uses `--api-key`, enter the same key in Settings.

### Tested models

**Qwen3.8 27B is the recommended starting point.** For llama.cpp, try the `UD-Q4_K_XL` [GGUF quantization](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF). Quantization reduces the memory the weights need; leave room for context and media input as well.

| Model | When to choose it | Setup notes |
| --- | --- | --- |
| [Qwen3.8 27B](https://huggingface.co/Qwen/Qwen3.8-27B) | Default recommendation for image and video captioning | Start in Reasoning; the bundled template supports low, medium, and xhigh effort |
| [Qwen3.6 35B A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) | Recommended mixture-of-experts (MoE) alternative | Activates about 3B of its 35B parameters per token, but memory must still hold all the weights. Supports Reasoning and Instruct |
| [Qwen3 VL 8B Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) | Smaller model for limited memory | Use Instruct; choose a quantization that fits alongside the media and context budget |
| [Qwen3-Omni 30B A3B Instruct](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct) | Captions video audio as well as frames | Use Instruct and turn on Caption audio; the server must accept `input_audio` parts |
| [Gemma 4 31B](https://huggingface.co/google/gemma-4-31B-it) / [26B A4B](https://huggingface.co/google/gemma-4-26B-A4B-it) | Alternative dense / MoE models | Start with Instruct and repeat penalty `1.1`. The bundled template also supports thinking, but ignores effort |

Community variants of [Qwen3.8 27B](https://huggingface.co/HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF) and [Qwen3.6 35B A3B](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive) aim to reduce refusals. Check their captions on a small, representative selection before a full run.

Load the matching projector and a compatible chat template for your model. Templates for Qwen3.8, Qwen3.6, and Gemma 4 are in [`llm_templates/`](../llm_templates/). Hardware needs depend on quantization, context, and media budgets; DataForge itself needs no GPU.

### Vision model settings

All of these are under **Settings > Vision model > Server**, except `OPENAI_TIMEOUT`, which is environment-only.

| Variable | Default | Accepted value / effect |
| --- | --- | --- |
| `OPENAI_API_BASE_URL` | `http://127.0.0.1:8888/v1` | HTTP(S) URL of the OpenAI-compatible API, including `/v1` |
| `OPENAI_API_KEY` | `EMPTY` | Nonempty key, at most 500 characters, without whitespace. `EMPTY` is the placeholder for no key |
| `OPENAI_MODEL` | `qwen38` | Nonempty model id, at most 200 characters; use the server's id |
| `OPENAI_MAX_TOKENS` | `16384` | Integer ≥ 1; response cap, including any reasoning the server counts |
| `OPENAI_TOP_K` | `20` | Integer ≥ 0; server-specific top-k sampling |
| `DRAFT_CAPTION_THRESHOLD` | `256` | Integer ≥ 1; caption length in characters, used by Auto-caption only |
| `OPENAI_TIMEOUT` | `600` | Positive seconds per response; nonpositive or malformed values use the default |

**Draft caption threshold** decides what Auto-caption does with each file:

| Existing caption | Auto-caption |
| --- | --- |
| None or empty | Writes one from the media alone |
| Up to the threshold | Treats it as a draft and expands it |
| Longer than the threshold | Skips it (`skipped_long`) |

A generated caption at or under the threshold is retried, and reported as `too_short` if every attempt is too short. For longer captions, raise the threshold and make sure the system prompt asks for enough detail. Verify captions and Edit captions ignore the threshold.

Each model call gets up to three attempts, with a 10-second connection timeout.

## Media input budgets

Tune **Settings > Vision model > Media input** when captions miss detail, or when requests exceed GPU memory or context (how many input and response tokens the model can handle). Adjust these before sampling: more frames and pixels use more memory and context.

| Problem | Change |
| --- | --- |
| Images miss fine detail | Raise **Image pixel budget** |
| Short clips exhaust memory | Lower **Frame pixel budget, short clips**, for example to `262144` |
| Long clips still exhaust memory | Also lower **Frame pixel budget, long clips**, which sets the resize floor |
| Brief actions disappear in long clips | Raise **Max keyframes** |
| Short clips need more samples | Raise **Keyframes per second**; it helps only below the cap |
| Short clips miss fine detail | Raise **Frame pixel budget, short clips** |

### Defaults and sampling rules

All five are positive integers under **Settings > Vision model > Media input**. They apply to Auto-caption and Verify captions. Originals never change; request images are converted to JPEG.

| Variable | Default | Controls |
| --- | --- | --- |
| `IMAGE_MAX_PIXELS` | `1500000` | Pixel budget for a still, or a GIF's first frame |
| `VIDEO_KEYFRAMES_PER_SECOND` | `2` | Requested frames per second, before the cap |
| `VIDEO_MAX_KEYFRAMES` | `42` | Maximum frames sent per video |
| `VIDEO_FRAME_MAX_PIXELS` | `500000` | Per-frame pixel budget for clips up to 7 seconds |
| `VIDEO_FRAME_MIN_PIXELS` | `262144` | Per-frame budget for clips of 20 seconds or more, and the basis of the per-side size floor |

**Frame count.** For a known duration, DataForge requests `min(max(fps × ceil(seconds) + 2, 8), max_keyframes)` evenly spaced frames, including both ends. The maximum may be set below 8. An unknown duration uses 8 frames. At the defaults, the cap is reached at 20 seconds, so a two-minute clip also sends 42 frames. A video with fewer decodable frames sends fewer.

**Frame size.** The per-frame budget is the short-clip value up to 7 seconds, then falls linearly until 20 seconds to the smaller of the two budgets. A picture over its budget is shrunk to fit: each side is rounded down to a multiple of 32, but never below a floor of `sqrt(VIDEO_FRAME_MIN_PIXELS)`, rounded down to the same grid and kept between 32 and 512 pixels. Stills follow the same resize rule. A picture already within its budget is sent at its original size.

At the default floor, a 1920 × 1080 frame becomes 928 × 512 with a 500,000-pixel budget, 640 × 512 at 250,000, and 512 × 512 at 125,000. As these show, the floor can exceed the budget and change the aspect ratio; to shrink frames below it, lower the long-clip budget as well as the short-clip one. Actual vision-token use depends on the model and server, not on frame counts alone.

### Audio

**Caption audio** sends the first 15 seconds of a video's first audio track as 16 kHz mono WAV, in the same request as its frames. There is no audio budget setting. The server and model must accept OpenAI `input_audio` parts; a vision-only setup may reject or ignore them.

The job requires ffmpeg. A video without audio is still captioned from its frames, and the result notes that it had no audio. Images, GIFs, and Verify captions never send audio.

## Sampling

Tune sampling last, once the connection and media budgets work. Reasoning and Instruct each have their own profile under **Settings > Vision model > Sampling**; top-k is shared and lives under **Server**.

| Reasoning variable | Default | Instruct variable | Default | Range / meaning |
| --- | --- | --- | --- | --- |
| `OPENAI_THINKING_TEMPERATURE` | `1.0` | `OPENAI_INSTRUCT_TEMPERATURE` | `0.7` | 0–2; randomness, lower is more predictable |
| `OPENAI_THINKING_TOP_P` | `0.95` | `OPENAI_INSTRUCT_TOP_P` | `0.8` | 0.01–1; probability mass kept for sampling |
| `OPENAI_THINKING_MIN_P` | `0.0` | `OPENAI_INSTRUCT_MIN_P` | `0.0` | 0–1; drops tokens far less likely than the best one; 0 disables it |
| `OPENAI_THINKING_PRESENCE_PENALTY` | `0.0` | `OPENAI_INSTRUCT_PRESENCE_PENALTY` | `1.5` | −2–2; positive values discourage returning to concepts already mentioned |
| `OPENAI_THINKING_REPEAT_PENALTY` | `1.0` | `OPENAI_INSTRUCT_REPEAT_PENALTY` | `1.0` | 0–2; 1 disables it and leaves the parameter out |

**What reaches the server:**

- Min-p and top-k are sent in `extra_body`.
- The repeat penalty is sent as `repeat_penalty`, the llama.cpp name. A server expecting `repetition_penalty` may reject or ignore it; DataForge does not rename it.
- Instruct sends `chat_template_kwargs.enable_thinking=false`.
- Reasoning sends effort both as `reasoning_effort` and in `chat_template_kwargs`, along with `preserve_thinking`.

Whether these controls work depends on the server and its chat template. The [bundled templates](../llm_templates/) format messages and thinking controls for each model. Qwen3.8 accepts only `low`, `medium`, and `xhigh`: low asks for brief thinking, medium adds nothing, and xhigh asks the model to check assumptions and alternatives. The Qwen3.6 and Gemma 4 templates support thinking but ignore the effort value.

## Job dialog options

These are choices in each job's dialog, not environment variables. Most are remembered per folder, and a new folder starts from your latest choices. **Reasoning** lets the model think before answering; **Instruct** answers directly.

| Option | Jobs | Default / behavior |
| --- | --- | --- |
| **Mode** | Auto-caption, Verify captions, Edit captions | Reasoning for Auto-caption and Verify captions; Instruct for Edit captions. Picks the sampling profile and thinking controls |
| **Reasoning effort** | All three | `medium`; also `low` and `xhigh`. Reasoning mode only |
| **Preserve thinking** | All three | On; keeps earlier reasoning in multi-turn prompts when the template supports it. Current jobs use single-turn prompts |
| **Caption audio** | Auto-caption | Off; sends audio alongside video frames |
| **Additional context** | Verify captions | Optional dataset facts for the checker |
| **Edit instruction** | Edit captions | Required; describes the rewrite |
| **Send media** | Edit captions | Off; sends each file's image or video keyframes so the edit can check and add visible details |

**Not remembered; reset every run:**

- **Back up captions first** in Edit captions and Find & replace starts on. It refreshes existing backups before editing.
- **Set captions** asks for overwrite permission again each time.
- Auto-adjust's **Replace earlier adjustments** and **Reset all color adjustments to zero** start off.

**Always overwrite:** Backup captions replaces existing copies, and Watermark replaces earlier output in `watermarked/`.

**ComfyUI** remembers prompt and seed per preset, the last preset globally, and overwrite permission per folder. **Keep original metadata** is on by default and remembered across individual and bulk acceptance; see [candidate review](comfyui.md#review-candidates) for supported formats.

## How settings are loaded

To set values outside the app, copy [`.env.example`](../.env.example) to `.env` in the project root, uncomment what you need, and restart DataForge. `.env` is gitignored; keep keys and machine-specific paths there, never in source.

For a setting that also appears in **Settings**, the first of these wins:

1. A value saved in **Settings** (stored in the database)
2. An environment variable already set in the shell or OS
3. The project-root `.env`, or `backend/.env` only when the root file does not exist
4. The built-in default

The two `.env` files are never merged, and environment changes need a restart. To let an environment value win over a saved one, choose **Reset**, then **Save**, in Settings.

Settings validates values before saving. A blank, malformed, or out-of-range environment value for a Settings field falls back to the default. An invalid path or bind address in an environment-only setting can stop the server from starting.

Default paths are relative to the project. A relative override resolves against the server's working directory, normally `backend/`, so prefer absolute paths.

## Server, storage, and logging

**Where** says how to set each value: **env** settings exist only in the environment and need a restart.

| Variable | Default | Where | Effect |
| --- | --- | --- | --- |
| `DATAFORGE_UI_PORT` | `18081` | env | The app's port in production; Vite's port in development |
| `DATAFORGE_API_PORT` | `18080` | env | API port, in development only |
| `DATAFORGE_API_HOST` | `127.0.0.1` | env | Address the server binds to; read the note below before changing it |
| `DATAFORGE_SERVE_UI` | off | env | Serve `frontend/dist`; the production launcher sets it. Leave unset in development |
| `DATAFORGE_DB_PATH` | `backend/data/app.db` | env | SQLite file for settings, jobs, and notifications |
| `DATAFORGE_THUMBNAIL_CACHE` | `backend/data/thumbnails/` | env | Thumbnail folder |
| `DATAFORGE_FILL_RESULTS` | `backend/data/fill_results/` | env | Generative fill results not yet kept and applied; deleted a day after they were made |
| `DATAFORGE_THUMBNAIL_CACHE_MAX_MB` | `2048` | Settings > Storage | Cache limit in MiB; least recently used thumbnails go first. `0` means no limit |
| `DATAFORGE_JOB_HISTORY_DAYS` | `30` | Settings > Data & history | Days to keep finished jobs; running jobs are never removed. `0` keeps them forever |
| `DATAFORGE_NOTIFICATION_HISTORY_DAYS` | `3` | Settings > Data & history | Days to keep notifications; the feed holds at most 50 either way. `0` turns off age pruning |
| `DATAFORGE_MODELS_DIR` | `backend/data/models/` | env | Folder for the [tagging](user-guide.md#tags) model |
| `DATAFORGE_TAG_MIN_CONFIDENCE` | `0.25` | Settings > Tagging | 0.1 to 1; weaker tags are hidden from cards and search |
| `DATAFORGE_LOG_LEVEL` | `INFO` | env | A standard level such as `DEBUG` or `WARNING`; unknown names use `INFO` |

Ports must be 1 to 65535. For `DATAFORGE_SERVE_UI`, `0`, `false`, `no`, `off`, or blank means off; any other value means on. Folders are created as needed. History pruning runs at startup, hourly, and after you save a retention change.

**Binding to another address.** A non-loopback `DATAFORGE_API_HOST` can expose your datasets to the network. The API then answers only to loopback names and that address (any name when bound to `0.0.0.0` or `::`), and always refuses state-changing requests from other origins. The development proxy still connects over loopback.

Launcher and test variables are listed in [Development](development.md#development-variables). ComfyUI and AI-Toolkit variables are in their own guides.

## Data sent to integrations

The default endpoints are local. A remote endpoint receives the following; its own storage and logging policies apply.

| Job | Sends | Destination |
| --- | --- | --- |
| Auto-caption | Downscaled image/video frames, draft caption if any, system prompt, optionally 15 seconds of audio | `OPENAI_API_BASE_URL` |
| Verify captions | Downscaled image/video frames, caption, additional context; no audio | `OPENAI_API_BASE_URL` |
| Edit captions | Caption and edit instruction; with **Send media**, also downscaled image/video frames | `OPENAI_API_BASE_URL` |
| Process with ComfyUI | Source media and workflow inputs | `COMFY_BASE_URL` |
| Generative fill | A crop around the painted area, its mask, and the instruction | `COMFY_BASE_URL` |
| Quick LoRA training | Dataset folder path and training configuration, including prompts; no media upload | `OSTRIS_BASE_URL` |

AI-Toolkit must be able to read the supplied dataset path. Its configuration controls where outputs go, and DataForge needs filesystem access to its state and samples to display them.

## CPU temperature on Windows

The system specifications panel (the CPU button in the toolbar) shows GPU temperature when available and tries CPU temperature on Linux. Windows gives normal programs no CPU temperature, so an optional sensor task reads it for Intel CPUs and AMD Ryzen through the third-party [PawnIO](https://pawnio.eu) driver.

**Before installing, note that:**

- PawnIO is a kernel driver maintained outside DataForge. DataForge doesn't ship it, but this installer adds it to your system.
- The `AMDFamily17` module can read any AMD internal (SMN) register, while `IntelMSR` allows only a fixed list of registers. Only administrators and SYSTEM can reach either.
- Some users report that game anti-cheat systems object to PawnIO being installed.

**Install.** Right-click `scripts\install-cpu-temperature-sensor.bat` and choose **Run as administrator**, or run it from an administrator terminal at the project root:

```bat
scripts\install-cpu-temperature-sensor.bat
```

The installer:

1. Installs PawnIO if it is missing: it downloads the official setup at a pinned version, checks its SHA-256 digest, and installs it silently, which skips PawnIO's own copyright window (PawnIO is licensed under GPL-2.0). If Windows needs a restart, the installer says so; restart and run it again.
2. Picks the `IntelMSR` or `AMDFamily17` module for your CPU, downloads it from a pinned [PawnIO.Modules](https://github.com/namazso/PawnIO.Modules) release, and checks its digest.
3. Tests a reading, then registers the **DataForge CPU temperature** task. If the test fails, it removes the task and sensor folder again.

The task starts with Windows, runs as SYSTEM, polls every two seconds, and writes `%ProgramData%\DataForge\sensors\cpu_temperature.txt` in an administrator-controlled folder. DataForge reads that file without elevation and hides readings older than 10 seconds.

**Uninstall** the task and sensor folder from an administrator terminal. PawnIO stays installed, because other tools may rely on it; remove it from Windows settings if nothing else needs it.

```bat
scripts\install-cpu-temperature-sensor.bat -Uninstall
```

## Troubleshooting

**The server is unreachable.** Test the connection before saving. Check that the server is running, the URL includes `/v1`, the key is accepted, and the selected model id exists. Raise `OPENAI_TIMEOUT` only for a server that connects but answers slowly.

**Captions ignore the image.** Check that the server runs a vision model and has loaded its projector. A successful connection test only checks the model list.

**Captions are empty, cut off, or fail on long clips.** Read the server log and the per-file job results. Empty content can mean exhausted GPU memory or context, or thinking output the server does not support. Shrink [media budgets](#media-input-budgets) first; raise response or context limits for truncated answers. Reload the model server if needed.

**A setting change has no effect.** Save changes made in Settings. For `.env` changes, restart DataForge, then check for a saved value, an OS or shell variable, or a root `.env` hiding `backend/.env`; see [precedence](#how-settings-are-loaded). Check spelling and value ranges. Job dialog options are separate from these settings.

For integration failures, see [ComfyUI](comfyui.md#troubleshooting) or [AI-Toolkit](ai-toolkit.md#troubleshooting).
