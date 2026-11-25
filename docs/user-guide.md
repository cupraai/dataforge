# User guide

[Documentation](README.md)

A dataset is a folder: `scene.jpg` is captioned by `scene.txt` beside it. DataForge reads and writes those files directly, and the gallery updates when files change outside the app. The gallery shows the open folder's media; subfolders appear as cards above it.

- [Browse and organize](#browse-and-organize)
  - [Layout](#layout) · [Find files](#find-files) · [Select, copy, move, rename, delete](#select-copy-move-rename-delete) · [Video playback](#video-playback)
- [Captions](#captions)
  - [Edit a caption](#edit-a-caption) · [Folder instructions](#folder-instructions) · [Caption issues](#caption-issues) · [Caption rules](#caption-rules) · [Duplicates](#duplicates) · [Caption backups](#caption-backups)
- [Tags](#tags)
  - [Your own terms](#your-own-terms) · [Install tagging](#install-tagging)
- [Edit media](#edit-media)
  - [Color](#color-in-the-editor) · [Effects](#effects-in-the-editor) · [Generative fill](#generative-fill) · [Edit audio](#edit-audio) · [Auto-adjust a batch](#auto-adjust-a-batch) · [Split videos into clips](#split-videos-into-clips) · [Trim videos to a length](#trim-videos-to-a-length)
- [Video editor](#video-editor)
- [Jobs](#jobs)
  - [Scope](#scope) · [Running and history](#running-and-history) · [Workflows](#workflows) · [Job reference](#job-reference)
- [Settings](#settings)
- [Supported formats](#supported-formats)
  - [Model files](#model-files)
- [Files DataForge creates](#files-dataforge-creates)
- [Keyboard shortcuts](#keyboard-shortcuts)

## Browse and organize

### Layout

| Area | What it holds |
| --- | --- |
| Folder sidebar | **Open video editor**, **Settings**, favorites, and recent folders |
| Toolbar | Search, filters, sort, view, **Review**, **Tools**, and the CPU button |
| Subfolder cards | The open folder's subfolders, above the media |
| Inspector | The open file's caption and details, beside the gallery |

- **Sidebar.** Hover a folder for its path and to favorite or remove it. Collapse the sidebar for more space. Below 1600px wide it starts collapsed; below 1200px it opens over the gallery and closes with `Escape` or a click outside.
- **CPU button.** Shows CPU, RAM, and GPU details.
- **Subfolder cards.** Hover for caption coverage and review counts.
- **Breadcrumbs** navigate up. You can also copy the folder path or, on Windows, open it in File Explorer.
- **Quick actions** (`Ctrl+P`) searches jobs, commands, filters, and folders; press `Enter` to run one. Press `?` for the [shortcut list](#keyboard-shortcuts).

### Find files

| Control | What it does |
| --- | --- |
| **Search** (`Ctrl+F` or `/`) | Matches file names, folder names, captions, and [tags](#tags) |
| **Filters** | Narrow by media type, caption state, issues, edits, duplicates, or ComfyUI results |
| **Ranges** (in the filter menu) | Narrow by megapixels, video duration, or caption length in characters |
| **Sort** | By name, date modified, caption length, megapixels, or duration |
| **View** | Large cards, small cards, or a list (`Ctrl+1`, `Ctrl+2`, `Ctrl+3`) |
| **Captioned** / **issue** counts | Filter the gallery to those files; click again to clear |

- **Regex search.** Turn on regex for regular expressions. A pattern that takes more than a second is stopped and reported as **Pattern too slow**.
- **Filter chips.** Each active filter shows a removable chip. **Reset all filters** keeps the search text.
- **Ranges.** Each range charts the files the other filters keep. Click a bar to pick it, click another to widen the span, or type **From** and **Below** values. A range includes its minimum but not its maximum, and leaves out files without that value, such as stills for duration. Clicking a bar in the statistics drawer sets the same range.
- **Remembered choices.** The sort is remembered, and each folder remembers its view.

**Cards** mark missing, empty, and unreadable captions, and show badges for findings, ComfyUI candidates, and edits. Hovering a card shows its **card actions**: Open, Copy caption, and Delete by default. **Settings > Appearance > Gallery** adds others from the inspector, such as Edit, Move file, or Rename file, and controls what cards show.

**Statistics.** The statistics drawer covers the whole folder, ignoring filters. It shows:

- caption coverage and lengths, issues, and duplicates;
- formats, durations, megapixels, and aspect ratios;
- files whose size or length could not be read;
- word and tag clouds of up to 32 terms each. Hover over a bubble for its count, or select it to search the gallery.

**Review** appears when there are findings. It opens caption issues, duplicate groups, or ComfyUI candidates for the same [scope as jobs](#scope); the bottom of the menu names that scope, as in **Tools** and **Workflows**. A duplicate group always opens with all its members.

### Select, copy, move, rename, delete

- **Select** enters selection mode. `Ctrl+click` toggles a file, `Shift+click` selects a range, and `Ctrl+A` selects every file the search and filters show.
- The **selection bar** can invert or clear the selection, copy, move, or delete. Toolbar tools then run on the selection.
- A selected file hidden by a filter stays selected, but no action touches it until it is visible again.
- **Copy and move** preview conflicts and ask before overwriting. If an overwrite fails, DataForge tries to restore the previous destination file.
- **Rename** (a Tool) gives files sequential numbered names and has no undo. To rename one file, use the pencil in the inspector; the extension stays. Rename an empty folder from its empty view or Quick actions.
- **Create subfolders**, or drag media and `.txt` captions into the app to import them. An import takes only the files you drop.

**Related files move too.** Copy, move, rename, and delete take a file's [related files](#files-dataforge-creates) along: caption, findings, edit original, caption backup, and staged ComfyUI result. Folder instructions stay with the folder.

**Deleting.** On Windows, deleting uses the Recycle Bin; elsewhere it is permanent after confirmation. If a related file cannot be removed, the notice names it and offers **Retry**.

**Busy files.** A file that another operation is changing, such as an edit render or a ComfyUI acceptance, is refused until that operation finishes. Bulk jobs report such files as busy and continue.

### Video playback

Videos start muted and loop. A video the browser cannot play, such as an MPEG-4 Part 2 `.mp4`, says so over the player. **Convert to H.264** re-encodes it in place like any edit: the original is kept, and **Revert original** restores it. Editing and frame capture wait until the video plays.

## Captions

### Edit a caption

Click a file to edit its caption in the inspector.

- **Paging.** The inspector header shows the file's position with previous and next buttons. The arrow keys page through files while the gallery has focus.
- **Expand media view** opens a larger view with the same draft; the choice is remembered. Narrow windows use an overlay.
- **Resize** the inspector by dragging its left edge, or with the arrow keys on the focused separator.
- **File details.** The media view and issue resolver show the modified date, dimensions, megapixels, aspect ratio, and any embedded ComfyUI workflow.

**Review pass keys.** The first four keys work outside the caption text; the last two work in the caption.

| Key | Action |
| --- | --- |
| `U` / `Shift+U` | Next / previous uncaptioned file |
| `I` / `Shift+I` | Next / previous file with an issue |
| `M` | Move the file to another folder |
| `X` | Select or deselect the file |
| `Ctrl+Enter` | Save and go to the next file |
| `Ctrl+Shift+Enter` | Save and go to the next uncaptioned file |

**Autosave.** Captions save as you type, with surrounding whitespace trimmed. Changing files, closing, and navigating wait for the save.

| Situation | What you can do |
| --- | --- |
| The save failed | Retry, discard the draft and continue, or keep editing |
| The caption changed on disk since you opened it (**Changed elsewhere**) | **Reload** the file's text, or **Overwrite** it with yours |
| The caption could not be opened, for example while another program has it locked | The editor stays read-only; **Retry** once it is free |
| The caption is not UTF-8 text | The editor stays read-only; **Replace caption** writes new text over it |
| You want the text you opened with | **Revert** |
| The folder has a [backup](#caption-backups) of this caption | **Compare** or **Restore** it |

**Compare** shows struck-through words that would go and highlighted words that would return; **Restore** loads the backup. `Escape` returns to editing.

**Completion.** Type two characters or press `Ctrl+Space` for word completions from the folder's captions. The token count marked `~` is an estimate from text length, not a model tokenizer.

### Folder instructions

Choose **Create instructions** or **Edit instructions** in the folder sidebar. The dialog has two tabs:

| Tab | File | Used by | Holds |
| --- | --- | --- | --- |
| **System prompt** | `.sysprompt` | **Auto-caption** | Instructions for the model: voice, required details, or format |
| **Caption rules** | `.captionrules` | **Lint captions** | [Caption rules](#caption-rules) |

- **Auto-caption needs a system prompt** in this folder or a parent.
- **A system prompt is Markdown** that must start with a `#` heading, such as `# Caption instructions`. Deeper headings such as `## Details` may follow. A prompt without an opening `#` heading is marked invalid, and Auto-caption cannot use it until it is fixed.
- **Use template** on the Caption rules tab gives a starting point.

**Inheritance.** Each file also applies to subfolders that have none of their own.

- The nearest file wins whole. The two files are never merged, and each inherits on its own.
- An empty file made outside the app still blocks inheritance.
- Invalid inherited rules are reported, not skipped.

**Status.** The dialog shows the current folder, where the active file comes from, and whether it is local, inherited, or missing; empty, invalid, and unreadable files are flagged separately. The gallery's instruction markers and the job dialogs show the same information.

| To... | Do this |
| --- | --- |
| Change inherited instructions for this folder only | **Customize for this folder** copies them into a local draft, not saved yet |
| Start from scratch | Missing instructions offer **Create instructions**, an example, and, for caption rules, a template |
| Save | **Save** writes the changed tabs to the current folder |
| Discard edits | **Reset** discards the open tab's changes and keeps the local file |
| Go back to the parent's instructions | **Use inherited instructions** previews them and removes the local file when you save |
| Fix an unreadable file | **Retry**; to replace its contents, choose **Replace unreadable file** first |

Inherited content is read-only until you customize it. Tabs do not autosave, and closing with unsaved changes asks first. Saving a tab empty also removes the local file, so the parent's instructions apply again.

### Caption issues

1. Run **Verify captions** for a model check against the media, or **Lint captions** for a local rule check.
2. Open **Review > Caption issues** to step through findings.
3. Correct the caption, mark it resolved (`Ctrl+Enter`), and continue with the arrow keys.

- Both checks write `.issue.json` findings and leave captions unchanged.
- Model and rule findings are kept apart, and rerunning one check replaces only its own.
- Findings stay when a caption is edited outside the resolver. The resolver notes that the caption changed since the check, and rerunning the check brings them up to date.
- Still images can be zoomed and, on Windows, opened in the system viewer.
- **Delete all .issue.json files** in Quick actions clears findings.

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

| Setting | Value | Effect |
| --- | --- | --- |
| `trigger` | Text | Flags captions that do not start with this term |
| `words.min` / `words.max` | Integers ≥ 1 | Flags captions with fewer or more whitespace-separated words |
| `repeated_phrases` | Integer ≥ 2 | Flags captions that repeat a phrase of at least this many words |
| `flag[].match` | A term or a list of terms | Flags captions that contain any term as a whole word or phrase |
| `flag[].note` | Text, optional | Shown with that rule's findings |

- **Trigger** matching is case-sensitive, at a word boundary.
- **Word limits** are inclusive. Set at least one of `min` and `max`; `min` must not exceed `max`.
- **Repeated phrases** and **flag** terms ignore case; repeated phrases also ignore punctuation.
- **Terms** are literal text, not regular expressions. A trailing `*` matches word endings: `float*` catches `floating`. A term needs text besides the `*`.
- **Phrases** match across line breaks. Repeats are counted without overlap, and contractions count as words.
- **Missing caption files** are skipped; an empty caption is checked.
- **Each file** keeps at most five rule findings; the fifth summarizes any further hits.

### Duplicates

**Find duplicates** groups visually similar files by perceptual hash, a compact fingerprint of appearance, with exact, near, or loose matching.

- The resolver suggests a keeper, usually the largest file.
- Keep one and delete the rest, or dismiss the group to keep all.
- **Delete all .duplicate.json files** clears findings without deleting media.

### Caption backups

**Undo a job.** **Set captions**, **Edit captions**, and **Find & replace** can be undone once with **Undo** on the finished job's notification.

- Undo restores the exact previous captions and leaves alone any caption edited since the job.
- A caption that could not be restored, for example because another program held it, keeps its undo, so **Retry** can try again.
- Undo lasts until the job is deleted from the history.

**Back up before a bulk rewrite.** Undo covers one job's writes. To get back to a state from before several jobs or hand edits, use a backup:

- **Backup captions** copies `.txt` files into `.backup/`, overwriting older copies.
- **Edit captions** and **Find & replace** start with **Back up captions first** on, so the backup holds each caption from just before the latest edit.
- **Restore captions** reviews every caption that differs from its backup, with thumbnails and word-by-word changes, inline or side by side. Filter by changed, new, or unreadable, or by name or text; the restore still covers everything under **All**. It skips files whose media is gone and keeps the backups.

Neither backup nor restore changes issue findings.

## Tags

DataForge can tag the images, GIFs, and videos in your **favorite folders** in the background, so you can search for what files show. Tagging is off by default.

| Setting in **Settings > Tagging** | Effect |
| --- | --- |
| **Tag favorite folders** | Turns background tagging on |
| Status | Shows the tagging status and the files still waiting |
| **Minimum confidence** | Hides weaker tags immediately, without re-tagging |
| **Re-tag everything** | Sends every tagged file back to the model |
| **Vocabulary** | Your own terms; see [Your own terms](#your-own-terms) |

- **What gets tagged.** Subfolders are tagged only if they are favorites too. Audio is skipped, and a changed file is tagged again.
- **While tagging is off**, tags are hidden from cards, the viewer, search, and statistics, and kept for when you turn it back on.
- **Re-tag everything** keeps a file's old tags until new ones replace them.
- **Search** matches tags like caption text.
- **Large cards** show the strongest tags; turn that off in **Settings > Appearance > Gallery**.
- **While tagging**, the folder's sidebar favorite pulses green and its header shows a slow green sweep.

### Your own terms

Tags come from [YOLO-World](https://docs.ultralytics.com/models/yolo-world/), which looks for about 300 built-in everyday objects, people, and scenery. Add your own under **Settings > Tagging > Vocabulary**, one per line (`#` starts a comment).

- They are saved to `backend/data/tag_vocabulary.txt`, which you can also edit directly. The file is not checked into Git and is picked up without a restart.
- New terms apply to files tagged from then on; use **Re-tag everything** to apply them to files that already have tags.
- Short, visible things such as `red dress` work best. The detector finds objects, not moods or styles, and near-synonyms like `woman` and `female` split one object's score.

### Install tagging

Setup installs tagging, a few GB the first time; skip it with `setup.bat -SkipTagging` or `./setup.sh --skip-tagging`.

- Setup picks the PyTorch build for your GPU: CUDA, ROCm on Linux, or CPU.
- It downloads the model into `backend/data/models/`: `yolov8x-worldv2` on NVIDIA GPUs, otherwise the faster, less precise `yolov8s-worldv2`.
- If that fails, setup still finishes and **Settings > Tagging** says what is missing; run setup again to retry.
- To install by hand, follow the header of `backend/requirements-tagging.txt`.

## Edit media

Open a file's editor, make changes, then **Apply**.

- **The original is kept.** The first edit keeps the original beside the file as `<name>.bak`, with the edit settings in `<name>.edit.json`.
- **Every later edit** renders from that original again.
- **Revert original** restores it and removes both files.
- **Replaced outside DataForge?** The next edit or revert treats the replacement as the new original and discards the old original and settings (to the Recycle Bin on Windows).

| Media | Formats | Tools |
| --- | --- | --- |
| Images | JPG/JPEG, PNG, WebP, BMP | Crop to a ratio or freely, rotate by quarter turns, mirror, resize by scale or exact size, Color, Effects, masks, [generative fill](#generative-fill) |
| Videos | MP4, MOV, M4V the browser can play | Trim, crop, resize, speed, frame rate, volume, mute, Color, Effects, masks |
| Audio | WAV, MP3, FLAC, AAC, M4A, OGG, Opus | Trim, fades, volume, speed, pitch, EQ, noise reduction; see [Edit audio](#edit-audio) |

- **Video rendering** shows progress and can be cancelled.
- **Masks** blur, pixelate, or black out regions.
- **Save frame as JPG** writes a video or GIF frame beside the source, named with its timestamp or frame number.
- **GIF to MP4** converts at 24 fps and asks before overwriting an MP4 of the same name.
- **Crop size.** While you resize a crop, the preview shows its pixel size; a free crop also shows its ratio.
- **Hints** float over the picture to say what to do next, and fade out while the pointer is over them.

### Color in the editor

Color has Exposure, Brilliance, Highlights, Shadows, Contrast, Brightness, Black Point, White Point, Saturation, Vibrance, Warmth, Tint, Hue, Definition, and Noise Reduction.

- **Adjust.** Choose a tool, then drag or click its slider, or use the arrow keys (`Shift` for larger steps).
- **Reset a slider.** Double-click it to return it to its marked resting value.
- **Tool row.** Scroll it with the mouse wheel when it does not fit.
- **Auto** (the wand) analyzes the original inside the crop, ignoring masks; for videos, it samples the trimmed range. It corrects exposure, contrast, color intensity, and color casts toward a natural look. Its slider sets the amount; click the wand again to turn it off.
- **Compare.** Hold the compare button to see the original.
- **Inspect at full size.** Click the preview to inspect it at output resolution when that is larger than the display, then move the pointer to pan.

Live preview needs WebGL 2; saving works without it.

### Effects in the editor

Open **Effects** next to **Color** to choose a look. For cooler colors, try:

| Look | Character |
| --- | --- |
| **Arctic** | Crisp whites |
| **Glacier** | Teal shadows |
| **Blue Hour** | Deeper blues |
| **Moonlight** | Softer violet tones |

Drag **Strength** to blend the look with your adjustments. Choose **None** to remove the look, or **Apply** to save it.

### Generative fill

**Fill** removes or replaces part of an image with Qwen-Image 2.1 running in your own ComfyUI. It needs the models described in [Generative fill setup](comfyui.md#generative-fill); the tool says what is missing. Its hint shows what to do next, progress with the elapsed time, and why **Generate** is off.

1. **Paint** over what to change. Cover the whole object, including its edge and shadow.
   - **Erase** removes paint, the slider sets the brush size, and the buttons beside it undo the last stroke or clear the selection.
   - Keys: `B` brush, `E` eraser, `[` / `]` smaller / bigger brush, `Ctrl+Z` undo a stroke.
   - The mouse wheel zooms around the pointer, middle-button drag pans, and `Alt` + wheel sizes the brush. **Fit** in the corner shows the whole picture again.
2. **Instruction:** leave it blank to remove what you painted and continue the background, or describe what should appear, such as "a wooden bench".
3. **Generate.** Choose **Fast** (Turbo LoRA, 8 steps) or **Quality** (base model), then **Generate**, or press `Enter` in the instruction. The painted area pulses while it is generated; **Cancel** stops only this generation in ComfyUI.
4. **Compare and decide.** Hold the mouse button on the picture, or toggle **Before**, to see it before the fill. Then **Keep fill** or **Discard**. You can also reword the instruction and **Regenerate**, which tries a new seed; the previous result stays until the new one arrives.

**Kept fills.** A kept fill joins the edit like any other change: crop, masks, turns, size, and Color all work on the filled picture, and **Apply** writes it without generating again.

- **Fills stack**, each generated on top of the ones before it. **Undo last fill** removes the newest; an earlier fill cannot be removed without the ones built on it.
- **Reset** returns to the saved edit, and **Revert original** removes every fill with the rest of the edit.

**What changes.**

- Fills are always made from the original, before any other edit, and only the painted area and a feathered border change.
- The model sees a crop around the selection scaled to about one megapixel, so a fill on a very large image has less detail than the image itself.
- A transparent image keeps any transparency the model generates in the filled area; an opaque one stays opaque.

**Queue and unsaved results.**

- Generations run one at a time on ComfyUI, after any queued **Run ComfyUI workflow** file.
- A result you have not kept is unsaved work: leaving the file asks first.
- Restarting DataForge interrupts a generation in progress, and unkept results are deleted after a day.

### Edit audio

The audio editor plays the original while you work.

| Tool | What it does |
| --- | --- |
| **Trim** | Drag the waveform handles or set them at the playhead; length presets keep that many seconds |
| **Fades** | Fade in and out over the chosen seconds. **Equal power** sounds even; **Linear** dips in the middle |
| **Volume** | Gain from 25% to 200%. **Limit peaks** holds peaks under -1 dB; **Normalize** brings the sound to -14 LUFS, then limits peaks |
| **Speed** | Changes the length and keeps the pitch |
| **Pitch** | Moves up to 12 semitones either way and keeps the length |
| **EQ** | **Low cut** removes rumble, **High cut** hiss; **Bass**, **Mid**, and **Treble** move their range by up to 12 dB |
| **Clean** | Noise reduction learns the noise from the quietest half second and lowers it by up to 30 dB |

- **Normalize preview.** The preview plays a normalize at its measured gain but does not limit.
- **Server-rendered preview.** Noise reduction and pitch render on the server before you hear them (**Preparing preview...**), and the saved file uses that same render.
- **Re-encoding.** A lossy file is re-encoded once per edit, always from the original.

A file keeps its format:

| Format | Keeps |
| --- | --- |
| WAV | Sample format |
| FLAC | Bit depth |
| MP3, M4A | Bitrate, tags, and cover |
| AAC, OGG, Opus | Codec, bitrate, and tags |

An OGG, Opus, or AAC file loses an embedded cover.

### Auto-adjust a batch

**Auto-adjust** applies the Auto wand to each eligible image and video and saves it.

- Crops, masks, trims, other edits, and manual Color values stay.
- An earlier Auto result is replaced, not stacked.
- Originals are kept, so you can tune or revert each file in its editor.
- Unchanged files are skipped, and cancelling keeps the finished files.

Two options start off every run:

| Option | Effect |
| --- | --- |
| **Replace earlier adjustments** | Resets every Color tool before applying Auto, discarding manual values |
| **Reset all color adjustments to zero** | Clears manual and Auto color without applying Auto. Other edits stay |

### Split videos into clips

**Split into clips** (a Tool) cuts each video in the [job scope](#scope) into MP4 clips in a `clips/` subfolder.

- **Names.** Clips are named `<stem>_001.mp4`, `<stem>_002.mp4`, and so on. When two videos share a stem, such as `walk.mp4` and `walk.mkv`, the extension joins it (`walk_mkv_001.mp4`).
- **Cuts** fall on frame boundaries and are measured on the picture, so audio that runs past the picture's end never makes an extra clip.
- **Sources stay.** The videos and their captions stay as they are, and the clips start without captions, ready for Auto-caption.
- **Formats.** Any video the app lists can be split, including MKV, AVI, WMV, and FLV.

| Option | What it does |
| --- | --- |
| **Cut** | **At scene changes** cuts where the picture changes; **Evenly** cuts every **Clip length** seconds |
| **Scene sensitivity** | How clearly a cut must stand out from the frames around it. **Low** keeps only the plainest cuts; **High** also takes cuts between similar-looking shots |
| **Longest clip** | Scenes only: a longer scene is divided into equal parts no longer than this |
| **Shortest clip** | Shorter pieces, such as the end of a video cut evenly, are left out; 0 keeps them all |
| **Frame rate** | Converts the clips to 16, 24, 25, or 30 fps, or keeps each video's rate |

Camera moves, flashes, and dissolves are not cuts at any sensitivity.

**Splitting again** replaces a video's earlier clips, together with their captions and other related files (to the Recycle Bin on Windows). A video with no piece as long as **Shortest clip** keeps its earlier clips and is reported as a warning.

To set a frame rate without splitting, use the **Speed** tool in the video editor (applied when you save; the preview keeps the source's rate) or **Resize** for a batch.

### Trim videos to a length

**Trim to length** (a Tool) shortens each MP4, MOV, or M4V in the [job scope](#scope) that plays longer than **Longest length**. **Keep** picks the part that stays: the **Start**, the **Middle**, or the **End**.

- **Played length.** The length is measured as the video plays, so a video sped up to 2x keeps twice as many seconds of footage.
- **Existing trims.** A video that already has a trim is shortened within it, and shorter videos are left alone.
- **Stored as an edit.** The trim is stored as an edit on the original, cut on frame boundaries: the video editor shows it and can change or revert it.
- **Clear the trim** instead restores each video's full length and keeps all its other edits.

## Video editor

Combine videos, stills, audio, and titles on a multi-track timeline and export an MP4; see the [Video editor guide](video-editor.md).

## Jobs

The folder toolbar's **Tools** menu groups jobs under **Captions**, **Check**, **Media**, **Files**, and **Integrations**. You can also find the jobs in Quick actions. The [Job reference](#job-reference) lists what each one does.

### Scope

A job runs on the first of these that applies:

1. The selected files that are visible.
2. The files the search and filters show, when either is active.
3. The whole folder.

The dialog shows the count and freezes the file list when it opens, previews included. An empty scope cannot start a job.

**Exceptions:**

- **LoRA training** always uses the whole folder, and its dialog says so.
- **Run ComfyUI workflow** with a generation preset and **LoRA showcase** read no files. Their dialogs name the folder the new files go to, and they run even in an empty folder.

### Running and history

Jobs run in the background, one per folder at a time. Different folders run side by side.

- **Progress.** The strip under the toolbar shows progress, the current file, and the time left.
- **Cancel job** appears beside **Tools**. Cancelling keeps what was already written.

**Queue jobs.** Starting a job while another runs in the same folder queues it.

- The dialog's scope line says what it is **queued after**, and the strip counts the **queued** jobs (hover for their order).
- Each queued job starts as soon as the job before it finishes cleanly.
- If a job fails, is cancelled, is interrupted by a restart, or finishes with failed files, every job queued after it is cancelled, marked "Not run" in the Jobs drawer, and one notification says why.
- Cancelling the running job therefore cancels the queue too; cancelling a queued job from the Jobs drawer removes only that one.
- A queued job is checked again when it starts, so a folder an earlier step emptied fails it then.
- Jobs that use [folder instructions](#folder-instructions) read the saved text when they start and lock the file while they run.
- Restarting DataForge drops the queue.

**After a run.** A clean finish leaves no strip. After a failure, cancellation, warnings, or failed files, the strip stays until dismissed:

- **Retry N failed** reruns the failures.
- **Run again** uses the current scope.
- **Job details** opens the Jobs drawer with warnings, logs, per-file results, training samples, and earlier runs.

Finished runs are kept for the [job history](configuration.md#server-storage-and-logging) period, 30 days by default.

### Workflows

A workflow is a saved chain of jobs, each with its own settings, such as Resize, then Auto-caption, then Lint captions. Workflows are shared by every folder.

**Create and edit.** Click **Workflows** in the toolbar, then **New workflow...** or **Manage workflows...**. The editor lists your workflows on the left, the selected one's steps in the middle, and every job you can add on the right (filter them by name).

1. Type the name at the top.
2. Click a job to add it as the last step. A job with settings opens its usual dialog, whose button reads **Save step**; a job without settings is added as it is. Each step shows a one-line summary of its settings.
3. Change a step with **Settings**, reorder with the arrows, by dragging the grip, or with `Alt+Up`/`Alt+Down`, and remove it with the bin.
4. **Save** stores the workflow, **Run...** runs the saved version, and **Close** asks first when there are unsaved changes.

**Run.** Pick a workflow in the **Workflows** menu or in Quick actions (**Run workflow:** followed by its name).

- The confirmation lists the steps and the scope: the selection, else the files in view, fixed when you click **Run workflow**.
- The steps join the folder's [queue](#running-and-history) back to back and follow its rules: each starts when the one before it finishes cleanly, and a failure cancels the rest.
- Each job's card and the strip say which workflow and step it is. In the Jobs drawer, waiting jobs sit under **Queued** in the order they will start, each saying which job it starts after.
- The first step is checked when you run the workflow; later steps are checked when they start, since an earlier step may create what they need (for example, Backup captions before Restore captions).

**Settings are the workflow's own.** Running a workflow does not change what a job's dialog remembers for the folder, and the dialogs' one-run choices, such as **Overwrite existing captions** or **Reset size**, are kept with the step.

**Limits.**

- LoRA training and LoRA showcase cannot be steps, and **Run ComfyUI workflow** only with a preset that edits files.
- **Rename** can only be the last step, because the steps after it would look for the old file names.
- A workflow holds up to 12 steps, and up to 50 workflows can be saved.

### Job reference

Jobs are grouped as in the **Tools** menu.

**Captions**

| Job | Writes | Notes |
| --- | --- | --- |
| **Set captions** | `.txt` captions | One caption for every file; overwriting existing captions needs permission |
| **Auto-caption** | `.txt` captions | Writes missing captions and expands short drafts using the media and [system prompt](#folder-instructions) |
| **Find & replace** | `.txt` captions | Text or regex replace, or add a prefix or suffix. Previews counts and examples first; backs up first by default |
| **Edit captions** | `.txt` captions | A model rewrites captions to your instruction. Backs up first by default. **Dry run** previews it |

- **Auto-caption:** **Caption audio** also sends the video's audio to a compatible model. The dialog previews how many captions the job will write or skip based on the [draft threshold](configuration.md#vision-model-settings).
- **Find & replace:** regex `^` and `$` match at each line.
- **Edit captions:** the model sees the media only with **Send media**. See [Saved instructions and dry run](#edit-captions-saved-instructions-and-dry-run).
- **One run per caption.** Jobs that change captions run once per caption, so `scene.jpg` and `scene.png` sharing `scene.txt` are changed once, and the result names both.

**Check**

| Job | Writes | Notes |
| --- | --- | --- |
| **Lint captions** | `.issue.json` findings | Local [caption rules](#caption-rules); no model |
| **Verify captions** | `.issue.json` findings | A model checks each caption against its media; captions stay unchanged |
| **Find duplicates** | `.duplicate.json` groups | Deletes media only when you confirm in the resolver; see [Duplicates](#duplicates) |

**Media**

| Job | Writes | Notes |
| --- | --- | --- |
| **Auto-adjust** | Files in place, originals kept | See [Auto-adjust a batch](#auto-adjust-a-batch) |
| **Resize** | Files in place, originals kept | Fits images and videos to a megapixel size on a pixel grid. Can also set the videos' frame rate |
| **Trim to length** | Videos in place, originals kept | Shortens videos to a longest length, keeping the start, middle, or end; see [Trim videos to a length](#trim-videos-to-a-length) |
| **Split into clips** | MP4 clips in `clips/` | Cuts videos at scene changes or evenly; see [Split videos into clips](#split-videos-into-clips) |
| **Watermark** | Copies in `watermarked/` | Text, a PNG such as a logo, or both, each with its own size, opacity, and position |

- **Resize:** the frame rate option **Keep** leaves each video's rate as it is.
- **Watermark:** the PNG is kept for later runs. A run overwrites earlier copies, and captions are not copied. It can strip metadata from the copies.

**Files**

| Job | Writes | Notes |
| --- | --- | --- |
| **Rename** | New file names | Sequential, with related files; no undo |
| **Strip metadata** | Files in place | Removes EXIF, XMP, text and workflow metadata, video tags, and chapters. No undo |
| **Backup captions** | `.backup/` copies | See [Caption backups](#caption-backups) |
| **Restore captions** | `.txt` captions | See [Caption backups](#caption-backups) |

**Strip metadata** keeps image color and density data and every video and audio stream; video is remuxed, not re-encoded.

**Integrations**

| Job | Writes | Notes |
| --- | --- | --- |
| **Run ComfyUI workflow**, edit preset | Results in `staging/` | Accepting a result replaces the source with no backup; see [ComfyUI](comfyui.md#review-candidates) |
| **Run ComfyUI workflow**, generation preset | New files in the folder | Never replaces a file; see [ComfyUI](comfyui.md#generate-media) |
| **LoRA showcase** | New files in the folder | Renders several prompts with one LoRA, or compares LoRAs; see [Showcases](comfyui.md#showcases) |
| **LoRA training** | Nothing in the folder | Starts and monitors a run in [AI-Toolkit](ai-toolkit.md) |

#### Edit captions: saved instructions and dry run

**Saved instructions.** In **Edit captions**, **Saved** next to the instruction lists the instructions you saved.

- Click one to add it: it fills an empty field, or goes after a blank line, so several can be combined.
- To save the instruction you typed, choose **Save current instruction...**, name it, and press `Enter` or **Save**. A name already in the list (ignoring case) offers **Replace**.
- Saved instructions are shared by every folder and kept in `backend/data/`.
- **Verify captions** has the same menu beside **Additional context**, with its own list.

**Try Edit captions first.** Enter an instruction and click **Dry run**.

- It rewrites up to three readable captions from the dialog's scope, in filename order, with the job's model settings, and highlights removed and added text. Nothing is written.
- Changing the instruction or model clears it.
- The full job generates fresh text, so its wording can differ.
- With **Send media** on, the model also sees each file's image or video keyframes, so an instruction such as "add clothing colours" can use what the picture shows.

## Settings

Open **Settings** from the folder sidebar or with `Ctrl+,`. It covers appearance, model connections and input budgets, tagging, integration URLs, cache limits, and history retention.

- **Save** applies field changes.
- **Reset** then **Save** returns a field to its environment or default value.
- **Clear** actions apply immediately, even if you cancel.

See [Configuration](configuration.md) for every section, models, variables, and troubleshooting.

## Supported formats

Every format below shows in the gallery and takes a `.txt` caption. AI caption jobs and ComfyUI accept images and videos; jobs skip audio, which you caption by hand. Whether a workflow or training model handles a file depends on that model, not on the gallery.

| Format | Gallery | Editor | Strip metadata | Watermark | ComfyUI workflow shown |
| --- | --- | --- | --- | --- | --- |
| JPG/JPEG, WebP | Image | Image | Yes | Yes | — |
| PNG | Image | Image | Yes | Yes | Yes |
| BMP | Image | Image | Nothing to strip | Yes | — |
| AVIF | Image | — | — | — | — |
| HEIC, TIFF/TIF | Image, shown as a converted copy | — | — | — | — |
| GIF | Animation, frame capture | Convert to MP4 first | — | Yes | — |
| MP4, MOV, M4V | Playback and frame capture if the browser has the codec | Video | Yes | Yes | Yes |
| WebM | Playback and frame capture if the browser has the codec | — | — | — | — |
| AVI, MKV, WMV, FLV | Thumbnail only | — | — | — | — |
| WAV, MP3, FLAC, AAC, M4A, OGG, Opus | Waveform and playback | Audio | — | — | — |

- **HEIC and TIFF.** Browsers cannot decode them, so the viewer shows a WebP copy made from the file and kept in the thumbnail cache. The file itself is never changed, and caption jobs read the original.
- **Auto-adjust** covers the image and video editor formats.
- **Caption jobs** use a GIF's first frame and sample frames across a video, including containers the browser cannot play.
- **Watermarked GIFs** stay animated GIFs with their frame timing, loop count, and transparency.

### Model files

`.safetensors` model files, such as LoRAs from a training run, are listed in their own **Models** section above the media. It follows the toolbar's search (by name) and sort; filters apply to media only.

**Cards.** Each card says what the file is, read from its tensor names: checkpoint, diffusion model, LoRA (or LoKr, LoHa), ControlNet, embedding, text encoder, vision encoder, VAE, or upscaler. A file whose layout is not recognized shows as **Weights**. Cards take the colors and icons of the [workflow map](comfyui.md#inspect-embedded-workflows):

| Color | Kind |
| --- | --- |
| Purple | Diffusion models and adapters |
| Yellow | Encoders |
| Red | VAEs |

**Details.** Opening a model shows what its header records, without loading the weights:

- its kind, architecture, adapter rank, LoKr factor, and alpha;
- training step and epoch, and trigger words;
- parameter count and precision, including ComfyUI quantizations such as FP8 scaled, INT8 ConvRot, and NVFP4;
- every metadata key.

Models take no caption and no job. They can be copied, moved, renamed, and deleted, but not dropped into a folder to import.

## Files DataForge creates

`<stem>` is the name without its extension (`scene`); `<name>` includes it (`scene.jpg`). Related files travel with their media but are not gallery items. Media in `watermarked/`, `staging/`, and `clips/` can be browsed like any folder.

Files with the same stem, such as `scene.jpg` and `scene.png`, share one caption, but each keeps its own edit original and settings. Use different stems when files need different captions.

**Beside your media**

| File | Holds | Made by | Removed when |
| --- | --- | --- | --- |
| `<stem>.txt` | The caption | You or a caption job | You delete it or its media |
| `<name>.issue.json` | Caption findings | Verify or Lint captions | Findings are resolved or cleared |
| `<name>.duplicate.json` | A duplicate group | Find duplicates | The group is resolved, dismissed, or cleared |
| `<name>.bak` | The original | The editor or Auto-adjust | **Revert original**, or accepting a ComfyUI result |
| `<name>.edit.json` | The edit settings | The editor or Auto-adjust | **Revert original**, or accepting a ComfyUI result |
| `<name>.fills` | The pixels of [generative fills](#generative-fill) | Applying an edit with fills | **Revert original**, or accepting a ComfyUI result |
| `<stem>-edit.video-project.json` | A video editor draft, beside its first video | The video editor | **Delete project**; its media and exports stay |
| `<name>.video-project.json` | The edit an export came from, beside the exported video | Exporting from the video editor | It moves, copies, and deletes with the video |

For example, `scene.jpg` can have `scene.txt`, `scene.jpg.issue.json`, `scene.jpg.duplicate.json`, `scene.jpg.bak`, `scene.jpg.edit.json`, and `scene.jpg.fills`.

**In the dataset folder**

| Path | Holds | Made by | Removed when |
| --- | --- | --- | --- |
| `.sysprompt`, `.captionrules` | Folder instructions, in the dataset or a parent folder | Folder instructions | You save that tab empty |
| `.backup/<stem>.txt` | A caption backup | Backup captions | You delete it; restoring keeps it |
| `watermarked/` | Watermarked media | Watermark | You delete it |
| `clips/<stem>_001.mp4`, ... | Video clips | Split into clips | You delete it, or split the same video again |
| `staging/` | Results and their `<result-name>.comfy.json` records | Run ComfyUI workflow, edit preset | It is accepted, rejected, or deleted |
| `<prefix>_0001.png`, ... | Generated media, in the folder itself | Run ComfyUI workflow, generation preset; LoRA showcase | You delete it |

**App data in `backend/data/`**

| Path | Holds | Made by | Removed when |
| --- | --- | --- | --- |
| Database, thumbnails | Settings, jobs, notifications, and tags | The app | Pruned by [retention](configuration.md#server-storage-and-logging) |
| `fill_results/` | Generative fill results until you keep or discard them | Generative fill | Discard, or a day later |
| `watermark.png` | The PNG chosen in the Watermark dialog | Watermark | Choosing another PNG replaces it |
| `tag_vocabulary.txt` | Extra tag terms | You, or **Settings > Tagging > Vocabulary** | You delete it, or clear the list |
| `models/` | The tagging model | The first tagging run | You delete it |

`DATAFORGE_MODELS_DIR` moves the tagging model to another folder.

**Hidden folders.** The gallery hides `.backup/` and common repository, environment, system, and cache folders, such as `.git`, `node_modules`, `.venv`, `__pycache__`, `_latent_cache`, and `_t_e_cache`.

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
| Arrow keys | Nudge a focused crop, mask, or trim handle, or Color slider; `Shift` for larger steps |
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
