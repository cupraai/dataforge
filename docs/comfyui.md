# ComfyUI

[Documentation](README.md)

Run images or videos through ComfyUI workflows such as upscaling, restoration, or interpolation. DataForge stages each result for review, so processing never changes the source until you accept. You can also [generate new media](#generate-media) into a folder, [showcase a LoRA](#showcases), and ComfyUI powers the image editor's [generative fill](#generative-fill). Install and run ComfyUI separately.

- [Connect ComfyUI](#connect-comfyui)
- [Try it](#try-it)
- [Run a folder](#run-a-folder)
- [Generate media](#generate-media)
- [Showcases](#showcases)
  - [Prepare a showcase](#prepare-a-showcase) · [Run a showcase](#run-a-showcase) · [Showcase sheet](#showcase-sheet)
- [The workflow map](#the-workflow-map)
- [Review candidates](#review-candidates)
  - [Bulk acceptance and deletion](#bulk-acceptance-and-deletion) · [How results pair with sources](#how-results-pair-with-sources)
- [Write a preset](#write-a-preset)
  - [Edit and generation presets](#edit-and-generation-presets) · [Input and output nodes](#input-and-output-nodes) · [Optional nodes](#optional-nodes) · [Custom inputs](#custom-inputs)
- [Generative fill](#generative-fill)
  - [Install](#install) · [Presets and settings](#presets-and-settings) · [What ComfyUI receives](#what-comfyui-receives)
- [Inspect embedded workflows](#inspect-embedded-workflows)
- [Troubleshooting](#troubleshooting)

## Connect ComfyUI

1. Start ComfyUI.
2. Open **Settings > Integrations**.
3. Enter its origin in **ComfyUI URL**: the service address, not a page URL. The default is `http://127.0.0.1:9000`.
4. Use **Test connection**, then **Save**.

You can also set the connection in `.env`:

| Variable | Default | Effect |
| --- | --- | --- |
| `COMFY_BASE_URL` | `http://127.0.0.1:9000` | HTTP(S) origin of ComfyUI |
| `COMFY_WORKFLOWS_DIR` | `comfy_workflows/` | Folder of API-format JSON presets |
| `COMFY_IMAGE_TIMEOUT` | `900` | Image timeout, in seconds |
| `COMFY_VIDEO_TIMEOUT` | `7200` | Video timeout, in seconds |

- **Restart and precedence.** Environment changes need a restart, and a value saved in Settings wins. `COMFY_BASE_URL` is also in Settings.
- **Paths.** Prefer absolute paths: relative overrides resolve against the server's working directory, normally `backend/`.
- **Image timeout** applies per image, per generation with an image saver, and per generative fill. Values below 30 or malformed values use the default.
- **Video timeout** applies per GIF or video, and per generation with any other saver. Values below 60 or malformed values use the default.
- **Generative fill.** Its variables are listed under [Presets and settings](#presets-and-settings).

Further notes:

- **Remote ComfyUI.** A remote ComfyUI receives the source media, showcase start files, and workflow inputs.
- **Uploads accumulate.** Uploaded sources accumulate in ComfyUI's `input/dataforge/` folder. ComfyUI has no endpoint to remove them, so clear old uploads there by hand.
- **Tools menu.** **Tools** offers each ComfyUI job when a preset for it exists, even if ComfyUI is stopped; the dialog reports whether it is available.

## Try it

- **Edit preset.** The bundled [`example_lanczos_2x.json`](../comfy_workflows/example_lanczos_2x.json) resizes images 2× with core nodes and needs no model downloads.
- **Generation preset.** The bundled [`example_solid_color.json`](../comfy_workflows/example_solid_color.json) tries [generation](#generate-media) the same way: it writes a 512 × 512 solid-color image, with **Color** and **Batch size** fields.
- **Review without a run.** Open [`sample_media/`](../sample_media/) and choose **Review candidates**.

## Run a folder

1. Open the dataset itself, not its `staging/` folder.
2. Select files, or search and filter, to limit the run; otherwise it covers the whole folder. See [job scope](user-guide.md#scope).
3. Choose **Run ComfyUI workflow**, then an [edit preset](#edit-and-generation-presets) from **Workflow presets** on the left. Each row says what it takes: prompt, seed, and how many custom inputs. The [workflow map](#the-workflow-map) in the middle shows what it runs.
4. Optionally enter **Prompt**, and **Seed** or the preset's [custom inputs](#custom-inputs) under **Workflow inputs**. For edit presets, each field is enabled only when the workflow has the matching titled node.
5. Under **Output**, choose whether to overwrite previously staged results, then start.

DataForge uploads one file at a time and stages the workflow's output with a `.comfy.json` run record.

- **Existing candidates** are skipped unless overwrite is on.
- **Collisions.** Outputs that would [collide](#how-results-pair-with-sources) with another source's candidate are refused, even with overwrite on.
- **Validation.** A result must decode before it is staged, and again before it is accepted, so a bad output never replaces a source or an earlier candidate. Validating video needs ffmpeg.
- **Unsupported files.** The workflow decides which inputs it supports. An unsupported or failed file is reported, and processing continues.
- **Console.** The panel shows ComfyUI's console, including output from other work on that server.
- **Cancel.** Cancelling removes the queued prompt or interrupts the running one; results already staged remain.

## Generate media

**Run ComfyUI workflow** with a generation preset runs it a number of times and adds what it makes to the open folder as new files. It reads no files, so search, filters, and selection do not apply, and it runs in an empty folder too.

1. Open the folder the new files should go to. A `staging/` folder is refused.
2. Choose **Run ComfyUI workflow** and a [generation preset](#edit-and-generation-presets) from **Workflow presets**. The dialog switches to the generation options, and the [workflow map](#the-workflow-map) shows what the selected one runs.
3. Optionally enter **Prompt**, **Seed**, and the preset's [custom inputs](#custom-inputs).
4. Under **Output**, set **Generations**, how many times the workflow runs, and optionally a **File name prefix**.
5. Optionally turn on **Save as caption** beside **Prompt**, then start.

**Saved** beside **Prompt** in every ComfyUI dialog keeps prompts under a name, for any folder; inserting one adds it after the text already typed.

**File names**

- **Pattern.** Files are named `<prefix>_0001.png` onwards, as `.png`, `.mp4`, `.mov` or `.gif`. A workflow that writes any other format fails that generation.
- **Prefix.** The prefix is the preset's name unless you enter one.
- **Numbering** continues after the highest number the prefix already uses in the folder, counting captions and other related files, so a re-run adds to the series.
- **No replacement.** A file is never replaced: if a name is taken while a result downloads, the next free number is used.
- **Batches.** A workflow that saves a batch writes one file per image, all from one generation.

**Seed, prompt, and results**

- **Seed.** Leave it empty for a new random seed per generation. A number seeds the first generation and counts up for each one after, so running the same settings again repeats the images. Each file's row in the Jobs drawer names its seed.
- **Where the seed goes.** The seed goes to the **DataForge Seed** node, or, when a generation preset has none, to every sampler that holds its own `seed` or `noise_seed`. A preset with neither repeats the same settings each time.
- **Prompt.** An empty field runs the prompt saved in the preset.
- **Save as caption** saves the prompt the run used, typed or saved, as each file's `.txt` caption. It is unavailable for presets without a **DataForge Prompt** node.
- **What is kept.** The file is saved exactly as ComfyUI wrote it, including its embedded workflow, so the [ComfyUI badge](#inspect-embedded-workflows) can show how it was made. It must decode before it gets a name in the folder; video validation needs ffmpeg.
- **Failures.** A generation that fails is reported and the rest continue. Files a failed batch already wrote are kept.
- **Cancel.** Cancelling stops after the current generation is interrupted or removed from ComfyUI's queue.
- **One queue.** Generations, showcases, processing, and fills share one queue, so they never run at the same time.
- **Not a workflow step.** Generation presets and showcases cannot be [workflow](user-guide.md#workflows) steps, because the steps after them run on a scope fixed before their files exist.

## Showcases

**LoRA showcase** renders a list of items with a LoRA you trained, in one run. Each item has its own prompt, seed, and extra LoRAs, and optionally a start image or video.

To compare LoRAs, such as the saves of one training run, choose several: every item renders once per LoRA on the same seed, so only the LoRA differs.

### Prepare a showcase

1. Copy the LoRA into ComfyUI's `models/loras` folder, in any subfolder. DataForge lists what ComfyUI lists and never copies files.
2. Export a workflow that renders one result as a [preset](#write-a-preset), with or without a source loader. The LoRAs go after its only `UNETLoader` or `CheckpointLoaderSimple`. With several, title each node whose model they patch `DataForge Model`; each gets the same LoRAs.

How the LoRAs are added:

- **Model only.** LoRAs are added with ComfyUI's core **LoraLoaderModelOnly**, so they patch the diffusion model only, as AI-Toolkit trains them.
- **Existing LoRAs.** LoRAs already in the workflow still run.
- **Recorded.** The results embed what was added, so the [ComfyUI badge](#inspect-embedded-workflows) lists every LoRA and strength.

### Run a showcase

1. Open the folder the files should go to. Showcase results use the same [file naming and numbering as generation presets](#generate-media). If a LoRA was trained on this folder, the dialog warns you, because [training reads every file in it](ai-toolkit.md#start-a-run).
2. Choose **LoRA showcase**, a preset, and under **LoRA to showcase** up to 8 LoRAs. **Every save of** a recent training run picks that run's saves in training order.
3. Add up to 50 items. Untick one to keep it without rendering it. Each item sets its own [custom inputs](#custom-inputs); an empty one runs the value the preset was saved with.
4. Optionally set a **File name prefix**, turn on **Save as caption** beside **Prompt** for every item, or **Make a showcase sheet**, then start.

- **Order.** Items run in list order, each once per LoRA, up to 200 generations in all.
- **Failures.** A failed one is reported and the rest continue.
- **Strength.** From -10 to 10, for the showcased LoRA and for up to 8 more LoRAs per item.
- **Seed.** Empty draws one random seed per item. A number is used as entered. Without a `DataForge Seed` node it goes to every sampler that holds its own `seed` or `noise_seed`, also in presets with a source loader.
- **Start image or video.** Offered for presets with a source loader, from the open folder's files, newest first; type to search by name.
- **Without a start file.** The start file is optional: an item without one runs the workflow without its loader and the nodes that only prepare its file. That works when the workflow takes the file through an optional input, such as `first_frame` on MiniMax H3's image-to-video node. Otherwise the job stops before rendering anything and names the node that requires it.
- **Missing LoRAs.** The job asks ComfyUI for every LoRA first and stops before rendering if one is missing.
- **Sets** keeps the preset and items under a name, for any folder and without the LoRAs, so the next LoRA can be shown with the same prompts. Up to 50 sets can be saved.

### Showcase sheet

**Make a showcase sheet** lays the finished results out on one labelled grid, saved as `<prefix>_sheet_0001.png`, or `.mp4` when any result is a video. Nothing needs setting up:

- **Several LoRAs:** items run down and LoRAs across. Saves of one training run are in training order, labelled by step.
- **One LoRA:** the items fill a square grid, each labelled underneath.
- **Item labels:** the item's label, else its prompt's first line, or its number when several prompts open alike.
- **Failed results** leave their place blank; an item that failed throughout is left out.

Limits:

- **Video sheets** run as long as their longest clip, up to two minutes, while shorter clips hold their last frame. They have no sound and need ffmpeg.
- **Size.** A sheet holds up to 64 results.
- **Cancel and failure.** A cancelled showcase makes no sheet, and a sheet that fails leaves the results as they are.

## The workflow map

The **Run ComfyUI workflow** dialog draws the selected preset between the preset list and its settings, in the same style as the [embedded workflow map](#inspect-embedded-workflows): the models, CLIPs, VAEs, LoRAs, prompts and input media that feed each sampling pass, and the output. Hover a box for its details and connections.

- **Source box.** The box DataForge loads each source file into reads **Each source file**, not the placeholder file the preset was saved with.
- **Prompt box.** It shows the preset's saved text; its details note that a prompt you enter replaces it.
- **Workflow inputs.** The map follows the **Workflow inputs** you set: switching a boolean that drives an If/Else or Impact switch marks the pass it turns off as not run, or draws the one it turns on. An input whose value does not parse is drawn as saved.
- **No sampler.** A preset without a sampler shows its loaders feeding the output directly. One that loads nothing shows only the output.
- **Parse errors.** A preset that cannot be parsed shows the reason instead of a map, so you can fix it before starting.

## Review candidates

Open **Review > Pending candidates** (**Review candidates** in Quick actions) for a side-by-side comparison, or use the review control in a file's inspector.

- **Comparison.** It shows dimensions, sizes, resolution gain, and perceptual difference.
- **Playback.** Videos start muted and loop, and playback, pause, and seeking stay in sync when both sides are video. GIFs play as images.

| Action | Key | Effect |
| --- | --- | --- |
| **Accept** | `Ctrl+Enter` | Replaces the source with the result, in the result's format |
| **Reject** | `Ctrl+Backspace` | Removes the candidate and its run record, leaving the source unchanged |
| **Skip**, **Back** | Arrow keys, `Home` / `End` | Navigate without deciding |

When you accept, the stem and caption are kept, and issue and duplicate file names are updated. **No source backup is kept; acceptance has no undo.**

**Keep original metadata**

- **Default.** On by default, and remembered for individual and bulk acceptance.
- **Effect.** Replaces the result's EXIF, XMP, and text/workflow metadata with the source's. Turn it off to keep the result's own metadata.
- **Supported pairings.** Image sources with PNG results, and video sources with MP4 or MOV results. Other pairings, and an image source with no metadata at all, keep the result's metadata.
- **Failure.** If a supported transfer fails, the result stays staged and the source is unchanged.

**Special cases**

- **Edited sources.** If the source has an edit, accepting asks before discarding its settings and kept original; the candidate becomes the new original. Cancelling that question leaves both versions unchanged.
- **Videos.** Review warns about duration differences and lost audio. The difference score compares only the first frame, so watch playback before accepting.
- **Orphans.** An orphan, whose source was moved or deleted outside DataForge, can only be rejected.

### Bulk acceptance and deletion

Use these commands in Quick actions (`Ctrl+P`):

| Command | With a selection |
| --- | --- |
| **Accept all staged candidates** | **Accept selected candidates** |
| **Delete all staged candidates** | **Delete selected candidates** |

With a selection, the commands include only those sources' candidates. Filters alone do not limit these commands.

- **Bulk acceptance** asks for confirmation, offers **Keep original metadata**, and skips the individual comparisons. It discards any source edit and original, and keeps no backup.
- **Bulk deletion** keeps the sources and sends the candidates to the Recycle Bin or Trash.
- **Failures.** Each command reports failures; candidates that failed stay available for review.

### How results pair with sources

- **Same stem, any format.** A result is staged under its source's stem, in whatever format the workflow produces: `photo.jpg` can pair with `staging/photo.png` or `staging/photo.mp4`.
- **Same-stem sources.** If both `photo.jpg` and `photo.png` exist, `staging/photo.png` belongs to the PNG. Results named exactly like their source, including older `staging/photo.jpg` results, still pair.
- **Collisions.** Processing refuses output names that would collide with another source's candidate, even with overwrite on. Give same-stem sources unique names before processing.
- **Run record.** Each result has a `<result-name>.comfy.json` record of the workflow, run details, and perceptual difference score. Older results without a score are scored when reviewed.
- **Difference score.** The percentage of bits that differ in a perceptual hash, a compact fingerprint of a frame's appearance. It helps spot large visual changes; it does not measure quality.

## Write a preset

1. Build a workflow in ComfyUI and test it on one file.
2. Export it with **Save (API Format)**. A regular workflow save is not accepted.
3. Put the `.json` file in `comfy_workflows/`, or the folder set by `COMFY_WORKFLOWS_DIR`.
4. It appears in the matching dialogs within a second or two, open ones included. Removing or exporting a preset again updates them too. If the selected preset is removed, nothing is selected until you choose another or it returns.

- **Name.** The file name becomes the preset name: `upscale-2x.json` appears as `upscale-2x`.
- **Git.** Git tracks only the bundled examples; your presets in the default folder are ignored.

### Edit and generation presets

One folder holds both kinds. A source loader is a node titled `DataForge Input` or any `LoadImage` or `VHS_LoadVideo` node.

| Kind | Source loader | What it does |
| --- | --- | --- |
| Edit preset | Yes | **Run ComfyUI workflow** runs it on each file in the scope and stages the results for review |
| Generation preset | No | Makes new files instead |

Where each kind is listed:

- **Run ComfyUI workflow** lists both kinds.
- **Workflow steps** list only edit presets.
- **LoRA showcase** lists both kinds when it can [place the LoRAs](#prepare-a-showcase).
- **Unparseable presets** are listed everywhere, so starting one names the fix.

A generation preset that loads a fixed reference image, for example for a ControlNet, must load it with a node other than `LoadImage` or `VHS_LoadVideo`, or it counts as an edit preset.

### Input and output nodes

Generation presets need only the output node. A workflow with one loader and one saver works without titles:

| Media | Loader | Saver |
| --- | --- | --- |
| Images | `LoadImage` | `SaveImage` |
| Video | `VHS_LoadVideo` | `VHS_VideoCombine` |

If there is more than one candidate, give these **node titles** (not node types):

| Node title | Node | Input DataForge changes |
| --- | --- | --- |
| `DataForge Input` | Source loader | `image` or `video`, set to the uploaded file name |
| `DataForge Output` | Result saver | `filename_prefix` |

- **Direct file writers.** For these, `DataForge Output` sets `filename` instead of `filename_prefix`.
- **Ambiguity.** A video preview node can count as another saver. DataForge refuses ambiguous workflows.
- **No output.** If the designated output produces no file, that source fails; output from another node is never used instead.

Not supported:

- Filesystem-path loaders such as `VHS_LoadVideoPath`: DataForge supplies uploaded file names, not paths on the ComfyUI machine.
- `VHS_BatchManager`: its follow-up prompts cannot be tracked and cancelled as one run. Use shorter clips, or process chunks within one prompt.

### Optional nodes

| Node title | Input DataForge changes | Value written |
| --- | --- | --- |
| `DataForge Prompt` | `text`, `value`, or `prompt` | The entered prompt |
| `DataForge Seed` | `seed`, `noise_seed`, or `value` | The seed |
| `DataForge Mask` | `image` | An uploaded black-and-white mask |
| `DataForge Model` | None | None |

- **Prompt** is available when a node is titled `DataForge Prompt`, and is written only if a prompt is entered. A blank prompt or custom input uses the value saved in the preset. To expose an input, set its value directly on the titled node.
- **Seed** is available for an edit preset with a `DataForge Seed` node. Edit presets keep the saved seed when the field is empty. Generation presets and showcases also recognize samplers with their own `seed` or `noise_seed` input. See [generation seeds](#generate-media) and [showcase seeds](#showcases) for how each run uses them.
- **Mask.** Only the editor's [generative fill](#generative-fill) uploads a mask; **Run ComfyUI workflow** runs a mask node with its saved file.
- **Model.** A [showcase](#showcases) adds its LoRAs after this node's model.

### Custom inputs

Any other node titled `DataForge <name>`, such as `DataForge Denoise`, adds a field called `<name>` to the dialog:

1. Title a primitive node (Int, Float, String, or Boolean) and wire its output wherever the value is needed.
2. The dialog shows a number, whole-number, text, or on/off field to match the saved value, with that value as the placeholder.
3. DataForge writes the node's `value`, or its only literal input when it has no `value`. Leave the field empty to keep the saved value.

- **Remembered values.** Values are remembered per preset with the prompt. An edit preset remembers the seed too; a generation preset never does, so each run starts random. A showcase remembers them per item.
- **Duplicate titles.** Two nodes with the same title add no field.

## Generative fill

The image editor's **Fill** tool runs Qwen-Image 2.1 with ComfyUI's native masked sampler. See [Using generative fill](user-guide.md#generative-fill) for the tool itself.

- **Workflows.** The Fast and Quality workflows ship in [`comfy_fill_templates/`](../comfy_fill_templates/) and are selected in the image editor.
- **Queue.** Fill shares ComfyUI's queue with **Run ComfyUI workflow** and **LoRA showcase**.

### Install

1. Update ComfyUI to a release with Qwen-Image 2.1 support (the `TextEncodeQwenImage21` node). The templates were written against ComfyUI 0.42.0 and use only core nodes; LanPaint is not required.
2. Download these files from [Comfy-Org/Qwen-Image-2.1](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) into the matching `ComfyUI/models` folders:

| File | Folder | Used by |
| --- | --- | --- |
| `qwen_image_2.1_int8_convrot.safetensors` | `diffusion_models/` | Fast and Quality |
| `qwen3vl_8b_int8_convrot.safetensors` | `text_encoders/` | Fast and Quality |
| `qwen_image_2.1_vae_bf16.safetensors` | `vae/` | Fast and Quality |
| `qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors` | `loras/` | Fast |

- **bf16 alternatives.** The bf16 diffusion model and text encoder from the same repository work too; enter their names in **Settings > Integrations > Generative fill**.
- **Same release.** Keep every file from the Qwen-Image 2.1 release.
- **Turbo.** Fast adds the Turbo LoRA to the base model. It does not use the separate full Turbo checkpoint, whose fixed eight-step schedule needs a different workflow.
- **License.** The Qwen-Image 2.1 weights are released under the [Qwen Research license](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE); check its terms before using results commercially.

**Readiness check.** The Fill tool checks ComfyUI each time it opens and names any missing node or model file. A preset that cannot run stays selectable, but **Generate** stays off; DataForge never switches to the other preset by itself.

### Presets and settings

Both presets run the base model in a KSampler.

| Preset | LoRA | Steps | CFG | Sampler | Scheduler |
| --- | --- | --- | --- | --- | --- |
| Fast | Turbo LoRA at strength 1.0 | 8 | 1 | Euler | simple |
| Quality | None | **Quality steps** setting | **Quality CFG** setting | Euler | simple |

- **Quality defaults.** **Quality steps** defaults to 30 and **Quality CFG** to 3.
- **Negative prompt.** Both templates leave the negative prompt empty. At CFG 1 it has no effect; above 1 the sampler guides against the empty prompt, so each Quality step runs the model twice.

These settings are in **Settings > Integrations > Generative fill** and in `.env`. File names are as ComfyUI lists them.

**Model files**

| Variable | Default | Effect |
| --- | --- | --- |
| `COMFY_FILL_DIFFUSION_MODEL` | `qwen_image_2.1_int8_convrot.safetensors` | Diffusion model file |
| `COMFY_FILL_TEXT_ENCODER` | `qwen3vl_8b_int8_convrot.safetensors` | Text encoder file |
| `COMFY_FILL_VAE` | `qwen_image_2.1_vae_bf16.safetensors` | VAE file |
| `COMFY_FILL_TURBO_LORA` | `qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors` | Turbo LoRA file |

Only Fast uses the Turbo LoRA.

**Quality preset**

| Variable | Default | Range | Effect |
| --- | --- | --- | --- |
| `COMFY_FILL_QUALITY_STEPS` | `30` | 1 to 100 | Steps for Quality |
| `COMFY_FILL_QUALITY_CFG` | `3.0` | 1 to 10 | CFG for Quality |

- **Removed setting.** The former `COMFY_FILL_LANPAINT_STEPS` setting is ignored; remove it from `.env`.
- **Tested.** Both presets have been checked on a masked door-removal example with ComfyUI 0.42.0 and the default model files. This is a focused regression check, not a broad quality benchmark: complex textures and boundaries can still need a more specific instruction or another generation.

### What ComfyUI receives

For each generation, DataForge uploads two PNGs to `input/dataforge/`:

- **A crop** around the selection, with enough surrounding scene to continue it, scaled to about one megapixel on a 32-pixel grid. A crop with transparency keeps its alpha, which the Qwen-Image 2.1 VAE edits along with the color.
- **A black-and-white mask**, white where ComfyUI regenerates: the painted selection grown by a small border.

What happens to them:

- **Magenta reference.** The workflow marks the selection in solid magenta on a separate reference image for Qwen's instruction encoder. This tells the model which edit is wanted and hides the object being removed.
- **Sampling.** The sampler works on the original image's latent with a noise mask; the marked reference is never used as the source latent or pasted into the saved image.
- **Blending.** DataForge scales the result back, blends it into the original through a feathered version of the selection, and stores it losslessly. Pixels outside that blend never change.
- **Seed.** Each generation uses a new random seed, so every run is a variation, not a repeat.

## Inspect embedded workflows

Click the **ComfyUI** badge in a file's detail view to inspect its embedded prompts, models, LoRAs, settings, and saved output names.

- **Formats.** This works for PNG, MP4, MOV, and M4V, including files made outside DataForge.
- **Stripping metadata** removes the embedded workflow.
- **Copy workflow** copies the part of the workflow that leads to the selected output. Paste it onto the ComfyUI canvas to load it; this replaces the open tab's graph. It needs the editor workflow ComfyUI embeds alongside the prompt, so it is unavailable for files that carry only the API format.
- **Generate with this workflow...** For an output that can run without a source file, this opens **Run ComfyUI workflow** with that output and its prompt. Choose the number of generations and start the run directly from the embedded workflow.

**Outputs and passes**

- **Several outputs.** When a workflow has several outputs, select one to inspect it. DataForge shows the generation stage that feeds that output, rather than mixing in settings from earlier stages.
- **Several passes.** When a stage samples more than once, such as a base pass followed by an upscale, high-res, or face-detail pass, settings are grouped per pass. Settings that several passes read are listed as **Shared** before the first of them, naming those passes, such as **Passes 3–6**, so each model stays with the passes that use it. Settings read after sampling, such as the frame rate and the VAE that decodes the result, are listed last, under **Output**.
- **Skipped and bypassed.** A pass that a switch routes around is marked **Skipped**, and one bypassed in the editor is marked **Bypassed**; their settings are still listed, dimmed. Settings of bypassed nodes need a workflow saved by a recent ComfyUI frontend.

**Workflow map and likely output**

- **Workflow map.** The map below the details shows the stage's passes and what feeds them: models, LoRAs, CLIP text encoders, VAEs, prompts, and input media, including images or audio generated by an earlier stage. A file loaded by several nodes, such as one loader per subgraph, is shown once. Hover a box for its details and connections; click a pass to jump to its settings.
- **Likely output.** An output whose file name matches is marked **Likely output**. This is only a hint: the embedded workflow cannot confirm which node wrote the file. If several outputs match, or the file was renamed, compare the listed outputs yourself.

## Troubleshooting

- **Preset missing.** Check the preset folder and the `.json` extension. Export in API format. Which dialogs list it depends on its nodes; see [Edit and generation presets](#edit-and-generation-presets).
- **ComfyUI unavailable.** Start it, check its origin in Settings, and test the connection before saving.
- **Ambiguous workflow or refused prompt.** Title the nodes `DataForge Input` and `DataForge Output`. Prompt, seed, and custom input nodes must hold their own values, not receive them through a connection. Export again.
- **Timeout or failed output.** Check ComfyUI's queue and history, and DataForge's per-file result. Raise `COMFY_IMAGE_TIMEOUT` or `COMFY_VIDEO_TIMEOUT` for slow renders; GIFs use the video timeout and fills the image timeout. Validating video needs ffmpeg.
- **Fill unavailable.** The Fill tool's status line names the missing ComfyUI node or model file. Update ComfyUI or download the file, then reopen the tool.
- **A kept fill cannot be applied.** The original changed outside DataForge, or a fill's stored pixels are gone. Undo the fills it names and generate them again.
