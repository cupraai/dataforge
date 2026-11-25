# Train LoRAs with AI-Toolkit

[Documentation](README.md)

**LoRA training** starts a run on the open dataset and shows its progress and samples in DataForge. [Ostris AI-Toolkit](https://github.com/ostris/ai-toolkit) does the training and owns the outputs; install and run it separately.

- [Connect AI-Toolkit](#connect-ai-toolkit)
  - [Variables](#variables) · [Shared paths](#shared-paths) · [Database location](#database-location)
- [Start a run](#start-a-run)
  - [Templates](#templates) · [Template settings](#template-settings) · [Edit a template](#edit-a-template)
- [Monitor](#monitor)
- [Troubleshooting](#troubleshooting)

## Connect AI-Toolkit

1. Start AI-Toolkit.
2. Open **Settings > Integrations**.
3. Enter its origin in **AI-Toolkit URL**. The default is `http://127.0.0.1:8675`.
4. Use **Test connection**, then **Save**.

### Variables

| Variable | Default | Where to set | Effect |
| --- | --- | --- | --- |
| `OSTRIS_BASE_URL` | `http://127.0.0.1:8675` | Environment or Settings | AI-Toolkit's HTTP(S) origin |
| `OSTRIS_TOOLKIT_ROOT` | unset | Environment only | AI-Toolkit's installation folder, where **Stop** looks for its database |

- **Restart.** Environment changes need a restart.
- **Settings win.** A URL saved in Settings wins over `.env`; **Reset**, then **Save**, removes it.

### Shared paths

DataForge sends AI-Toolkit a dataset path, not the media, so both must see the same files:

- **Dataset.** AI-Toolkit must be able to read the dataset at the exact path DataForge supplies.
- **Training folder.** DataForge needs filesystem access to AI-Toolkit's training folder to show samples.
- **Database.** DataForge needs filesystem access to AI-Toolkit's database (`aitk_db.db`) to stop a running job.

A reachable API on another machine is not enough without those shared paths.

### Database location

**Stop** looks for the database beside the training folder. If it is elsewhere, set AI-Toolkit's installation folder in `.env` and restart DataForge:

```dotenv
OSTRIS_TOOLKIT_ROOT=C:\AI-Toolkit
```

- **Lookup only.** This only helps DataForge find that file; it does not start the service or change its address.
- **Absolute path.** Prefer an absolute path; a relative one resolves against the server's working directory, normally `backend/`.

## Start a run

1. Open the dataset.
   - **Whole folder.** Training uses **the whole folder** and its `.txt` captions, regardless of selection or filters.
   - **Subfolders.** AI-Toolkit reads its subfolders too, except those starting with a dot, so `staging/`, `clips/`, and `watermarked/` are trained on: empty or move them first.
2. Choose **LoRA training** and a [template](#templates) that matches your media.
3. Enter a unique LoRA name and an optional trigger word. An empty trigger means no trigger.
4. Add at least one sample prompt. Training generates samples from these prompts at the template's sample intervals.
5. Optionally [**Edit template**](#edit-a-template).
6. Choose **Start training**. DataForge creates the job, queues it on the GPU AI-Toolkit reports, and starts that queue.

### Templates

| Model | Media | Template |
| --- | --- | --- |
| **Krea 2 Raw** | Images | [`krea2_raw.yml`](../ostris_templates/krea2_raw.yml) |
| **Krea 2 Turbo** | Images | [`krea2_turbo.yml`](../ostris_templates/krea2_turbo.yml) |
| **MOSS-Image SFT** | Images | [`moss_image_sft.yml`](../ostris_templates/moss_image_sft.yml) |
| **Qwen Image 2.1** | Images | [`qwen_image_2.yml`](../ostris_templates/qwen_image_2.yml) |
| **Qwen Image 2.1 Turbo** | Images | [`qwen_image_2_turbo.yml`](../ostris_templates/qwen_image_2_turbo.yml) |
| **MiniMax H3** | Videos | [`h3_fl2va.yml`](../ostris_templates/h3_fl2va.yml) |
| **MiniMax H3 Ref2VA** | Videos | [`h3_ref2va.yml`](../ostris_templates/h3_ref2va.yml) |

### Template settings

Templates set the architecture, resolution, steps, optimizer, learning rate, sampling, and, for video, frame counts. Review them for your data; models do not share the same settings.

- **H3.** The H3 templates train on 39 frames and generate 56-frame samples; training and sample lengths are separate settings.
- **Qwen Image 2.1 Turbo.** The template includes its training adapter and uses 8-step samples at guidance scale 1.
- **Krea 2 Raw.** Uses the base model without a training adapter.

AI-Toolkit must support the selected model and adapter.

### Edit a template

**Edit template** in the dialog changes that run only:

- **Per model.** Each model keeps its edit while the dialog is open.
- **Files unchanged.** The files in `ostris_templates/` never change.
- **Validation.** DataForge checks that the YAML is valid and has a `config.process` list whose first entry contains dataset and sample sections.
- **Filled in by DataForge.** The name, training folder, the first dataset's path, the trigger word, and the sample prompts. Every other value is yours.

## Monitor

- **Jobs drawer.** Shows AI-Toolkit runs with status, progress, time remaining, the latest samples, and a link to the dataset folder.
- **Samples** refresh every 10 seconds while it runs.
- **Stop** asks AI-Toolkit to save a checkpoint and stop, which can take a moment.

**Outputs.** AI-Toolkit reads the dataset itself and writes checkpoints and samples to its configured training folder.

- Checkpoints and samples stay in AI-Toolkit's training folder; DataForge shows the samples and keeps its own job history.
- Open a folder with `.safetensors` files to inspect them in the gallery's [Models section](user-guide.md#model-files), or copy one into ComfyUI to [showcase it](comfyui.md#showcases).

## Troubleshooting

- **AI-Toolkit offline.** You can open **LoRA training** and prepare the run while AI-Toolkit is stopped. Start AI-Toolkit or check its URL under **Settings > Integrations**. The dialog checks again automatically and enables **Start training** when AI-Toolkit answers.
- **Name rejected.** Use a unique name of at most 80 characters, without `< > : " / \ | ? *`, and not `.` or `..`.
- **Template rejected.** Fix the reported YAML or structure error, or reset it in the template editor.
- **Stop cannot find the database.** Set `OSTRIS_TOOLKIT_ROOT` (see [Database location](#database-location)).
- **Dataset unreadable or samples missing.** Check that both services can reach the files. Check that the template enables sampling; queued runs have no samples yet.
