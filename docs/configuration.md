# Configuration

[Documentation](README.md)

Use **Settings** (`Ctrl+,`) to connect services and tune AI jobs. Browsing, manual captioning, editing, and local checks need no model and no `.env` file.

Environment variables cover startup options and supply defaults for Settings; see [How settings are loaded](#how-settings-are-loaded). Integration-specific options are in the [ComfyUI](comfyui.md#connect-comfyui) and [AI-Toolkit](ai-toolkit.md#connect-ai-toolkit) guides.

- [Settings dialog](#settings-dialog)
- [Connect a vision model](#connect-a-vision-model)
  - [Tested models](#tested-models) · [Vision model settings](#vision-model-settings)
- [Media input budgets](#media-input-budgets)
  - [Defaults and sampling rules](#defaults-and-sampling-rules) · [Audio](#audio)
- [Sampling](#sampling)
  - [Reasoning effort levels](#reasoning-effort-levels)
- [Job dialog options](#job-dialog-options)
- [How settings are loaded](#how-settings-are-loaded)
- [Server, storage, and logging](#server-storage-and-logging)
- [Data sent to integrations](#data-sent-to-integrations)
- [Hardware sensors on Windows](#hardware-sensors-on-windows)
- [Troubleshooting](#troubleshooting)

## Settings dialog

| Section | Contains |
| --- | --- |
| **Appearance > Color scheme** | Light, Dark, or System |
| **Appearance > Gallery** | Caption length on large and small cards; megapixels, aspect ratio, and tags on large cards; which [card actions](user-guide.md#find-files) appear on hover; the list's caption preview |
| **Appearance > Editor** | Line wrapping, line numbers, spell checking and its language, and word suggestions |
| **Notifications** | **Show desktop notifications** and **Send to the desktop** |
| **Vision model > Server** | Connection and limits |
| **Vision model > Sampling** | Separate Reasoning and Instruct profiles |
| **Vision model > Media input** | Image and video budgets |
| **Tagging** | Turning [tagging](user-guide.md#tags) on, its status, files still waiting, minimum confidence, **Re-tag everything**, and your own vocabulary terms |
| **Integrations** | ComfyUI URL, [generative fill](comfyui.md#generative-fill) model files and steps, and AI-Toolkit URL |
| **Data & storage > History** | Job and notification retention; **Clear** for recent folders, recent quick actions, per-folder job options, and per-folder display modes |
| **Data & storage > Storage** | Thumbnail-cache size and limit; **Clear cache** |
| **About** | Version, runtimes, GPU, and storage/config paths; **Copy diagnostics** |

- **Color scheme** is previewed before saving. Quick actions can also switch it.
- **Show desktop notifications.** While DataForge is in the background, notifications also appear on your desktop; the browser asks for permission first. Clicking one brings DataForge back.
- **Send to the desktop** narrows desktop notifications to warnings and errors, or errors only.
- **Test connection** is available for each service under **Integrations**.
- **Clear cache** empties the thumbnail cache; thumbnails regenerate as you browse.
- **Copy diagnostics** leaves out the API key.

**Saving and resetting**

- **Save** applies edited fields without a restart and keeps Settings open, so you can go on editing. A dot on a section marks unsaved changes.
- **Cancel** discards field changes, including a previewed color scheme.
- **Value source.** Each field shows whether its value is saved, comes from the environment, or is the default. **Reset**, then **Save**, removes a saved value.
- **Clear** actions apply immediately, even if you then cancel. They clear app history and cache, never dataset media or captions.
- **Running jobs.** A running AI job keeps the connection it started with, while other settings can change during processing. Finish or cancel it before retuning.

## Connect a vision model

Auto-caption and Verify captions need an OpenAI-compatible chat-completions server that accepts images. Edit captions sends text only, unless **Send media** is on. Install and run the model server separately, then:

1. Open **Settings > Vision model > Server**.
2. Enter the API URL, including `/v1`, and a key if the server requires one. The default URL is `http://127.0.0.1:8888/v1`.
3. Select **Test connection**. It tests the entered address and key and lists the model ids the server reports.
4. Choose the server's model id, then **Save**. The default `qwen38` is only an id, not a model download.
5. Open your dataset, select a few files, and choose **Auto-caption**, **Edit captions**, or **Verify captions** from **Tools**.
   - The dialog asks the server which model it has loaded; until it answers, the model name and the reasoning levels show as loading.
   - For Auto-caption, use **Create instructions** to write a system prompt if the folder has none to inherit.

- **Test connection** only checks the server's model list; it does not prove that image or audio input works.
- **API key.** A saved key is never displayed again. If the key field is blank during a test, the saved or environment key is used.

**llama.cpp** needs the model in GGUF format and its matching multimodal projector, which lets the model see images. Load both:

```bash
llama-server --port 8888 -m <model.gguf> --mmproj <mmproj.gguf>
```

- Some download-based llama.cpp setups load the projector automatically; see its [multimodal instructions](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md).
- If the server uses `--api-key`, enter the same key in Settings.

### Tested models

**Qwen3.8 27B is the recommended starting point.** For llama.cpp, try the `UD-Q4_K_XL` [GGUF quantization](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF). Quantization reduces the memory the weights need; leave room for context and media input as well.

| Model | When to choose it | Mode |
| --- | --- | --- |
| [Qwen3.8 27B](https://huggingface.co/Qwen/Qwen3.8-27B) | Default recommendation for image and video captioning | Start in Reasoning |
| [Qwen3.6 35B A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) | Recommended mixture-of-experts (MoE) alternative | Reasoning or Instruct |
| [Inkling 2 Mini](https://huggingface.co/thinkingmachines/Inkling-2-Mini) | Smaller MoE model for limited memory | Reasoning; cannot be fully turned off |
| [Qwen3-Omni 30B A3B Instruct](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct) | Captions video audio as well as frames | Instruct |
| [Gemma 4 31B](https://huggingface.co/google/gemma-4-31B-it) / [26B A4B](https://huggingface.co/google/gemma-4-26B-A4B-it) | Alternative dense / MoE models | Start with Instruct |

- **Qwen3.8 27B.** Its chat template supports low, medium, and xhigh effort.
- **Qwen3.6 35B A3B.** Activates about 3B of its 35B parameters per token, so most can be offloaded to system memory.
- **Inkling 2 Mini.** Activates about 3.4B of its 26.4B parameters per token. Reasoning cannot be fully turned off, so cap the output tokens. llama.cpp needs b12600 or newer.
- **Qwen3-Omni 30B A3B Instruct.** Turn on **Caption audio**; the server must accept `input_audio` parts.
- **Gemma 4.** Start with repeat penalty `1.1`. Its chat template leaves thinking off unless the server turns it on, and ignores effort.

Community variants of [Qwen3.8 27B](https://huggingface.co/HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF), [Qwen3.6 35B A3B](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive), and [Inkling 2 Mini](https://huggingface.co/AtomicChat/Inkling-2-Mini-Uncensored-GGUF) aim to reduce refusals. Check their captions on a small, representative selection before a full run.

Load the matching projector and a compatible chat template for your model. Hardware needs depend on quantization, context, and media budgets; DataForge itself needs no GPU.

### Vision model settings

All of these are under **Settings > Vision model > Server**, except `OPENAI_TIMEOUT`, which is environment-only.

| Variable | Default | Accepted value | Effect |
| --- | --- | --- | --- |
| `OPENAI_API_BASE_URL` | `http://127.0.0.1:8888/v1` | HTTP(S) URL, including `/v1` | Address of the OpenAI-compatible API |
| `OPENAI_API_KEY` | `EMPTY` | Nonempty key, at most 500 characters, without whitespace | API key |
| `OPENAI_MODEL` | `qwen38` | Nonempty model id, at most 200 characters | Model id; use the server's id |
| `OPENAI_MAX_TOKENS` | `16384` | Integer ≥ 1 | Response cap |
| `OPENAI_TOP_K` | `20` | Integer ≥ 0 | Server-specific top-k sampling |
| `DRAFT_CAPTION_THRESHOLD` | `256` | Integer ≥ 1 | Caption length in characters |
| `OPENAI_TIMEOUT` | `600` | Positive seconds | Time limit per response |

- `OPENAI_API_KEY`: `EMPTY` is the placeholder for no key.
- `OPENAI_MAX_TOKENS` includes any reasoning the server counts.
- `DRAFT_CAPTION_THRESHOLD` is used by Auto-caption only; see below.
- `OPENAI_TIMEOUT`: nonpositive or malformed values use the default.
- **Retries.** Each model call gets up to three attempts, with a 10-second connection timeout.

**Draft threshold** decides what Auto-caption does with each file:

| Existing caption | Auto-caption |
| --- | --- |
| None or empty | Writes one from the media alone |
| Up to the threshold | Treats it as a draft and expands it |
| Longer than the threshold | Skips it (`skipped_long`) |

- **Too short.** A generated caption at or under the threshold is retried, and reported as `too_short` if every attempt is too short.
- **Longer captions.** Raise the threshold and make sure the system prompt asks for enough detail.
- **Other jobs.** Verify captions and Edit captions ignore the threshold.

## Media input budgets

Tune **Settings > Vision model > Media input** when captions miss detail, or when requests exceed GPU memory or context (how many input and response tokens the model can handle). Adjust these before sampling: more frames and pixels use more memory and context.

| Problem | Change |
| --- | --- |
| Images miss fine detail | Raise **Pixel budget** |
| Short clips exhaust memory | Lower **Frame budget, short clips**, for example to `262144` |
| Long clips still exhaust memory | Also lower **Frame budget, long clips** |
| Brief actions disappear in long clips | Raise **Max keyframes** |
| Short clips need more samples | Raise **Keyframes** (per second) |
| Short clips miss fine detail | Raise **Frame budget, short clips** |

- **Frame budget, long clips** also sets the resize floor; see **Frame size** below.
- **Keyframes** (per second) helps only below the cap set by **Max keyframes**.

### Defaults and sampling rules

All five are positive integers under **Settings > Vision model > Media input**. They apply to Auto-caption and Verify captions. Originals never change; request images are converted to JPEG.

| Variable | Default | Controls |
| --- | --- | --- |
| `IMAGE_MAX_PIXELS` | `1500000` | Pixel budget for a still, or a GIF's first frame |
| `VIDEO_KEYFRAMES_PER_SECOND` | `2` | Requested frames per second, before the cap |
| `VIDEO_MAX_KEYFRAMES` | `42` | Maximum frames sent per video |
| `VIDEO_FRAME_MAX_PIXELS` | `500000` | Per-frame pixel budget for clips up to 7 seconds |
| `VIDEO_FRAME_MIN_PIXELS` | `262144` | Per-frame budget for clips of 20 seconds or more |

`VIDEO_FRAME_MIN_PIXELS` is also the basis of the per-side size floor.

**Frame count**

- **Known duration.** DataForge requests `min(max(fps × ceil(seconds) + 2, 8), max_keyframes)` evenly spaced frames, including both ends. The maximum may be set below 8.
- **Unknown duration.** 8 frames.
- **Fewer decodable frames.** The video sends fewer.
- **At the defaults,** the cap is reached at 20 seconds, so a two-minute clip also sends 42 frames.

**Frame size**

- **Budget by length.** The per-frame budget is the short-clip value up to 7 seconds, then falls linearly until 20 seconds to the smaller of the two budgets.
- **Over budget.** A picture over its budget is shrunk to fit: each side is rounded down to a multiple of 32.
- **Size floor.** No side goes below `sqrt(VIDEO_FRAME_MIN_PIXELS)`, rounded down to the same grid and kept between 32 and 512 pixels.
- **Stills** follow the same resize rule.
- **Within budget.** A picture already within its budget is sent at its original size.

At the default floor, a 1920 × 1080 frame becomes:

| Budget | Sent size |
| --- | --- |
| 500,000 pixels | 928 × 512 |
| 250,000 pixels | 640 × 512 |
| 125,000 pixels | 512 × 512 |

As these show, the floor can exceed the budget and change the aspect ratio. To shrink frames below it, lower the long-clip budget as well as the short-clip one. Actual vision-token use depends on the model and server, not on frame counts alone.

### Audio

**Caption audio** sends the first 15 seconds of a video's first audio track as 16 kHz mono WAV, in the same request as its frames.

- **No budget.** There is no audio budget setting.
- **Server support.** The server and model must accept OpenAI `input_audio` parts; a vision-only setup may reject or ignore them.
- **ffmpeg.** The job requires ffmpeg.
- **Videos without audio** are still captioned from their frames, and the result notes that the video had no audio.
- **Never sent.** Images, GIFs, and Verify captions never send audio.

## Sampling

Tune sampling last, once the connection and media budgets work. Reasoning and Instruct each have their own profile under **Settings > Vision model > Sampling**; top-k is shared and lives under **Server**.

**Defaults**

| Setting | Reasoning variable | Reasoning default | Instruct variable | Instruct default |
| --- | --- | --- | --- | --- |
| Temperature | `OPENAI_THINKING_TEMPERATURE` | `1.0` | `OPENAI_INSTRUCT_TEMPERATURE` | `0.7` |
| Top-p | `OPENAI_THINKING_TOP_P` | `0.95` | `OPENAI_INSTRUCT_TOP_P` | `0.8` |
| Min-p | `OPENAI_THINKING_MIN_P` | `0.0` | `OPENAI_INSTRUCT_MIN_P` | `0.0` |
| Presence penalty | `OPENAI_THINKING_PRESENCE_PENALTY` | `0.0` | `OPENAI_INSTRUCT_PRESENCE_PENALTY` | `1.5` |
| Repeat penalty | `OPENAI_THINKING_REPEAT_PENALTY` | `1.0` | `OPENAI_INSTRUCT_REPEAT_PENALTY` | `1.0` |

**Ranges and meaning**

| Setting | Range | Meaning | Off at |
| --- | --- | --- | --- |
| Temperature | 0–2 | Randomness; lower is more predictable | — |
| Top-p | 0.01–1 | Probability mass kept for sampling | — |
| Min-p | 0–1 | Drops tokens far less likely than the best one | 0 |
| Presence penalty | −2–2 | Positive values discourage returning to concepts already mentioned | — |
| Repeat penalty | 0–2 | Sent as `repeat_penalty` | 1 |

At 1, the repeat penalty is also left out of the request.

**What reaches the server:**

- Min-p and top-k are sent in `extra_body`.
- The repeat penalty is sent as `repeat_penalty`, the llama.cpp name. A server expecting `repetition_penalty` may reject or ignore it; DataForge does not rename it.
- Instruct sends `chat_template_kwargs.enable_thinking=false`.
- Reasoning sends effort both as `reasoning_effort` and in `chat_template_kwargs`, along with `preserve_thinking`.

Whether these controls work depends on the server and its chat template.

### Reasoning effort levels

DataForge knows `low`, `medium`, `high`, `xhigh`, and `max`, but each template defines its own subset and may reject the others, failing the request.

- **llama.cpp or Unsloth Studio.** DataForge reads the loaded model and its template from the server's `/props` and tries each level on it, so the job dialogs name that model and offer only the levels it accepts. Levels that produce the same prompt show once.
- **Missing levels.** Jobs move a level the template lacks to the nearest one it has, and send no level to a template that ignores it.
- **No levels.** When the loaded model's template has no effort levels, the dialog shows a disabled **None** and sends no level.
- **Other servers** do not report a template, so every level is offered and sent as chosen.

With the models' own templates:

- **Qwen3.8** accepts only `low`, `medium`, and `xhigh`: low asks for brief thinking, medium adds nothing, and xhigh asks the model to check assumptions and alternatives.
- **Qwen3.6 and Gemma 4** support thinking but ignore the effort value.
- **Gemma 4** thinks only when the server sets `enable_thinking` to true, because Reasoning does not send it.

## Job dialog options

These are choices in each job's dialog, not environment variables. Most are remembered per folder, and a new folder starts from your latest choices. **Reasoning** lets the model think before answering; **Instruct** answers directly.

| Option | Jobs | Default | Effect |
| --- | --- | --- | --- |
| **Mode** | Auto-caption, Verify captions, Edit captions | Reasoning for Auto-caption and Verify captions; Instruct for Edit captions | Picks the sampling profile and thinking controls |
| **Reasoning effort** | All three | `medium` | Also `low`, `high`, `xhigh`, and `max` |
| **Preserve thinking** | All three | On | Keeps earlier reasoning in multi-turn prompts |
| **Caption audio** | Auto-caption | Off | Sends audio alongside video frames |
| **Instruction** | Verify captions, Edit captions | — | Verify captions: optional dataset facts for the checker. Edit captions: describes the rewrite |
| **Send media** | Edit captions | Off | Sends each file's image or video keyframes so the edit can check and add visible details |
| **System prompt** | Verify captions, Edit captions | Off | **Before** or **After** adds the folder's [system prompt](user-guide.md#folder-instructions) before or after the instruction |

- **Reasoning effort** applies in Reasoning mode only. With llama.cpp or Unsloth Studio, only the loaded model's levels are offered; a model without levels shows a disabled **None**.
- **Preserve thinking** works when the template supports it. Current jobs use single-turn prompts.
- **Instruction** is required in Edit captions.

**Not remembered; reset every run:**

- **Back up captions first** in Edit captions and Find & replace starts on. It refreshes existing backups before editing.
- **Set captions** asks for overwrite permission again each time.
- Auto-adjust's **Replace earlier adjustments** and **Reset all color adjustments to zero** start off.

**Always overwrite:** Backup captions replaces existing copies, and Watermark replaces earlier output in `watermarked/`.

**ComfyUI jobs:**

- **Run ComfyUI workflow** remembers the last preset globally, and prompt and inputs per preset, with the seed only for an edit preset. Overwrite permission, generations, prefix and caption are remembered per folder.
- **LoRA showcase** remembers its whole last run per folder, seeds included; showcase sets are shared by every folder.
- **Keep original metadata** is on by default and remembered across individual and bulk acceptance; see [candidate review](comfyui.md#review-candidates) for supported formats.

## How settings are loaded

To set values outside the app:

1. Copy [`.env.example`](../.env.example) to `.env` in the project root.
2. Uncomment what you need.
3. Restart DataForge.

`.env` is gitignored; keep keys and machine-specific paths there, never in source.

For a setting that also appears in **Settings**, the first of these wins:

1. A value saved in **Settings** (stored in the database)
2. An environment variable already set in the shell or OS
3. The project-root `.env`, or `backend/.env` only when the root file does not exist
4. The built-in default

- **Two `.env` files.** They are never merged.
- **Restart.** Environment changes need a restart.
- **Environment over saved.** To let an environment value win over a saved one, choose **Reset**, then **Save**, in Settings.
- **Validation.** Settings validates values before saving. A blank, malformed, or out-of-range environment value for a Settings field falls back to the default. An invalid path or bind address in an environment-only setting can stop the server from starting.
- **Paths.** Default paths are relative to the project. A relative override resolves against the server's working directory, normally `backend/`, so prefer absolute paths.

## Server, storage, and logging

**Where** says how to set each value: **env** settings exist only in the environment and need a restart.

**Network**

| Variable | Default | Where | Effect |
| --- | --- | --- | --- |
| `DATAFORGE_UI_PORT` | `18081` | env | The app's port in production; Vite's port in development |
| `DATAFORGE_API_PORT` | `18080` | env | API port, in development only |
| `DATAFORGE_API_HOST` | `127.0.0.1` | env | Address the server binds to |
| `DATAFORGE_SERVE_UI` | off | env | Serve `frontend/dist` |

- **Ports** must be 1 to 65535.
- `DATAFORGE_API_HOST`: read **Binding to another address** below before changing it.
- `DATAFORGE_SERVE_UI`: the production launcher sets it; leave it unset in development. `0`, `false`, `no`, `off`, or blank means off; any other value means on.

**Binding to another address.** A non-loopback `DATAFORGE_API_HOST` can expose your datasets to the network. Then:

- The API answers only to loopback names and that address (any name when bound to `0.0.0.0` or `::`).
- It always refuses state-changing requests from other origins.
- The development proxy still connects over loopback.

**Storage**

| Variable | Default | Where | Effect |
| --- | --- | --- | --- |
| `DATAFORGE_DB_PATH` | `backend/data/app.db` | env | SQLite file for settings, jobs, and notifications |
| `DATAFORGE_THUMBNAIL_CACHE` | `backend/data/thumbnails/` | env | Thumbnail folder |
| `DATAFORGE_THUMBNAIL_CACHE_MAX_MB` | `2048` | Settings > Data & storage > Storage | Cache limit in MiB |
| `DATAFORGE_FILL_RESULTS` | `backend/data/fill_results/` | env | Generative fill results not yet kept and applied |
| `DATAFORGE_MODELS_DIR` | `backend/data/models/` | env | Folder for the [tagging](user-guide.md#tags) model |

- **Folders** are created as needed.
- **Thumbnail cache limit.** Least recently used thumbnails go first. `0` means no limit.
- **Fill results** are deleted a day after they were made.

**History**

| Variable | Default | Where | Effect |
| --- | --- | --- | --- |
| `DATAFORGE_JOB_HISTORY_DAYS` | `30` | Settings > Data & storage > History | Days to keep finished jobs |
| `DATAFORGE_NOTIFICATION_HISTORY_DAYS` | `3` | Settings > Data & storage > History | Days to keep notifications |

- **Jobs.** Running jobs are never removed. `0` keeps finished jobs forever.
- **Notifications.** The feed holds at most 50 either way. `0` turns off age pruning.
- **Pruning** runs at startup, hourly, and after you save a retention change.

**Tagging and logging**

| Variable | Default | Where | Effect |
| --- | --- | --- | --- |
| `DATAFORGE_TAG_MIN_CONFIDENCE` | `0.25` | Settings > Tagging | Weaker tags are hidden from cards and search |
| `DATAFORGE_LOG_LEVEL` | `INFO` | env | Log level |

- `DATAFORGE_TAG_MIN_CONFIDENCE` accepts 0.1 to 1.
- `DATAFORGE_LOG_LEVEL` takes a standard level such as `DEBUG` or `WARNING`; unknown names use `INFO`.

Launcher and test variables are listed in [Development](development.md#development-variables). ComfyUI and AI-Toolkit variables are in their own guides.

## Data sent to integrations

The default endpoints are local. A remote endpoint receives the following; its own storage and logging policies apply.

**Vision model, at `OPENAI_API_BASE_URL`**

| Job | Sends |
| --- | --- |
| Auto-caption | Downscaled image/video frames, draft caption if any, and system prompt |
| Verify captions | Downscaled image/video frames, caption, and instruction |
| Edit captions | Caption and instruction |

- **Auto-caption** optionally also sends 15 seconds of audio.
- **Verify captions** sends no audio.
- **Edit captions** with **Send media** also sends downscaled image/video frames.
- **Verify captions** and **Edit captions** also send the folder's system prompt when **System prompt** is **Before** or **After**.

**ComfyUI, at `COMFY_BASE_URL`**

| Job | Sends |
| --- | --- |
| Run ComfyUI workflow, edit preset | Source media and workflow inputs |
| Run ComfyUI workflow, generation preset; LoRA showcase | Workflow inputs, prompts included, and a showcase's start files |
| Generative fill | A crop around the painted area, its mask, and the instruction |

**AI-Toolkit, at `OSTRIS_BASE_URL`**

| Job | Sends |
| --- | --- |
| LoRA training | Dataset folder path and training configuration, including prompts |

- **No media upload.** LoRA training sends the path, not the media.
- **Dataset access.** AI-Toolkit must be able to read the supplied dataset path.
- **Outputs.** Its configuration controls where outputs go, and DataForge needs filesystem access to its state and samples to display them.

## Hardware sensors on Windows

The system specifications panel (the CPU button in the toolbar) shows these readings:

- **GPU.** Temperature, power draw against its limit, and fan speed, when `nvidia-smi` reports them.
- **CPU on Linux.** DataForge also tries CPU temperature and CPU package power from the kernel's sensors; package power is usually readable only by root.
- **CPU on Windows.** Windows gives normal programs neither CPU reading, so an optional sensor task reads CPU temperature and package power on Intel CPUs and AMD Ryzen through the third-party [PawnIO](https://pawnio.eu) driver.
- **macOS.** The panel shows CPU load and the Mac's own GPU, with its load and the shared memory it uses. macOS gives normal programs no CPU temperature or power reading, so those stay empty.

**Before installing, note that:**

- PawnIO is a kernel driver maintained outside DataForge. DataForge doesn't ship it, but this installer adds it to your system.
- The `AMDFamily17` module can read any AMD internal (SMN) register, while `IntelMSR` allows only a fixed list of registers. Only administrators and SYSTEM can reach either. The sensor task only reads.
- Some users report that game anti-cheat systems object to PawnIO being installed.

**Install.** Right-click `scripts\install-hardware-sensors.bat` and choose **Run as administrator**, or run it from an administrator terminal at the project root:

```bat
scripts\install-hardware-sensors.bat
```

The installer:

1. **Installs PawnIO** if it is missing: it downloads the official setup at a pinned version, checks its SHA-256 digest, and installs it silently, which skips PawnIO's own copyright window (PawnIO is licensed under GPL-2.0). If Windows needs a restart, the installer says so; restart and run it again.
2. **Picks the module** `IntelMSR` or `AMDFamily17` for your CPU from a pinned [PawnIO.Modules](https://github.com/namazso/PawnIO.Modules) release, and checks its digest.
3. **Registers the task** **DataForge hardware sensors**, replacing the older **DataForge CPU temperature** task, and prints its first readings. If nothing can be read, it removes the task and sensor folder again. If only some readings fail, it shows why.

**After installing:**

- **Schedule.** The task starts with Windows, runs as SYSTEM, and polls every second.
- **Readings file.** It writes `%ProgramData%\DataForge\sensors\sensors.json` in an administrator-controlled folder. DataForge reads that file without elevation and hides readings older than 10 seconds.
- **Older installs.** If you installed the CPU temperature task before power was added, run the installer again; until you do, the panel shows no CPU temperature.

**Uninstall** the task and sensor folder from an administrator terminal. PawnIO stays installed, because other tools may rely on it; remove it from Windows settings if nothing else needs it.

```bat
scripts\install-hardware-sensors.bat -Uninstall
```

## Troubleshooting

**The server is unreachable.** Test the connection before saving. Check that:

- the server is running,
- the URL includes `/v1`,
- the key is accepted,
- and the selected model id exists.

Raise `OPENAI_TIMEOUT` only for a server that connects but answers slowly.

**Captions ignore the image.** Check that the server runs a vision model and has loaded its projector. A successful connection test only checks the model list.

**Captions are empty, cut off, or fail on long clips.**

- Read the server log and the per-file job results.
- Empty content can mean exhausted GPU memory or context, or thinking output the server does not support.
- Shrink [media budgets](#media-input-budgets) first; raise response or context limits for truncated answers.
- Reload the model server if needed.

**A setting change has no effect.**

- Save changes made in Settings.
- For `.env` changes, restart DataForge, then check for a saved value, an OS or shell variable, or a root `.env` hiding `backend/.env`; see [precedence](#how-settings-are-loaded).
- Check spelling and value ranges.
- Job dialog options are separate from these settings.

For integration failures, see [ComfyUI](comfyui.md#troubleshooting) or [AI-Toolkit](ai-toolkit.md#troubleshooting).
