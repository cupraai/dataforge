# Changelog

Notable user-facing changes to DataForge. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Every commit bumps the patch version, so entries collect under **Unreleased** and move under a
version heading when a minor or major version is cut.

## Unreleased

### Added

- The notification bell shows how many notifications are unread, in the same count badge as the jobs button. It turns yellow or red when an unread one is a warning or an error, and clears once you close the list. Both badges show **99+** for anything above 99.

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
