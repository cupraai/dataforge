# Changelog

Notable user-facing changes to DataForge. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Every commit bumps the patch version, so entries collect under **Unreleased** and move under a
version heading when a minor or major version is cut.

## Unreleased

### Added

- On Windows, a drive button at the start of the folder path switches to another drive. It
  shows each drive's label and type, picks up a USB stick or card within seconds of plugging it
  in, and skips empty card readers and disconnected network drives. A folder on an unplugged
  drive says the drive is not connected and opens again once it is back.
- Hidden folders (named with a leading dot, or marked hidden in Windows) can be left out of the
  gallery, the path bar's folder menus and the move/copy folder tree. Turn it on under
  **Settings > Appearance > Gallery**, from the command palette, or with Alt+H.

### Fixed

- Folders on a mapped network drive or a `subst` drive keep their drive letter in the path bar
  and address bar, instead of switching to the share or folder the drive points at.

### Changed

- Model cards show what each file is (checkpoint, diffusion model, LoRA, ControlNet, text
  encoder, VAE and more) in the ComfyUI workflow map's colors and icons, instead of a same-stem
  preview image.
- The Fill tool's Quality preset samples at CFG 3 instead of 1, so it follows the instruction
  more closely. Change it under **Settings > Integrations > Generative fill > Quality CFG**.

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
