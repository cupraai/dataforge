# Process media with ComfyUI

[Documentation](README.md)

Run images or videos through ComfyUI workflows such as upscaling, restoration, or interpolation. DataForge stages each result for review, so processing never changes the source until you accept. ComfyUI also powers the image editor's [generative fill](#generative-fill). Install and run ComfyUI separately.

## Connect ComfyUI

Start ComfyUI, then open **Settings > Integrations**. Enter its origin in **ComfyUI URL** (the service address, not a page URL), use **Test connection**, and **Save**. The default is `http://127.0.0.1:9000`.

You can also set the connection in `.env`; environment changes need a restart, and a value saved in Settings wins. Prefer absolute paths: relative overrides resolve against the server's working directory, normally `backend/`.

| Variable | Default | Effect |
| --- | --- | --- |
| `COMFY_BASE_URL` | `http://127.0.0.1:9000` | HTTP(S) origin; also in Settings |
| `COMFY_WORKFLOWS_DIR` | `comfy_workflows/` | Folder of API-format JSON presets |
| `COMFY_IMAGE_TIMEOUT` | `900` | Seconds per image, and per generative fill; values below 30 or malformed values use the default |
| `COMFY_VIDEO_TIMEOUT` | `7200` | Seconds per GIF or video; values below 60 or malformed values use the default |

The generative fill variables are listed under [Presets and settings](#presets-and-settings).

A remote ComfyUI receives the source media and workflow inputs. Uploaded sources accumulate in ComfyUI's `input/dataforge/` folder; ComfyUI has no endpoint to remove them, so clear old uploads there by hand.

The processing menu appears whenever presets exist, even if ComfyUI is stopped; the dialog reports whether it is available.

## Try it

The bundled [`example_lanczos_2x.json`](../comfy_workflows/example_lanczos_2x.json) resizes images 2× with core nodes and needs no model downloads. To try review without a run, open [`sample_media/`](../sample_media/) and choose **Review candidates**.

## Run a folder

1. Open the dataset itself, not its `staging/` folder.
2. Select files, or search and filter, to limit the run; otherwise it covers the whole folder. See [job scope](user-guide.md#scope).
3. Choose **Process with ComfyUI** and a preset that suits those files.
4. Optionally enter **Prompt**, **Seed**, or the preset's [custom inputs](#custom-inputs). Each field is enabled only when the workflow has the matching titled node.
5. Choose whether to overwrite previously staged results, then start.

DataForge uploads one file at a time and stages the workflow's output with a `.comfy.json` run record.

- Existing candidates are skipped unless overwrite is on.
- Outputs that would [collide](#how-results-pair-with-sources) with another source's candidate are refused, even with overwrite on.
- A result must decode before it is staged, and again before it is accepted, so a bad output never replaces a source or an earlier candidate. Validating video needs ffmpeg.
- The workflow decides which inputs it supports. An unsupported or failed file is reported, and processing continues.

The panel shows ComfyUI's console, including output from other work on that server. Cancelling removes the queued prompt or interrupts the running one; results already staged remain.

## Review candidates

Open **Review > Pending candidates** (**Review candidates** in Quick actions) for a side-by-side comparison, or use the review control in a file's inspector. The comparison shows dimensions, sizes, resolution gain, and perceptual difference. Videos start muted and loop, and playback, pause, and seeking stay in sync when both sides are video. GIFs play as images.

- **Accept** (`Ctrl+Enter`) replaces the source with the result, in the result's format. The stem and caption are kept, and issue and duplicate file names are updated. **No source backup is kept; acceptance has no undo.**
- **Reject** (`Ctrl+Backspace`) removes the candidate and its run record, leaving the source unchanged.
- **Skip**, **Back**, the arrow keys, and `Home` / `End` navigate without deciding.

**Keep original metadata** is on by default and remembered for individual and bulk acceptance. It replaces the result's EXIF, XMP, and text/workflow metadata with the source's. Turn it off to keep the result's own metadata. It works for image sources with PNG results and video sources with MP4 or MOV results; other pairings keep the result's metadata. If a supported transfer fails, the result stays staged and the source is unchanged.

**Edited sources.** If the source has an edit, accepting asks before discarding its settings and kept original; the candidate becomes the new original. Cancelling that question leaves both versions unchanged.

**Videos.** Review warns about duration differences and lost audio. The difference score compares only the first frame, so watch playback before accepting.

An orphan, whose source was moved or deleted outside DataForge, can only be rejected.

### Bulk acceptance and deletion

In Quick actions (`Ctrl+P`), use **Accept all staged candidates** or **Delete all staged candidates**. With a selection, they become **Accept selected candidates** and **Delete selected candidates** and include only those sources' candidates. Filters alone do not limit these commands.

- **Bulk acceptance** asks for confirmation, offers **Keep original metadata**, and skips the individual comparisons. It discards any source edit and original, and keeps no backup.
- **Bulk deletion** keeps the sources and sends the candidates to the Recycle Bin on Windows.

Each command reports failures; candidates that failed stay available for review.

### How results pair with sources

A result is staged under its source's stem, in whatever format the workflow produces: `photo.jpg` can pair with `staging/photo.png` or `staging/photo.mp4`. If both `photo.jpg` and `photo.png` exist, `staging/photo.png` belongs to the PNG. Results named exactly like their source, including older `staging/photo.jpg` results, still pair.

Processing refuses output names that would collide with another source's candidate, even with overwrite on. Give same-stem sources unique names before processing.

Each result has a `<result-name>.comfy.json` record of the workflow, run details, and perceptual difference score. Older results without a score are scored when reviewed.

The difference score is the percentage of bits that differ in a perceptual hash, a compact fingerprint of a frame's appearance. It helps spot large visual changes; it does not measure quality.

## Write a preset

1. Build a workflow in ComfyUI and test it on one file.
2. Export it with **Save (API Format)**. A regular workflow save is not accepted.
3. Put the `.json` file in `comfy_workflows/`, or the folder set by `COMFY_WORKFLOWS_DIR`.
4. Reopen **Process with ComfyUI** to load it.

The file name becomes the preset name: `upscale-2x.json` appears as `upscale-2x`. Git tracks only the bundled example; your presets in the default folder are ignored.

### Input and output nodes

A workflow with one loader and one saver works without titles: `LoadImage`/`SaveImage` for images, or `VHS_LoadVideo`/`VHS_VideoCombine` for video. If there is more than one candidate, give these **node titles** (not node types):

| Node title | Node | Input DataForge changes |
| --- | --- | --- |
| `DataForge Input` | Source loader | `image` or `video`, set to the uploaded file name |
| `DataForge Output` | Result saver | `filename_prefix`, or `filename` for direct file writers |

A video preview node can count as another saver. DataForge refuses ambiguous workflows. If the designated output produces no file, that source fails; output from another node is never used instead.

Not supported:

- Filesystem-path loaders such as `VHS_LoadVideoPath`: DataForge supplies uploaded file names, not paths on the ComfyUI machine.
- `VHS_BatchManager`: its follow-up prompts cannot be tracked and cancelled as one run. Use shorter clips, or process chunks within one prompt.

### Optional nodes

| Node title | Input DataForge changes |
| --- | --- |
| `DataForge Prompt` | `text`, `value`, or `prompt`, if a prompt is entered |
| `DataForge Seed` | `seed`, `noise_seed`, or `value`, if a seed is entered |
| `DataForge Mask` | `image`, set to an uploaded black-and-white mask |

Without these nodes, or with their fields left empty, the workflow uses its saved values. The dialog disables Prompt or Seed when the matching node is missing. A prompt or custom input value must belong to the titled node itself, not arrive through a connection from another node; a supplied prompt is refused if its node cannot take it.

Only the editor's [generative fill](#generative-fill) uploads a mask; **Process with ComfyUI** runs a mask node with its saved file.

### Custom inputs

Any other node titled `DataForge <name>`, such as `DataForge Denoise`, adds a field called `<name>` to the dialog:

1. Title a primitive node (Int, Float, String, or Boolean) and wire its output wherever the value is needed.
2. The dialog shows a number, whole-number, text, or on/off field to match the saved value, with that value as the placeholder.
3. DataForge writes the node's `value`, or its only literal input when it has no `value`. Leave the field empty to keep the saved value.

Like prompt and seed, values are remembered per preset. Two nodes with the same title add no field.

## Generative fill

The image editor's **Fill** tool ([how to use it](user-guide.md#generative-fill)) runs Qwen-Image 2.1 with ComfyUI's native masked sampler. Its two workflows ship with DataForge in [`comfy_fill_templates/`](../comfy_fill_templates/); they are not presets and do not appear under **Process with ComfyUI**. Fill and processing share one queue, so they never run at the same time.

### Install

1. Update ComfyUI to a release with Qwen-Image 2.1 support (the `TextEncodeQwenImage21` node). The templates were written against ComfyUI 0.42.0 and use only core nodes; LanPaint is not required.
2. Download these files from [Comfy-Org/Qwen-Image-2.1](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) into the matching `ComfyUI/models` folders:

| File | Folder | Used by |
| --- | --- | --- |
| `qwen_image_2.1_int8_convrot.safetensors` | `diffusion_models/` | Fast and Quality |
| `qwen3vl_8b_int8_convrot.safetensors` | `text_encoders/` | Fast and Quality |
| `qwen_image_2.1_vae_bf16.safetensors` | `vae/` | Fast and Quality |
| `qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors` | `loras/` | Fast |

The bf16 diffusion model and text encoder from the same repository work too; enter their names in **Settings > Integrations > Generative fill**. Keep every file from the Qwen-Image 2.1 release. Fast adds the Turbo LoRA to the base model; it does not use the separate full Turbo checkpoint, whose fixed eight-step schedule needs a different workflow.

The Qwen-Image 2.1 weights are released under the [Qwen Research license](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE); check its terms before using results commercially.

The Fill tool checks ComfyUI each time it opens and names any missing node or model file. A preset that cannot run stays selectable, but **Generate** stays off; DataForge never switches to the other preset by itself.

### Presets and settings

| Preset | Model | Steps | CFG | Sampler |
| --- | --- | --- | --- | --- |
| Fast | Base model + Turbo LoRA at strength 1.0 | 8 | 1 | KSampler, Euler, simple |
| Quality | Base model | **Quality steps**, default 30 | 1 | KSampler, Euler, simple |

At CFG 1 the negative prompt has no effect, so the templates leave it empty.

These settings are in **Settings > Integrations > Generative fill** and in `.env`. File names are as ComfyUI lists them.

| Variable | Default | Effect |
| --- | --- | --- |
| `COMFY_FILL_DIFFUSION_MODEL` | `qwen_image_2.1_int8_convrot.safetensors` | Diffusion model file |
| `COMFY_FILL_TEXT_ENCODER` | `qwen3vl_8b_int8_convrot.safetensors` | Text encoder file |
| `COMFY_FILL_VAE` | `qwen_image_2.1_vae_bf16.safetensors` | VAE file |
| `COMFY_FILL_TURBO_LORA` | `qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors` | Turbo LoRA file, used by Fast |
| `COMFY_FILL_QUALITY_STEPS` | `30` | 1 to 100; steps for Quality |

The former `COMFY_FILL_LANPAINT_STEPS` setting is ignored; remove it from `.env`.

Both presets have been checked on a masked door-removal example with ComfyUI 0.42.0 and the default model files. This is a focused regression check, not a broad quality benchmark: complex textures and boundaries can still need a more specific instruction or another generation.

### What ComfyUI receives

For each generation, DataForge uploads two PNGs to `input/dataforge/`:

- **A crop** around the selection, with enough surrounding scene to continue it, scaled to about one megapixel on a 32-pixel grid. A crop with transparency keeps its alpha, which the Qwen-Image 2.1 VAE edits along with the color.
- **A black-and-white mask**, white where ComfyUI regenerates: the painted selection grown by a small border.

The workflow marks the selection in solid magenta on a separate reference image for Qwen's instruction encoder. This tells the model which edit is wanted and hides the object being removed. The sampler works on the original image's latent with a noise mask; the marked reference is never used as the source latent or pasted into the saved image.

DataForge scales the result back, blends it into the original through a feathered version of the selection, and stores it losslessly. Pixels outside that blend never change. Each generation uses a new random seed, so every run is a variation, not a repeat.

## Inspect embedded workflows

Click the **ComfyUI** badge in a file's detail view to inspect its embedded prompts, models, LoRAs, settings, and saved output names. This works for PNG, MP4, MOV, and M4V, including files made outside DataForge. Stripping metadata removes the embedded workflow.

**Copy workflow** copies the part of the workflow that leads to the selected output. Paste it onto the ComfyUI canvas to load it; this replaces the open tab's graph. It needs the editor workflow ComfyUI embeds alongside the prompt, so it is unavailable for files that carry only the API format.

**Outputs and passes.**

- When a workflow has several outputs, select one to inspect it. DataForge shows the generation stage that feeds that output, rather than mixing in settings from earlier stages.
- When a stage samples more than once, such as a base pass followed by an upscale, high-res, or face-detail pass, settings are grouped per pass. Settings that several passes read are listed as **Shared**.
- A pass that a switch routes around is marked **Skipped**, and one bypassed in the editor is marked **Bypassed**; their settings are still listed, dimmed. Settings of bypassed nodes need a workflow saved by a recent ComfyUI frontend.

The **Workflow map** below the details shows the stage's passes and what feeds them: models, LoRAs, CLIP text encoders, VAEs, prompts, and input media, including images or audio generated by an earlier stage. A file loaded by several nodes, such as one loader per subgraph, is shown once. Hover a box for its details and connections; click a pass to jump to its settings.

An output whose file name matches is marked **Likely output**. This is only a hint: the embedded workflow cannot confirm which node wrote the file. If several outputs match, or the file was renamed, compare the listed outputs yourself.

## Troubleshooting

**Preset missing.** Check the preset folder and the `.json` extension. Export in API format, then reopen the dialog.

**ComfyUI unavailable.** Start it, check its origin in Settings, and test the connection before saving.

**Ambiguous workflow or refused prompt.** Title the nodes `DataForge Input` and `DataForge Output`. Prompt, seed, and custom input nodes must hold their own values, not receive them through a connection. Export again.

**Timeout or failed output.** Check ComfyUI's queue and history, and DataForge's per-file result. Raise `COMFY_IMAGE_TIMEOUT` or `COMFY_VIDEO_TIMEOUT` for slow renders; GIFs use the video timeout and fills the image timeout. Validating video needs ffmpeg.

**Fill unavailable.** The Fill tool's status line names the missing ComfyUI node or model file. Update ComfyUI or download the file, then reopen the tool.

**A kept fill cannot be applied.** The original changed outside DataForge, or a fill's stored pixels are gone. Undo the fills it names and generate them again.
