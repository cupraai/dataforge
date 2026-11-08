# User guide

[Documentation](README.md)

A dataset is a folder: `scene.jpg` is captioned by `scene.txt` beside it. DataForge reads and writes those files directly, and the gallery updates when files change outside the app. The gallery shows the open folder's media; subfolders appear as cards above it.

## Browse and organize

### Layout

| Area | What it holds |
| --- | --- |
| Folder sidebar | **Open video editor**, **Settings**, favorites, and recent folders. Hover a folder for its path and to favorite or remove it |
| Toolbar | Search, filters, sort, view, **Review**, **Tools**, and the CPU button for CPU, RAM, and GPU details |
| Subfolder cards | Above the media; hover for caption coverage and review counts |
| Inspector | The open file's caption and details, beside the gallery |

Collapse the sidebar for more space. Below 1600px wide it starts collapsed; below 1200px it opens over the gallery and closes with `Escape` or a click outside. Breadcrumbs navigate up, and you can copy the folder path or, on Windows, open it in File Explorer.

Press `Ctrl+P` for **Quick actions**: search jobs, commands, filters, and folders, then press `Enter`. Press `?` for the shortcut list.

### Find files

- **Search** (`Ctrl+F` or `/`) matches file names, folder names, captions, and [tags](#tags). Turn on regex for regular expressions; a pattern that takes more than a second is stopped and reported as **Pattern too slow**.
- **Filters** narrow by media type, caption state, issues, edits, duplicates, or ComfyUI results. Each active filter shows a removable chip; **Reset all filters** keeps the search text.
- **Ranges** in the filter menu narrow by megapixels, video duration, or caption length in characters. Each range charts the files the other filters keep: click a bar to pick it, click another to widen the span, or type **From** and **Below** values. A range includes its minimum but not its maximum, and leaves out files without that value, such as stills for duration. Clicking a bar in the statistics drawer sets the same range.
- **Sort** by name, date modified, caption length, megapixels, or duration. The sort is remembered.
- **View** as large cards, small cards, or a list (`Ctrl+1`, `Ctrl+2`, `Ctrl+3`). Each folder remembers its view.
- The **captioned** and **issue** counts in the toolbar filter to those files; click again to clear.

Cards mark missing, empty, and unreadable captions, and show badges for findings, ComfyUI candidates, and edits. Hovering a card shows its **card actions**: Open, Copy caption, and Delete by default. **Settings > Appearance > Gallery** adds others from the inspector, such as Edit, Move file, or Rename file, and controls what cards show.

The **statistics** drawer covers the whole folder, ignoring filters: caption coverage and lengths, frequent words and tags, issues, duplicates, formats, durations, megapixels, aspect ratios, and files whose size or length could not be read.

**Review** appears when there are findings. It opens caption issues, duplicate groups, or ComfyUI candidates for the same [scope as jobs](#scope), and names that scope at the top. A duplicate group always opens with all its members.

### Select, copy, move, rename, delete

- **Select** enters selection mode. `Ctrl+click` toggles a file, `Shift+click` selects a range, and `Ctrl+A` selects every file the search and filters show.
- The selection bar can invert or clear the selection, copy, move, or delete. Toolbar tools then run on the selection.
- A selected file hidden by a filter stays selected, but no action touches it until it is visible again.
- Copy and move preview conflicts and ask before overwriting. If an overwrite fails, DataForge tries to restore the previous destination file.
- **Rename** (a Tool) gives files sequential numbered names and has no undo. To rename one file, use the pencil in the inspector; the extension stays. Rename an empty folder from its empty view or Quick actions.
- Create subfolders, or drag media and `.txt` captions into the app to import them. An import takes only the files you drop.

Copy, move, rename, and delete take a file's [related files](#files-dataforge-creates) along: caption, findings, edit original, caption backup, and staged ComfyUI result. Folder instructions stay with the folder. On Windows, deleting uses the Recycle Bin; elsewhere it is permanent after confirmation. If a related file cannot be removed, the notice names it and offers **Retry**.

A file that another operation is changing, such as an edit render or a ComfyUI acceptance, is refused until that operation finishes. Bulk jobs report such files as busy and continue.

### Video playback

Videos start muted and loop. A video the browser cannot play, such as an MPEG-4 Part 2 `.mp4`, says so over the player. **Convert to H.264** re-encodes it in place like any edit: the original is kept, and **Revert original** restores it. Editing and frame capture wait until the video plays.

## Captions

Click a file to edit its caption in the inspector. Its header shows the file's position with previous and next buttons, and the arrow keys page through files while the gallery has focus. **Expand media view** opens a larger view with the same draft; the choice is remembered. Narrow windows use an overlay. Resize the inspector by dragging its left edge, or with the arrow keys on the focused separator.

The media view and issue resolver show the modified date, dimensions, megapixels, aspect ratio, and any embedded ComfyUI workflow.

**Review pass keys.** Outside the caption text, `U` / `Shift+U` jumps to the next / previous uncaptioned file, `I` / `Shift+I` to the next / previous file with an issue, `M` moves the file to another folder, and `X` selects or deselects it. In the caption, `Ctrl+Enter` saves and moves to the next file, and `Ctrl+Shift+Enter` to the next uncaptioned one.

**Autosave.** Captions save as you type, with surrounding whitespace trimmed. Changing files, closing, and navigating wait for the save.

| Situation | What you can do |
| --- | --- |
| The save failed | Retry, discard the draft and continue, or keep editing |
| The caption changed on disk since you opened it (**Changed elsewhere**) | **Reload** the file's text, or **Overwrite** it with yours |
| The caption could not be opened, for example while another program has it locked | The editor stays read-only; **Retry** once it is free |
| The caption is not UTF-8 text | The editor stays read-only; **Replace caption** writes new text over it |
| You want the text you opened with | **Revert** |
| The folder has a [backup](#caption-backups) of this caption | **Compare backup** shows struck-through words that would go and highlighted words that would return; **Use backup** loads it. `Escape` returns to editing |

**Completion.** Type two characters or press `Ctrl+Space` for word completions from the folder's captions. The token count marked `~` is an estimate from text length, not a model tokenizer.

### Folder instructions

Choose **Create instructions** or **Edit instructions** in the folder sidebar. The dialog has two tabs:

| Tab | File | Used by |
| --- | --- | --- |
| **System prompt** | `.sysprompt` | Auto-caption, which needs one in this folder or a parent. It sets voice, required details, or format |
| **Caption rules** | `.captionrules` | **Lint captions**. **Use template** gives a starting point; see [Caption rules](#caption-rules) |

A system prompt is Markdown that must start with a `#` heading, such as `# Caption instructions`. Deeper headings such as `## Details` may follow. A prompt without an opening `#` heading is marked invalid, and Auto-caption cannot use it until it is fixed.

**Inheritance.** Each file also applies to subfolders that have none of their own. The nearest file wins whole; the two files are never merged, and each inherits on its own. An empty file made outside the app still blocks inheritance, and invalid inherited rules are reported, not skipped.

The dialog shows the current folder, where the active file comes from, and whether it is local, inherited, or missing; empty, invalid, and unreadable files are flagged separately. The gallery's instruction markers and the job dialogs show the same information.

| To... | Do this |
| --- | --- |
| Change inherited instructions for this folder only | **Customize for this folder** copies them into a local draft (not saved yet). Inherited content is otherwise read-only |
| Start from scratch | Missing instructions offer **Create instructions**, an example, and, for caption rules, a template |
| Save | **Save** writes the changed tabs to the current folder. Tabs do not autosave, and closing with unsaved changes asks first |
| Discard edits | **Reset** discards the open tab's changes and keeps the local file |
| Go back to the parent's instructions | **Use inherited instructions** previews them and removes the local file when you save. Saving a tab empty does the same |
| Fix an unreadable file | **Retry**; to replace its contents, choose **Replace unreadable file** first |

### Caption issues

1. Run **Verify captions** for a model check against the media, or **Lint captions** for a local rule check.
2. Open **Review > Caption issues** to step through findings.
3. Correct the caption, mark it resolved (`Ctrl+Enter`), and continue with the arrow keys.

Both checks write `.issue.json` findings and leave captions unchanged. Model and rule findings are kept apart, and rerunning one check replaces only its own. Findings stay when a caption is edited outside the resolver; the resolver notes that the caption changed since the check, and rerunning the check brings them up to date. Still images can be zoomed and, on Windows, opened in the system viewer. **Delete all .issue.json files** in Quick actions clears findings.

### Caption rules

Linting needs no model. Edit the rules in [folder instructions](#folder-instructions), run **Lint captions**, then filter by **With issues** or open the resolver. [`sample_media/`](../sample_media/) has an example.

```yaml
trigger: sample_style
words:
  min: 8
  max: 120
repeated_phrases: 4
flag:
  - match: [float*, hover*, suspended]
    note: check the subject is really off the ground
  - match: in the background
```

Every setting is optional, but at least one rule must be active. Unknown keys are rejected, including inside `words` and `flag` entries.

| Setting | Value | Flags a caption that... |
| --- | --- | --- |
| `trigger` | Text | Does not start with this term, case-sensitive, at a word boundary |
| `words.min` / `words.max` | Integers ≥ 1, min ≤ max; set at least one | Has fewer or more whitespace-separated words (limits inclusive) |
| `repeated_phrases` | Integer ≥ 2 | Repeats a phrase of at least this many words, ignoring case and punctuation |
| `flag[].match` | A term or a list of terms | Contains any term as a whole word or phrase, ignoring case |
| `flag[].note` | Text, optional | (Shown with that rule's finding) |

- Terms are literal text, not regular expressions. A trailing `*` matches word endings: `float*` catches `floating`. A term needs text besides the `*`.
- Phrases match across line breaks. Repeats are counted without overlap, and contractions count as words.
- Missing caption files are skipped; an empty caption is checked.
- Each file keeps at most five rule findings; the fifth summarizes any further hits.

### Duplicates

**Find duplicates** groups visually similar files by perceptual hash, a compact fingerprint of appearance, with exact, near, or loose matching. The resolver suggests a keeper, usually the largest file. Keep one and delete the rest, or dismiss the group to keep all. **Delete all .duplicate.json files** clears findings without deleting media.

### Caption backups

**Undo a job.** **Set captions**, **Edit captions**, and **Find & replace** can be undone once with **Undo** on the finished job's notification. Undo restores the exact previous captions and leaves alone any caption edited since the job. A caption that could not be restored, for example because another program held it, keeps its undo, so **Retry** can try again. Undo lasts until the job is deleted from the history.

Undo covers one job's writes. To get back to a state from before several jobs or hand edits, back up before a bulk rewrite:

- **Backup captions** copies `.txt` files into `.backup/`, overwriting older copies.
- **Edit captions** and **Find & replace** start with **Back up captions first** on, so the backup holds each caption from just before the latest edit.
- **Restore captions** reviews every caption that differs from its backup, with thumbnails and word-by-word changes, inline or side by side. Filter by changed, new, or unreadable, or by name or text; the restore still covers everything under **All**. It skips files whose media is gone and keeps the backups.

Neither backup nor restore changes issue findings.

## Tags

Turn on **Tag favorite folders** under **Settings > Tagging**, and DataForge tags the images, GIFs, and videos in your **favorite folders** in the background, so you can search for what files show. Subfolders are tagged only if they are favorites too. Audio is skipped, and a changed file is tagged again. Tagging is off by default; while it is off, tags are hidden from cards, the viewer, search, and statistics, and kept for when you turn it back on.

- **Search** matches tags like caption text. **Large cards** show the strongest tags; turn that off in **Settings > Appearance > Gallery**.
- **While tagging**, the folder's sidebar favorite pulses green and its header shows a slow green sweep.
- **Settings > Tagging** shows the status and the waiting files. **Minimum confidence** hides weaker tags immediately, without re-tagging. **Re-tag everything** sends every tagged file back to the model; its old tags stay until new ones replace them.

**Your own terms.** Tags come from [YOLO-World](https://docs.ultralytics.com/models/yolo-world/), which looks for about 300 built-in everyday objects, people, and scenery. Add your own under **Settings > Tagging > Vocabulary**, one per line (`#` starts a comment); they are saved to `backend/data/tag_vocabulary.txt`, which you can also edit directly. The file is not checked into Git and is picked up without a restart. New terms apply to files tagged from then on; use **Re-tag everything** to apply them to files that already have tags. Short, visible things such as `red dress` work best. The detector finds objects, not moods or styles, and near-synonyms like `woman` and `female` split one object's score.

**Install.** Setup installs tagging, a few GB the first time; skip it with `setup.bat -SkipTagging` or `./setup.sh --skip-tagging`. It picks the PyTorch build for your GPU (CUDA, ROCm on Linux, or CPU) and downloads the model into `backend/data/models/`: `yolov8x-worldv2` on NVIDIA GPUs, otherwise the faster, less precise `yolov8s-worldv2`. If that fails, setup still finishes and **Settings > Tagging** says what is missing; run setup again to retry. To install by hand, follow the header of `backend/requirements-tagging.txt`.

## Edit media

Open a file's editor, make changes, then **Apply**. The first edit keeps the original beside the file as `<name>.bak`, with the edit settings in `<name>.edit.json`. Every later edit renders from that original again. **Revert original** restores it and removes both files.

If the file is replaced outside DataForge, the next edit or revert treats the replacement as the new original and discards the old original and settings (to the Recycle Bin on Windows).

| Media | Formats | Tools |
| --- | --- | --- |
| Images | JPG/JPEG, PNG, WebP, BMP | Crop to a ratio or freely, rotate by quarter turns, mirror, resize by scale or exact size, Adjust, masks, [generative fill](#generative-fill) |
| Videos | MP4, MOV, M4V the browser can play | Trim, crop, resize, speed, volume, mute, Adjust, masks. Rendering shows progress and can be cancelled |
| Audio | WAV, MP3, FLAC | Trim, fades, volume, speed, pitch, EQ, noise reduction; see [Edit audio](#edit-audio) |

- **Masks** blur, pixelate, or black out regions.
- **Save frame as JPG** writes a video or GIF frame beside the source, named with its timestamp or frame number.
- **GIF to MP4** converts at 24 fps and asks before overwriting an MP4 of the same name.
- While you resize a crop, the preview shows its pixel size; a free crop also shows its ratio.
- Hints float over the picture to say what to do next, and fade out while the pointer is over them.

### Adjust in the editor

Adjust has Exposure, Brilliance, Highlights, Shadows, Contrast, Brightness, Black Point, White Point, Saturation, Vibrance, Warmth, Tint, Hue, Definition, and Noise Reduction. Choose a tool, then drag or click its slider, or use the arrow keys (`Shift` for larger steps). Double-click a slider to return it to its marked resting value. Scroll the tool row with the mouse wheel when it does not fit.

The **Auto** wand analyzes the original inside the crop, ignoring masks; for videos, it samples the trimmed range. It corrects exposure, contrast, color intensity, and color casts toward a natural look. Its slider sets the amount; click the wand again to turn it off.

Hold the compare button to see the original. Click the preview to inspect it at output resolution when that is larger than the display, then move the pointer to pan. Live preview needs WebGL 2; saving works without it.

### Generative fill

**Fill** removes or replaces part of an image with Qwen-Image 2.1 running in your own ComfyUI. It needs the models described in [Generative fill setup](comfyui.md#generative-fill); the tool says what is missing. Its hint shows what to do next, progress with the elapsed time, and why **Generate** is off.

1. **Paint** over what to change. Cover the whole object, including its edge and shadow.
   - **Erase** removes paint, the slider sets the brush size, and the buttons beside it undo the last stroke or clear the selection.
   - Keys: `B` brush, `E` eraser, `[` / `]` smaller / bigger brush, `Ctrl+Z` undo a stroke.
   - The mouse wheel zooms around the pointer, middle-button drag pans, and `Alt` + wheel sizes the brush. **Fit** in the corner shows the whole picture again.
2. **Instruction:** leave it blank to remove what you painted and continue the background, or describe what should appear, such as "a wooden bench".
3. Choose **Fast** (Turbo LoRA, 8 steps) or **Quality** (base model), then **Generate**, or press `Enter` in the instruction. The painted area pulses while it is generated; **Cancel** stops only this generation in ComfyUI.
4. **Compare and decide.** Hold the mouse button on the picture, or toggle **Before**, to see it before the fill. Then **Keep fill** or **Discard**. You can also reword the instruction and **Regenerate**, which tries a new seed; the previous result stays until the new one arrives.

A kept fill joins the edit like any other change: crop, masks, turns, size, and Adjust all work on the filled picture, and **Apply** writes it without generating again.

- **Fills stack**, each generated on top of the ones before it. **Undo last fill** removes the newest; an earlier fill cannot be removed without the ones built on it.
- **Reset** returns to the saved edit, and **Revert original** removes every fill with the rest of the edit.

**What changes.** Fills are always made from the original, before any other edit, and only the painted area and a feathered border change. The model sees a crop around the selection scaled to about one megapixel, so a fill on a very large image has less detail than the image itself. A transparent image keeps any transparency the model generates in the filled area; an opaque one stays opaque.

**Queue and unsaved results.** Generations run one at a time on ComfyUI, after any queued **Process with ComfyUI** file. A result you have not kept is unsaved work: leaving the file asks first. Restarting DataForge interrupts a generation in progress, and unkept results are deleted after a day.

### Edit audio

The audio editor plays the original while you work.

| Tool | What it does |
| --- | --- |
| **Trim** | Drag the waveform handles or set them at the playhead; length presets keep that many seconds |
| **Fades** | Fade in and out over the chosen seconds. **Equal power** sounds even; **Linear** dips in the middle |
| **Volume** | Gain from 25% to 200%. **Limit peaks** holds peaks under -1 dB; **Normalize** brings the sound to -14 LUFS, then limits peaks. The preview plays a normalize at its measured gain but does not limit |
| **Speed** / **Pitch** | Speed changes the length and keeps the pitch; pitch moves up to 12 semitones either way and keeps the length |
| **EQ** | **Low cut** removes rumble, **High cut** hiss; **Bass**, **Mid**, and **Treble** move their range by up to 12 dB |
| **Clean** | Noise reduction learns the noise from the quietest half second and lowers it by up to 30 dB |

Noise reduction and pitch render on the server before you hear them (**Preparing preview...**), and the saved file uses that same render. A file keeps its format: a WAV its sample format, a FLAC its bit depth, and an MP3 its bitrate, tags, and cover. An MP3 is re-encoded once per edit, always from the original.

### Auto-adjust a batch

**Auto-adjust** applies the Auto wand to each eligible image and video and saves it. Crops, masks, trims, other edits, and manual Adjust values stay; an earlier Auto result is replaced, not stacked. Originals are kept, so you can tune or revert each file in its editor. Unchanged files are skipped, and cancelling keeps the finished files.

Two options start off every run:

- **Replace earlier adjustments** resets every Adjust tool before applying Auto, discarding manual values.
- **Reset all color adjustments to zero** clears manual and Auto color without applying Auto. Other edits stay.

## Video editor

Combine videos, stills, audio, and titles on a multi-track timeline and export an MP4; see the [Video editor guide](video-editor.md).

## Jobs

### Scope

A job runs on the first of these that applies:

1. The selected files that are visible.
2. The files the search and filters show, when either is active.
3. The whole folder.

The dialog shows the count and freezes the file list when it opens, previews included. An empty scope cannot start a job. **Quick LoRA training** is the exception: it always uses the whole folder, and its dialog says so.

### Running and history

Jobs run in the background, one per folder at a time. While one runs, **Cancel job** replaces Auto-caption and Tools, and the strip under the toolbar shows progress, the current file, and the time left. Cancelling keeps what was already written.

A clean finish leaves no strip. After a failure, cancellation, warnings, or failed files, the strip stays until dismissed:

- **Retry N failed** reruns the failures.
- **Run again** uses the current scope.
- **Job details** opens the Jobs drawer with warnings, logs, per-file results, training samples, and earlier runs.

Finished runs are kept for the [job history](configuration.md#server-storage-and-logging) period, 30 days by default.

### Job reference

| Job | Writes | Notes |
| --- | --- | --- |
| **Auto-caption** | `.txt` captions | Captions files that have none and expands short drafts, from the media and the [system prompt](#folder-instructions). Skips captions over the [draft threshold](configuration.md#vision-model-settings). The dialog counts what it will do first |
| **Verify captions** | `.issue.json` findings | A model checks each caption against its media; captions stay unchanged |
| **Lint captions** | `.issue.json` findings | Local [caption rules](#caption-rules); no model |
| **Edit captions** | `.txt` captions | A model rewrites captions to your instruction; it sees the media only with **Send media**. Backs up first by default. **Dry run** previews it; see below |
| **Set captions** | `.txt` captions | One caption for every file; overwriting existing captions needs permission |
| **Find & replace** | `.txt` captions | Text or regex replace, or add a prefix or suffix. Regex `^` and `$` match at each line. Previews counts and examples first; backs up first by default |
| **Find duplicates** | `.duplicate.json` groups | Deletes media only when you confirm in the resolver |
| **Backup captions** / **Restore captions** | `.backup/` copies / `.txt` captions | See [Caption backups](#caption-backups) |
| **Rename** | New file names | Sequential, with related files; no undo |
| **Watermark** | Copies in `watermarked/` | Text, a PNG such as a logo, or both, each with its own size, opacity, and position. The PNG is kept for later runs. Overwrites earlier copies; captions are not copied. Can strip metadata from the copies |
| **Strip metadata** | Files in place | Removes EXIF, XMP, text and workflow metadata, video tags, and chapters. Keeps image color and density data and every video and audio stream; video is remuxed, not re-encoded. No undo |
| **Auto-adjust** | Files in place, originals kept | See [Auto-adjust a batch](#auto-adjust-a-batch) |
| **Process with ComfyUI** | Results in `staging/` | Accepting a result replaces the source with no backup; see [ComfyUI](comfyui.md#review-candidates) |
| **Quick LoRA training** | Nothing in the folder | Starts and monitors a run in [AI-Toolkit](ai-toolkit.md) |

Jobs that change captions run once per caption, so `scene.jpg` and `scene.png` sharing `scene.txt` are changed once, and the result names both.

**Try Edit captions first.** Enter an instruction and click **Dry run**. It rewrites up to three readable captions from the dialog's scope, in filename order, with the job's model settings, and highlights removed and added text. Nothing is written. Changing the instruction or model clears it. The full job generates fresh text, so its wording can differ. With **Send media** on, the model also sees each file's image or video keyframes, so an instruction such as "add clothing colours" can use what the picture shows.

## Settings

Open **Settings** from the folder sidebar or with `Ctrl+,`. It covers appearance, model connections and input budgets, tagging, integration URLs, cache limits, and history retention. **Save** applies field changes, and **Reset** then **Save** returns a field to its environment or default value. **Clear** actions apply immediately, even if you cancel. See [Configuration](configuration.md) for every section, models, variables, and troubleshooting.

## Supported formats

Every format below shows in the gallery and takes a `.txt` caption. AI caption jobs and ComfyUI accept images and videos; jobs skip audio, which you caption by hand. Whether a workflow or training model handles a file depends on that model, not on the gallery.

| Format | Gallery | Editor | Strip metadata | Watermark | ComfyUI workflow shown |
| --- | --- | --- | --- | --- | --- |
| JPG/JPEG, WebP | Image | Image | Yes | Yes | — |
| PNG | Image | Image | Yes | Yes | Yes |
| BMP | Image | Image | Nothing to strip | Yes | — |
| GIF | Animation, frame capture | Convert to MP4 first | — | Yes | — |
| MP4, MOV, M4V | Playback and frame capture if the browser has the codec | Video | Yes | Yes | Yes |
| AVI, MKV, WMV, FLV | Thumbnail only | — | — | — | — |
| WAV, MP3, FLAC | Waveform and playback | Audio | — | — | — |

Auto-adjust covers the image and video editor formats. Caption jobs use a GIF's first frame and sample frames across a video, including containers the browser cannot play. A watermarked GIF stays an animated GIF with its frame timing, loop count, and transparency.

### Model files

`.safetensors` model files, such as LoRAs from a training run, are listed in their own **Models** section above the media. It follows the toolbar's search (by name) and sort; filters apply to media only.

Each card says what the file is, read from its tensor names: checkpoint, diffusion model, LoRA (or LoKr, LoHa), ControlNet, embedding, text encoder, vision encoder, VAE, or upscaler. Cards take the colors and icons of the [workflow map](comfyui.md#inspect-embedded-workflows): purple for diffusion models and adapters, yellow for encoders, red for VAEs. A file whose layout is not recognized shows as **Weights**.

Opening a model shows what its header records, without loading the weights:

- its kind, architecture, adapter rank, LoKr factor, and alpha;
- training step and epoch, and trigger words;
- parameter count and precision, including ComfyUI quantizations such as FP8 scaled, INT8 ConvRot, and NVFP4;
- every metadata key.

Models take no caption and no job. They can be copied, moved, renamed, and deleted, but not dropped into a folder to import.

## Files DataForge creates

`<stem>` is the name without its extension (`scene`); `<name>` includes it (`scene.jpg`). Related files travel with their media but are not gallery items. Media in `watermarked/` and `staging/` can be browsed like any folder.

Files with the same stem, such as `scene.jpg` and `scene.png`, share one caption, but each keeps its own edit original and settings. Use different stems when files need different captions.

| File | Where | Made by | Removed when |
| --- | --- | --- | --- |
| `<stem>.txt` | Beside media | You or a caption job | You delete it or its media |
| `.sysprompt`, `.captionrules` | Dataset or a parent folder | Folder instructions | You save that tab empty |
| `<name>.issue.json` | Beside media | Verify or Lint captions | Findings are resolved or cleared |
| `<name>.duplicate.json` | Beside media | Find duplicates | The group is resolved, dismissed, or cleared |
| `<name>.bak`, `<name>.edit.json` | Beside media | The editor or Auto-adjust: original and edit settings | **Revert original**, or accepting a ComfyUI result |
| `<name>.fills` | Beside media | Applying an edit with [generative fills](#generative-fill): their pixels | **Revert original**, or accepting a ComfyUI result |
| `<stem>-edit.video-project.json` | Beside the first video | Video editor draft | **Delete project**; its media and exports stay |
| `<name>.video-project.json` | Beside an exported video | The edit that export came from | It moves, copies, and deletes with the video |
| `<stem>.txt` | `.backup/` | Caption backup | You delete it; restoring keeps it |
| Watermarked media | `watermarked/` | Watermark | You delete it |
| Result, `<result-name>.comfy.json` | `staging/` | Process with ComfyUI | It is accepted, rejected, or deleted |
| Database, thumbnails | `backend/data/` | The app: settings, jobs, notifications, tags | Pruned by [retention](configuration.md#server-storage-and-logging) |
| Unkept fill results | `backend/data/fill_results/` | Generative fill, until you keep or discard a result | Discard, or a day later |
| `watermark.png` | `backend/data/` | The PNG chosen in the Watermark dialog | Choosing another PNG replaces it |
| `tag_vocabulary.txt` | `backend/data/` | You, or **Settings > Tagging > Vocabulary**: extra tag terms | You delete it, or clear the list |
| Tagging model | `backend/data/models/` | The first tagging run; `DATAFORGE_MODELS_DIR` moves it | You delete it |

For example, `scene.jpg` can have `scene.txt`, `scene.jpg.issue.json`, `scene.jpg.duplicate.json`, `scene.jpg.bak`, `scene.jpg.edit.json`, and `scene.jpg.fills`.

The gallery hides `.backup/` and common repository, environment, system, and cache folders, such as `.git`, `node_modules`, `.venv`, `__pycache__`, `_latent_cache`, and `_t_e_cache`.

## Keyboard shortcuts

Press `?` outside a text field to see the shortcut list in the app. On macOS, use `⌘` for `Ctrl` and `⌥` for `Alt`; caption completion stays `Ctrl+Space`.

### Global and folders

| Shortcut | Action |
| --- | --- |
| `Ctrl+P` | Open or close **Quick actions**; then `↑` `↓` `Home` `End` choose and `Enter` runs |
| `Ctrl+F` or `/` | Focus search |
| `Ctrl+,` | Open Settings |
| `?` | Show keyboard shortcuts |
| `Alt+↑` | Go to the parent folder |
| `Alt+Home` | Go to the home folder |
| `Alt+N` | Create a folder |
| `Enter` / `Escape` | Confirm / close a dialog or viewer |

### Gallery and selection

| Shortcut | Action |
| --- | --- |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Show large cards / small cards / a list |
| `Ctrl+click` | Toggle a file and enter selection mode |
| `Shift+click` | Select the range from the anchor to the clicked file |
| `Ctrl+A` | Select every file shown |
| `Delete` or `Backspace` | Delete the selected files, after confirmation |
| `Escape` | Clear the selection; press again to leave selection mode |

### Inspector and review

| Shortcut | Action |
| --- | --- |
| `←` / `→`, `Home` / `End` | Previous / next, first / last file |
| `U` / `Shift+U` | Inspector: next / previous uncaptioned file |
| `I` / `Shift+I` | Inspector: next / previous file with an issue |
| `M` | Inspector: move the file to another folder |
| `X` | Inspector: select or deselect the file |
| `Ctrl+Enter` | Inspector: save and go to the next file. Issue resolver: mark resolved. Candidate review: accept |
| `Ctrl+Shift+Enter` | Inspector: save and go to the next uncaptioned file |
| `Ctrl+Backspace` | Candidate review: reject |
| `Delete` or `Backspace` | Inspector: delete the file, after confirmation |

### Editors

| Shortcut | Action |
| --- | --- |
| `Ctrl+F` | Find in the focused text editor |
| `Ctrl+Space` | Show caption word completions; `Escape` closes them first |
| Arrow keys | Nudge a focused crop, mask, or trim handle, or Adjust slider; `Shift` for larger steps |
| `Delete` | Remove the focused mask |
| `B` / `E` | Fill: paint or erase the selection |
| `[` / `]` | Fill: smaller or bigger brush |
| `Ctrl+Z` | Fill: undo the last stroke |
| `Enter` | Fill: generate, from the instruction field |
| Wheel / middle-drag | Fill: zoom around the pointer / pan; `Alt` + wheel sizes the brush |
| Hold the picture | Fill: show a result's picture before it |
| `Home` / `End` | Move a video trim handle to the start / end |

A video trim handle moves one frame per arrow press, or one second with `Shift`. For the video editor, see its [shortcuts](video-editor.md#keyboard-shortcuts).

### Focus

Shortcuts depend on focus. Text fields keep their own keys, and plain-key shortcuts are ignored while typing. Focused video controls use the arrow keys to seek. `Enter` does not confirm from a multi-line field, and busy dialogs block actions that would interrupt them. `Escape` closes a menu or overlay before the dialog around it.
