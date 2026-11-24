# Train LoRAs with AI-Toolkit

[Documentation](README.md)

**LoRA training** starts a run on the open dataset and shows its progress and samples in DataForge. [Ostris AI-Toolkit](https://github.com/ostris/ai-toolkit) does the training and owns the outputs; install and run it separately.

## Connect AI-Toolkit

Start AI-Toolkit, then open **Settings > Integrations**. Enter its origin in **AI-Toolkit URL**, use **Test connection**, and **Save**. The default is `http://127.0.0.1:8675`.

| Variable | Default | Effect |
| --- | --- | --- |
| `OSTRIS_BASE_URL` | `http://127.0.0.1:8675` | HTTP(S) origin; also in Settings |
| `OSTRIS_TOOLKIT_ROOT` | unset | AI-Toolkit's installation folder, where **Stop** looks for its database; environment-only |

Environment changes need a restart. A URL saved in Settings wins over `.env`; **Reset**, then **Save**, removes it.

**Shared paths.** DataForge sends AI-Toolkit a dataset path, not the media, so both must see the same files:

- AI-Toolkit must be able to read the dataset at the exact path DataForge supplies.
- DataForge needs filesystem access to AI-Toolkit's training folder to show samples, and to its database (`aitk_db.db`) to stop a running job.

A reachable API on another machine is not enough without those shared paths.

**Stop** looks for the database beside the training folder. If it is elsewhere, set AI-Toolkit's installation folder in `.env` and restart DataForge:

```dotenv
OSTRIS_TOOLKIT_ROOT=C:\AI-Toolkit
```

This only helps DataForge find that file; it does not start the service or change its address. Prefer an absolute path; a relative one resolves against the server's working directory, normally `backend/`.

## Start a run

1. Open the dataset. Training uses **the whole folder** and its `.txt` captions, regardless of selection or filters. AI-Toolkit reads its subfolders too, except those starting with a dot, so `staging/`, `clips/`, and `watermarked/` are trained on: empty or move them first.
2. Choose **LoRA training** and a template that matches your media:

   | Model | Media | Template |
   | --- | --- | --- |
   | **Krea 2 Raw** | Images | [`krea2_raw.yml`](../ostris_templates/krea2_raw.yml) |
   | **Krea 2 Turbo** | Images | [`krea2_turbo.yml`](../ostris_templates/krea2_turbo.yml) |
   | **MOSS-Image SFT** | Images | [`moss_image_sft.yml`](../ostris_templates/moss_image_sft.yml) |
   | **Qwen Image 2.1** | Images | [`qwen_image_2.yml`](../ostris_templates/qwen_image_2.yml) |
   | **Qwen Image 2.1 Turbo** | Images | [`qwen_image_2_turbo.yml`](../ostris_templates/qwen_image_2_turbo.yml) |
   | **MiniMax H3** | Videos | [`h3_fl2va.yml`](../ostris_templates/h3_fl2va.yml) |
   | **MiniMax H3 Ref2VA** | Videos | [`h3_ref2va.yml`](../ostris_templates/h3_ref2va.yml) |

3. Enter a unique LoRA name and an optional trigger word. An empty trigger means no trigger.
4. Add at least one sample prompt. Training generates samples from these prompts at the template's sample intervals.
5. Optionally **Edit template**, then **Start training**. DataForge creates the job, queues it on the GPU AI-Toolkit reports, and starts that queue.

### Template settings

Templates set the architecture, resolution, steps, optimizer, learning rate, sampling, and, for video, frame counts. Review them for your data; models do not share the same settings.

- The H3 templates train on 39 frames and generate 56-frame samples; training and sample lengths are separate settings.
- The Qwen Image 2.1 Turbo template includes its training adapter and uses 8-step samples at guidance scale 1.
- Krea 2 Raw uses the base model without a training adapter.

AI-Toolkit must support the selected model and adapter.

**Editing a template** in the dialog affects that run only: each model keeps its edit while the dialog is open, and the files in `ostris_templates/` never change. DataForge checks that the YAML is valid and has a `config.process` list whose first entry contains dataset and sample sections. It fills in the name, training folder, the first dataset's path, the trigger word, and the sample prompts; every other value is yours.

AI-Toolkit reads the dataset itself and writes checkpoints and samples to its configured training folder.

## Monitor

The jobs drawer shows AI-Toolkit runs with status, progress, time remaining, the latest samples, and a link to the dataset folder. Samples refresh every 10 seconds while it runs. **Stop** asks AI-Toolkit to save a checkpoint and stop, which can take a moment.

Checkpoints and samples stay in AI-Toolkit's training folder; DataForge shows the samples and keeps its own job history. Open a folder with `.safetensors` files to inspect them in the gallery's [Models section](user-guide.md#model-files), or copy one into ComfyUI to [showcase it](comfyui.md#showcases).

## Troubleshooting

**AI-Toolkit offline.** You can open **LoRA training** and prepare the run while AI-Toolkit is stopped. Start AI-Toolkit or check its URL under **Settings > Integrations**. The dialog checks again automatically and enables **Start training** when AI-Toolkit answers.

**Name rejected.** Use a unique name of at most 80 characters, without `< > : " / \ | ? *`, and not `.` or `..`.

**Template rejected.** Fix the reported YAML or structure error, or reset it in the template editor.

**Stop cannot find the database.** Set `OSTRIS_TOOLKIT_ROOT`.

**Dataset unreadable or samples missing.** Check that both services can reach the files. Check that the template enables sampling; queued runs have no samples yet.
