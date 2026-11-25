# Changelog

Notable user-facing changes to DataForge. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Every commit bumps the patch version, so entries collect under **Unreleased** and move under a
version heading when a minor or major version is cut.

## Unreleased

### Added

- The notification bell shows how many notifications are unread, in the same count badge as the jobs button. It turns yellow or red when an unread one is a warning or an error, and clears once you close the list. Both badges show **99+** for anything above 99.
- **Run ComfyUI workflow** has a **Saved** menu beside the prompt, like the one for **Edit captions** instructions. Save the typed prompt under a name, then add it to the prompt in any folder. Saved prompts are kept apart from saved caption instructions.
- **Verify captions** has the same **Saved** menu beside **Additional context**, with its own list of contexts to reuse in any folder.
- **Reasoning effort** in Auto-caption, Verify captions and Edit captions can also be **High** or **Max**. With llama.cpp or Unsloth Studio, the dialogs name the model the server has loaded and offer only the levels its chat template accepts, such as Low, Medium and Extra high for Qwen3.8. A remembered level the model lacks moves to the nearest one it has, and a model without levels, such as Gemma 4, is sent none. If the server cannot be read, the dialog says why. Until the server answers, the model name and levels show as loading instead of options that change, and the answer is kept until Settings are saved.
- **LoRA showcase** renders a trained LoRA across several prompts in one run, each item with its own extra LoRAs, strengths, seed and optional start image. Choose several LoRAs, such as a training run's saves, to compare them on the same seeds. Items can be saved as a set and reused for the next LoRA. It can also lay the results out on one labelled sheet, an image or a video, with items down and training steps or LoRAs across.
- AAC audio files (`.aac`), which AI-Toolkit trains on, are listed, played, captioned and editable like other audio. Their length is counted exactly, so trims and fades land where you set them.
- The **Files** filter has an **Unedited** option, which shows only files that have not been edited.
- Files that have a copy in their folder's `watermarked` folder show a **Watermarked** badge on their card and a stamp in list view, updated as the Watermark job writes each copy.
- `./update.sh` updates a Git clone on Linux and macOS the way `update.bat` does on Windows: it pulls the latest version and reruns setup only when a runtime or backend dependency changed.

### Changed

- Each folder remembers its own sort, like its view, so output and dataset folders can be sorted differently. Folders you have not sorted yet start with the newest files first; the sort chosen before this update is not carried over. **Settings > Data > Remembered data** clears both together.
- Setup, update, the launchers and the stop and install scripts show their progress the same way on Windows, Linux and macOS: one line per step, each with a check mark, its duration and what it found, such as how many packages were installed or which FFmpeg is used. pip, npm and git no longer fill the window; a step that is still running shows how long it has taken and what it is doing, and a step that fails shows its command and the end of its output. Each script ends with one line saying whether it worked and what to do next.
- The launchers and the stop script only stop a DataForge server started from the same folder. Another program's Python or Node, or another copy of DataForge, is named and left running.
- Windows setup checks the downloaded Python and Node.js against the checksums their publishers list, as it already did for FFmpeg, and retries a dropped download. It refuses a folder whose path contains `&` or `^`, where npm cannot run, and the launchers say when the backend environment no longer starts because the folder was moved.
- Auto-caption, Verify captions, Edit captions, LoRA training, Run ComfyUI workflow and Create showcase show whether the server they need is answering, in an indicator at the left of the action bar: green when it answers, red when it does not. It checks again every few seconds while the dialog is open, so a server that stops or starts shows without reopening. Hover over it for what is wrong and how to fix it. The job cannot start while it is red, though a workflow step can still be saved. **LoRA training** now opens while AI-Toolkit is stopped instead of being disabled in **Tools**. Edit captions and Find & replace are wider and show **Preview** beside their options, so the sample edits have room on a 1024×720 screen, with Edit captions' **Dry run** above it; and the instruction file Auto-caption and Lint captions read is named above their options, in a box like the file scope, together with what Auto-caption will do.
- **Edit with ComfyUI** and **Generate with ComfyUI** are now one job, **Run ComfyUI workflow**, which lists every preset. A preset that loads a source file edits the files in scope into candidates for review, as before; one without makes new files in the folder. Its options and start button follow the selected preset. A workflow step can use only a preset that edits files.
- The ComfyUI dialogs list workflow presets as you add, remove or export them again, without closing the dialog. A removed preset that was selected leaves nothing selected instead of switching to another.
- The per-file results in the jobs drawer show a thumbnail of each file a job made.
- The **Adjust** tab in the image and video edit panels is now called **Color**, matching the video editor. Color, Effects, Blur, Fill and the audio EQ tab have new icons.
- While automation jobs run, the robot on the jobs button looks left and right, its antenna swinging after it, and blinks now and then, instead of rocking side to side.
- The jobs drawer groups older jobs under **Last week** (the seven days before yesterday) and **Last month** before **Earlier**.
- **Dataset statistics** is as wide as the jobs drawer and shows the 32 most frequent words and tags as clouds of round bubbles packed around the commonest one in the middle. Bubbles grow and shade from cool to warm the more often a word appears. Each one shows its exact count on hover and searches the gallery when clicked.
- OGG, M4A and Opus audio can now be edited in the audio edit panel and placed in the video editor. An edit keeps the file's codec and bitrate; an M4A also keeps its cover, while an OGG, Opus or AAC file loses an embedded cover.
- In Settings, a saved value resets with a small button inside its field, which you can click again to undo the reset before saving. Units such as **chars** and **pixels** show inside the field after the number, so labels are no longer cut short.

### Removed

- The chat templates and MiniMax H3 prompt files in `llm_templates/`. Use the chat template that comes with your model; with Gemma 4, turn thinking on in the server to use Reasoning.

### Fixed

- An out-of-range `DATAFORGE_API_PORT`, such as `99999`, no longer stops the development API from starting: it uses the default port 18080, the one the launcher waits on.
- Saving or reverting an edit in the image, video or audio edit panel keeps the file's creation date on Windows and macOS; only its modified date changes.

## 0.15.0 - 2026-11-20

### Added

- **Effects** adds nine adjustable looks to gallery images and videos and to individual picture clips in the video editor.

- **Generate with ComfyUI** (Tools → Integrations) runs a ComfyUI workflow a chosen number of times and adds what it makes to the open folder as new files, named `<prefix>_0001` onwards without replacing anything. Each generation draws a random seed unless you enter one, and the prompt can be saved as each file's caption. Presets without a source loader list here instead of under **Edit with ComfyUI**; try the bundled `example_solid_color` preset, which needs no models.
- The **ComfyUI workflow** dialog of a generated file offers **Generate with this workflow...** for an output that loads no source file. It opens Generate with ComfyUI on that output, starting from the prompt the file was made with, and runs it without saving a preset.
- **Manage workflows...** in Quick actions opens the workflow editor, on your first saved workflow or on a new one when none are saved.
- The crop **Aspect** choices in the image and video edit panels include **Original**, which locks the crop to the file's own shape.
- **Settings → About → Performance** shows the computer DataForge runs on, read live every second while the page is open. It graphs the last minute of CPU, memory, GPU and VRAM use, and adds each thread's load, clocks, the GPU driver and PCIe link, drive space, disk and network rates, and how much CPU and memory DataForge itself uses. A bar splits the VRAM by the apps holding it, naming your vision server, ComfyUI, AI-Toolkit and DataForge when they run on this computer; hover a part for its size, or focus the bar to list them all. On a Mac the split is not available.

### Changed

- DataForge now needs Node 26. Windows setup downloads it into `.node/` on its next run; on Linux and macOS, install a Node 26 release before running `setup.sh` or updating, since older and newer versions are refused.
- The interface has more depth and smoother motion. Dialogs grow out of the control that opened them and fade away when closed, whether cancelled or confirmed. Menus, toasts and the jobs drawer's cards move in and out instead of popping, and tabs and segmented choices slide their marker to the new choice. Buttons and cards dip when pressed, checkboxes spring their tick, a folder's contents fade in when it opens, and switching between light and dark crossfades the whole window. The folder sidebar wipes open from its rail and folds back into it. With your system's reduced-motion setting on, all of this stays still.
- Gallery cards show each file's main colour while its thumbnail loads, once the thumbnail has been shown before. Paging in the viewer slides the next file in from the side you are moving toward, counts roll to their new value, and long file names are cut in the middle so the number and extension stay visible. The toolbar's view controls and its notification and job buttons each sit together in one group.
- Text uses Inter's single-storey a and open digits, and file names show a serifed I and a tailed l so names like `Il1` cannot be misread.
- The gallery is easier to scan. List view labels its columns (Caption, Pixels, Ratio, Length, Size, Modified) and keeps the headings in view as you scroll, and its values are larger. Small cards show a video's or audio file's length and mark GIFs, and color issue, duplicate and candidate marks so they stand apart. Card badges stay readable on light images, and the "No caption file found" note no longer looks like a button.
- Keyboard focus looks the same on every control: one accent ring drawn along the control's own edge, so it is no longer cut off at the edge of lists, menus and dialogs. Checkboxes, radio buttons, slider thumbs and handles get the ring a little way out from them instead.
- The **Edit with ComfyUI** dialog now opens at the size of the Workflows editor, with every preset listed down the side along with what it takes, and the selected one drawn as a workflow map: the models, LoRAs, prompt and passes it runs, with the box for each source file marked. A preset that cannot be read says why there, and a dot shows whether ComfyUI answered.

### Fixed

- Accepting a ComfyUI result with **Keep original metadata** no longer erases its workflow when the source image has no metadata to carry over, so the **ComfyUI workflow** button still shows on the accepted file.
- The workflow map in **Edit with ComfyUI** and **Generate with ComfyUI** now redraws as you change the workflow's inputs, so switching on an input such as a face detailer shows that pass as run.
- Workflow maps name the sampler a pass uses when it comes from a sampler node such as SamplerLCM, which previously showed no sampler at all.

## 0.14.0 - 2026-11-16

### Added

- **Trim to length** (Tools → Media) shortens videos to a longest length, keeping the start, middle or end of each. The trim is a normal edit that the video editor shows and can revert, and **Clear the trim** restores full length in a batch. It also works as a workflow step.
- Workflows: save a chain of jobs with their own settings, edited in each job's usual dialog, and run it on the selection or folder from the toolbar or Quick actions. The steps queue back to back and stop at the first failure.
- Jobs can be queued: starting a job while another runs in the same folder queues it to start when the one before it finishes cleanly. A job that fails, is cancelled or leaves failed files cancels everything queued after it.
- The gallery lists, previews and captions more formats: AVIF, HEIC and TIFF images, WebM videos, and OGG, M4A and Opus audio. These are view-only: the editors, Resize, Watermark and Strip metadata skip them.
- Desktop notifications: turn them on in **Settings → Notifications** to see finished jobs and other notifications on your desktop while DataForge is in the background. You can limit them to warnings and errors, or errors only. Clicking one brings DataForge back.
- The system specifications panel shows power draw: GPU power against its limit, GPU fan speed, and CPU package power. On Windows, run `scripts\install-hardware-sensors.bat` again for CPU power; it replaces the CPU temperature installer.

### Changed

- The system specifications panel is redesigned: a card per device with labelled meters for load, RAM and VRAM, and temperature, power and fan readings beside each device's name. It refreshes every second while open, not only during jobs.
- The **Tools** menu is redesigned and more compact: it lists each tool by name, in one row of sections. Hover over or focus a tool to see what it does and, when it is unavailable, why. Left and Right arrow keys move between sections.
- **Tools**, **Workflows** and **Review** name their scope at the bottom of the menu: the selected files, the files matching the search and filters, or the whole folder.
- **Auto-caption** is now under **Tools → Captions** in the folder toolbar. You can configure it as a workflow step before choosing a folder with a system prompt.
- Large and small gallery cards show an **Edited** badge on edited files, as the list view already did.
- Videos in the viewer and inspector remember whether you muted or unmuted them, and at what volume: the next video and later visits start the same way, and the edit preview follows the mute.
- **Save** in Settings no longer closes the dialog: the saved values show as saved and you can keep editing.
- Settings: **Storage** and **Data & history** are now one section, **Data & storage**, with **History** and **Storage** tabs.
- Buttons, tabs, menus, checkboxes, form fields, dropdowns, sliders, progress bars, folding sections, status badges, tags and empty lists look and behave the same across the gallery, dialogs and the video editor. Menus can be moved through with the arrow keys, the editing tools are tabs that screen readers announce as such, and screen readers read each dialog field's hint with the field.

## 0.13.0 - 2026-11-10

### Added

- **Split into clips** cuts videos into short MP4 clips in a `clips` folder, at scene changes or
  every few seconds, with a longest and shortest clip length. Clips, single videos in the editor's
  Speed tool, and **Resize** batches can be converted to 16, 24, 25 or 30 fps.
- **Edit captions** can save instructions by name and add them back from a **Saved** menu, so
  instruction fragments can be reused and combined.
- On Windows, a drive button at the start of the folder path switches to another drive. It
  shows each drive's label and type, picks up a USB stick or card within seconds of plugging it
  in, and skips empty card readers and disconnected network drives. A folder on an unplugged
  drive says the drive is not connected and opens again once it is back.
- Hidden folders (named with a leading dot, or marked hidden in Windows) can be left out of the
  gallery, the path bar's folder menus and the move/copy folder tree. Turn it on under
  **Settings > Appearance > Gallery**, from the command palette, or with Alt+H.
- The gallery and Models section can be sorted by date created and by file size.
- Your own tag terms can be edited under **Settings > Tagging > Vocabulary**, instead of only in
  `backend/data/tag_vocabulary.txt`.
- On Windows, `update.bat` updates a Git clone to the latest version and reruns setup when the
  update needs it. It requires Git on PATH.

### Changed

- In the file viewer, **Review candidate** and **Resolve duplicate** are icon buttons at the start
  of the header, so only caption actions sit above the caption. While comparing a caption with
  its backup, only **Back to editing** and **Restore** (formerly **Use backup**) are shown.
- Caption comparisons look the same in **Restore captions**, the file viewer's **Compare**, and
  the **Find & replace** and **Edit captions** previews: each changed word is marked on its own,
  with a count of removed and added words per file. The text fields in those two dialogs grow as
  you type, and a long entry no longer pushes the preview out of view.
- Model cards show what each file is (checkpoint, diffusion model, LoRA, ControlNet, text
  encoder, VAE and more) in the ComfyUI workflow map's colors and icons, instead of a same-stem
  preview image.
- The Fill tool's Quality preset samples at CFG 3 instead of 1, so it follows the instruction
  more closely. Change it under **Settings > Integrations > Generative fill > Quality CFG**.
- Background tagging is off until you turn it on under **Settings > Tagging**; while it is off,
  tags are hidden everywhere. A changed vocabulary now applies only to files tagged from then on
  instead of re-tagging every favorite, and **Re-tag everything** brings older tags up to date.

### Fixed

- Folders on a mapped network drive or a `subst` drive keep their drive letter in the path bar
  and address bar, instead of switching to the share or folder the drive points at.

## 0.12.0 - 2026-11-06

### Added

- Folders list their `.safetensors` model files in a **Models** section. Open one to see its
  architecture, rank, training step, trigger words and full metadata; models can be copied,
  moved, renamed and deleted like media, and a same-stem image serves as the card's preview.

### Changed

- Folder instructions show the active prompt and caption rules, their source and any file
  problems. Inherited instructions can be previewed and customized for the current folder.
  System prompts must start with a `#` heading; deeper headings are allowed after it.
- Folders with many PNG files, such as a ComfyUI output folder, open several times faster the
  first time after a restart or when new images arrive.
- Dialogs come in three consistent widths: narrow for confirmations, medium for forms and wide
  for editors such as Settings, Watermark and the ComfyUI workflow. Full-screen viewers keep
  their size.

## 0.11.0 - 2026-11-04

### Added

- Generative fill in the image editor: paint over an area and remove it or replace it from an
  instruction, using Qwen-Image 2.1 in your own ComfyUI. Fills stack, can be undone one by one,
  and only the painted area changes.
- Range filters for megapixels, video duration and caption length, each with a small chart of
  matching files. Clicking a bar in the statistics drawer sets the same range.
- Card actions are configurable in **Settings > Appearance > Gallery**, adding inspector actions
  such as Edit, Move file or Rename file to the hover actions.
- Watermark can place a PNG such as a logo, alone or alongside text, each with its own size,
  opacity and position.
- ComfyUI workflows can expose custom inputs: any node titled `DataForge <name>` adds a matching
  field to the Process with ComfyUI dialog. Int nodes can also serve as the seed input.
- Edit captions has a **Send media** option that sends each file's image or video keyframes,
  so instructions can draw on what the media shows.
- Bass, Mid and Treble on audio clips in the video editor can be keyframed.
- Video exports appear in the jobs drawer and the notifications feed.
- Unplayable videos explain why instead of showing a black player, with Retry and an in-place
  Convert to H.264 that can be reverted.
- Keyboard shortcuts `Ctrl+1`, `Ctrl+2` and `Ctrl+3` (`⌘` on macOS) switch between large
  cards, small cards and the list view.
- CPU temperature readings support more processor vendors.

### Changed

- Blur and pixelation strength is measured against the whole image rather than the masked
  region, so resizing a region no longer changes how strongly it hides.
- Review tools and their queues follow the job scope: the selection, otherwise the search and
  filter results, otherwise the folder.
- Auto-caption writes captions from the media alone for files with no or an empty caption.
- The video editor's sliders were reworked for consistent units and finer control.
- Lint and Verify captions note when a caption changed after it was checked, and caption-job
  undo can retry restores that failed.

### Fixed

- Deleting a file while it was being rendered could recreate it or lose its original; file
  writers now refuse conflicting work.
- Saving a caption that changed elsewhere since it was opened silently overwrote it; it now
  offers Reload or Overwrite. Unreadable captions no longer look empty.
- An empty selection no longer runs a job on the whole folder.
- Plain-text find-and-replace inserted backslashes, group references and dollar signs as
  regex syntax instead of verbatim.
- A slow regular expression could hang caption replacement or the gallery search; both now
  stop it with a clear error.
- Deleting the open item closed the item dialog instead of moving to the next file.
- Videos were misaligned in the edit panel.
- The selection indicator on cards was hard to read.
