# Video editor

[Documentation](README.md) | [User guide](user-guide.md)

Use the video editor to combine videos, still images, audio, and titles on a multi-track timeline, then export a new MP4. Projects reference the source files in the open folder; editing does not copy or modify those files.

![DataForge video editor showing sample media, a title over the preview, video and audio tracks with a cross-dissolve, and title settings in the inspector.](video-editor.png)

- [Start a project](#start-a-project)
  - [Find your way around](#find-your-way-around) · [Set the canvas and frame rate](#set-the-canvas-and-frame-rate)
- [Add and replace media](#add-and-replace-media)
  - [Supported sources](#supported-sources) · [Preview and place a take](#preview-and-place-a-take) · [Insert, replace, or fit to fill](#insert-replace-or-fit-to-fill)
- [Edit the timeline](#edit-the-timeline)
  - [Select, move, split, and delete](#select-move-split-and-delete) · [Tracks, snapping, and zoom](#tracks-snapping-and-zoom) · [Trim and enter exact times](#trim-and-enter-exact-times) · [Ripple, roll, and sync lock](#ripple-roll-and-sync-lock) · [Copy clips and attributes](#copy-clips-and-attributes) · [Markers](#markers)
- [Adjust picture and titles](#adjust-picture-and-titles)
  - [Add titles](#add-titles) · [Cross-dissolves](#cross-dissolves)
- [Animate settings](#animate-settings)
- [Mix audio](#mix-audio)
  - [Fades and crossfades](#fades-and-crossfades) · [Shape the sound](#shape-the-sound) · [Track levels and speech ducking](#track-levels-and-speech-ducking)
- [Check the preview](#check-the-preview)
  - [Preview problems](#preview-problems)
- [Save and manage projects](#save-and-manage-projects)
  - [Project files](#project-files) · [Save failures and conflicts](#save-failures-and-conflicts) · [Versions, duplicates, and deletion](#versions-duplicates-and-deletion) · [Missing or changed sources](#missing-or-changed-sources)
- [Export video](#export-video)
  - [Choose the output](#choose-the-output) · [Set the sound level](#set-the-sound-level) · [Follow the export](#follow-the-export)
- [Keyboard shortcuts](#keyboard-shortcuts)
  - [Playback and navigation](#playback-and-navigation) · [Tools, selection, and view](#tools-selection-and-view) · [Editing and clipboard](#editing-and-clipboard)

## Start a project

1. Open the folder containing your media in the gallery.
2. Choose how to start:
   - **From a video.** In a video's viewer, click the **clapperboard**. The video starts at 00:00 on V1, with its sound linked on A1 when it has audio.
   - **Empty project.** In the folder sidebar, choose **Open video editor**. An empty project starts at 1920 × 1080 and 24 fps. Add a video first to adopt its frame size, frame rate, and name.
   - **Continue an edit.** Open it under **Video projects** in the gallery or in the editor's **Projects** tab.
3. Position the timeline playhead where you want to add media.
4. Click a file in **Media** to preview it in **Source**, mark the portion you want with `I` and `O`, then choose **Add to timeline**.
5. Switch the monitor to **Timeline** to play the edit. Select a clip to adjust it in the inspector, or drag its edges to trim it.
6. Check the save status beside the project name, then choose **Export** when ready.

Opening a previously exported video with its project snapshot restores the recorded edit as a new draft; see [Project files](#project-files).

### Find your way around

| Area | Purpose |
| --- | --- |
| Top bar | Project name, save and export status, project settings, and the way back to the gallery |
| Media browser | The folder's media, or your drafts under **Projects** |
| Monitor | **Source** previews a file before you add it; **Timeline** previews the assembled edit |
| Timeline | Clips arranged on video and audio tracks |
| Inspector | Settings for the selected clip, transition, or group of clips |

- **Top bar.** Rename the project, check save and export status, change project settings, and return to the gallery. The **Project actions** menu holds project management commands. The top bar can also hide the media browser and inspector.
- **Media browser.** Browse the folder's media or switch to **Projects** to reopen a draft. Search filenames, filter by media type, and switch between tiles and a list. Used files are marked.
- **Monitor.** Controls below the monitor play, seek, and step through frames.
- **Timeline.** The toolbar contains editing tools, track and title buttons, snapping, and zoom.
- **Inspector.** With nothing selected, it shows **Markers** and **Mix**.
- **Panel sizes.** Drag the panel dividers to resize them; double-click a divider to reset its size.

Terms used in this guide:

- A **source** is a media file.
- A **clip** uses all or part of that file on the timeline. You can use the same source in several clips with different trims and settings.
- The **playhead** marks the current playback position.

### Set the canvas and frame rate

Click the dimensions and frame rate in the top bar, or choose **Project actions > Project settings...**.

| Setting | Choices |
| --- | --- |
| **Match a video** | The size and frame rate of a video in the project |
| **Aspect ratio** | 16:9, 4:3, 3:2, 5:4, 1:1, 1.85:1 Flat, 1.90:1 DCI, 2:1, or 2.39:1 Scope |
| **Resolution** | The short side: 480p, 720p, 1080p, 1440p, or 2160p |
| **Width** / **Height** | The exact canvas size |
| **Frame rate** / **FPS** | 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, or 120 fps, or any rate up to 120 typed in |
| **Background** | The color in gaps, around fitted pictures, and in the padding of an export with a different shape |

- **Aspect ratio** keeps the current short side; **Resolution** keeps the current aspect ratio.
- **Swap width and height** switches between landscape and portrait.
- **NTSC rates** are stored exactly.
- **Background** is black by default.
- **Presets** fill in the exact fields; a typed size or rate that matches no preset shows as **Custom**.
- **Summary.** A summary under the fields shows the resulting size, aspect ratio, and rate.
- **Odd dimensions** round down to even pixels for encoding.

These settings define the canvas and the timeline's frame steps. Export has separate size and shape choices.

## Add and replace media

### Supported sources

Keep the files you want to use in the project's folder.

| Media | Filename suffixes |
| --- | --- |
| Video | `.mp4`, `.mov`, `.m4v` |
| Still image | `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp` |
| Audio | `.wav`, `.mp3`, `.flac`, `.aac`, `.m4a`, `.ogg`, `.opus` |

- GIF and other gallery video formats are not editor sources.
- A supported video suffix does not guarantee that the browser can play its codec; see [Preview problems](#preview-problems).

### Preview and place a take

1. Set the timeline playhead where you want the take to start.
2. Click a file in **Media** to open it in **Source**.
3. For video or audio, seek to the desired start and end and use **Mark in** / **Mark out** or `I` / `O`. Clear the marks to use the whole file again.
4. Choose **Add to timeline**.

Ways to place media:

- **Add to timeline** places the marked source range at the timeline playhead on the first free compatible track. Existing clips keep their positions.
- **Plus button.** The **+** beside a media file adds the whole file at the timeline playhead.
- **Dragging** a file from **Media** chooses its track and start time directly: pictures go on video tracks, sound on audio tracks.

Placement notes:

- **Linked audio.** A video with sound also needs a free audio track for its linked audio clip. If there is no room, move the playhead or add a track.
- **Stills** initially last five seconds. Change **Length** in the inspector or trim their edges to set how long they stay on screen.
- **Source controls.** While **Source** is active, playback, frame stepping, `Home`, `End`, `I`, and `O` act on the source file. Switch to **Timeline** to use those controls on the edit.

### Insert, replace, or fit to fill

These actions use the file and range currently shown in **Source**.

| Action | Result |
| --- | --- |
| **Insert** | Opens space at the timeline playhead and places the take there |
| **Replace** | Replaces one selected media clip, keeping its start, track, link, look, gain, fades, and dissolves |
| **Fit to fill** | Replaces the selected clip and changes the take's speed to fill its duration exactly |

- **Insert.** On tracks with sync lock on, clips after the playhead move later and clips crossing it are split. Linked clips follow. A locked track that would change blocks the insert.
- **Replace.** A longer take is cut to the slot; a shorter one ends early and leaves a gap. Replacement is refused if shortening would remove a dissolve.
- **Fit to fill.** The required speed must be between 0.25× and 4×; mark a range closer to the slot's length if it falls outside that range.
- **Linked audio.** When replacing a video, a take without sound removes the old linked audio. A take with sound replaces the linked audio or adds it on a free audio track.

## Edit the timeline

### Select, move, split, and delete

Clips stay at their assigned times until you move them or use a ripple operation. Dragging a clip into another stops it flush against that clip; intentional audio overlaps and video dissolves are described below.

- **Select.** Click a clip to select it. Use `Shift` to add or remove clips, or drag a box over empty lane space to select every clip the box touches. `Shift` adds a box selection to the current selection.
- **Select many.** `Ctrl+A` selects every clip. `A` selects clips starting at or after the playhead; `Shift+A` restricts that selection to tracks containing the currently selected clips.
- **Move.** Drag a selection to move it, or use `,` / `.` to nudge it one frame earlier / later.
- **Split.** Choose **Blade** (`B`) and click to split, or press `Ctrl+B` at the playhead. With clips selected, the shortcut splits those clips; with no selection, it splits clips crossing the playhead on unlocked tracks.
- **Delete** removes selected clips and leaves their time empty.
- **Duplicate** (`Ctrl+D`) places copies after the selection when there is room.
- **Undo and redo** reverse or reapply edits.

**Linked sound.** A video's linked sound moves, trims, splits, retimes, and deletes with it. Use **Unlink** in the inspector to edit either independently. The inspector also offers **Link video and audio** for a compatible selection.

### Tracks, snapping, and zoom

Higher video tracks cover lower ones. Put titles and overlays above the picture they should cover. Add video or audio tracks from the timeline toolbar.

In a track header:

| Control | Effect |
| --- | --- |
| Name (double-click) | Renames the track |
| Arrows | Reorder the track |
| Remove | Removes the track when it is empty |
| **Lock** | Prevents clip edits |
| **Hide** | Removes a video track from the picture |
| **Mute** | Silences an audio track |
| **Solo** | Isolates audio tracks |

Mute takes priority over solo. The header's sync lock button is described in [Ripple, roll, and sync lock](#ripple-roll-and-sync-lock).

- **Snapping** (`S`) aligns edits with clip edges, the playhead, and markers.
- **Zoom.** Use `+` / `-` to zoom, `Ctrl` + mouse wheel to zoom around the pointer, or `Shift+Z` to fit the project in view.
- **Clip previews.** Video clips show frame thumbnails; audio clips show a waveform with one lane per channel, left above right. Both update for the visible stretch and zoom level, so zooming in reveals local frames and transients.

### Trim and enter exact times

With **Select** (`V`), drag a clip's start or end edge to trim it. `Q` / `W` trim the start / end to the playhead. Ordinary trims leave other clips in place.

The inspector's **Timing** panel provides exact controls:

| Field | Changes |
| --- | --- |
| **Start** | Where the clip begins on the timeline |
| **In** | Where playback begins within the source file |
| **Length** | How long the clip lasts on the timeline |
| **Speed** | Playback rate |

- **In** slips the take while the clip stays in place.
- **Speed.** Linked sound follows the speed and keeps its pitch.

**Start**, **In**, **Length**, and the transport's playhead time accept:

- `HH:MM:SS:FF` timecode, or shorter timecodes such as `SS:FF`. `FF` is the frame field, not a decimal fraction of a second.
- Frame counts (`36f`).
- Seconds (`1.5s`).
- Relative frame changes (`+12`, `-3`).

Values land on the project's frame grid.

### Ripple, roll, and sync lock

Use these tools when a trim should also change the timing of neighboring clips:

- **Ripple trim** (`T`): drag an edge to shorten or extend a clip and move later clips by the same duration change. Trimming the start changes the source in point while the clip's timeline start stays fixed. `Shift+Q` / `Shift+W` ripple trim the start / end of the clip under the playhead to it.
- **Roll trim** (`N`): drag the cut between two touching clips to trim both together. The overall span and every other clip's timing stay fixed. An edge without a touching neighbor trims normally.
- **Ripple delete** (`Shift+Delete` or `Shift+Backspace`): mark a timeline range with the **Range** tool (`R`), or with `I` and `O`, then remove that interval and close the gap. This differs from deleting selected clips, which leaves a gap.

**Sync lock** is the chain-link button in each track header:

- Insert, ripple delete, and ripple trims include tracks with sync lock on.
- Ripple trims also move later clips on the tracks being trimmed.
- Linked picture and sound stay together even when one track has sync lock off.

Limits:

- **Locked tracks.** A locked track blocks an operation that would change its clips.
- **New overlaps.** A ripple trim that would push clips into a new overlap is refused; make room or turn off sync lock on the track you want to leave in place.
- **Dissolves and crossfades.** Ripple and roll trims cannot operate inside a dissolve or crossfade; remove the overlap first.

### Copy clips and attributes

- **Copy and paste.** `Ctrl+C` / `Ctrl+X` copy / cut clips with their linked sound and dissolves. `Ctrl+V` pastes them at the playhead, including into another project opened in the same session.
- **Other folders.** Pasting into another folder checks for the referenced files there; missing or changed sources need relinking.

To reuse settings without copying a clip:

1. Copy the clip.
2. Select the destination clips.
3. Choose **Paste attributes** (`Ctrl+Shift+V`).
4. Choose which groups to transfer from the first copied clip: color, transform, crop, fades, gain, or title style.

### Markers

- **Add.** In **Timeline** mode, press `M` to add a marker at the playhead for a beat, lyric line, or shot note.
- **Navigate.** Markers appear as flags on the ruler; click one to jump to it, or use `Shift+↑` / `Shift+↓` to step between them.
- **Snapping.** Edits snap to markers when snapping is on.
- **Edit.** With nothing selected, the inspector's **Markers** panel lets you name markers, add notes, change their times, search their text, and remove them.
- **Timeline edits** never move markers.

## Adjust picture and titles

Select a picture clip to use the inspector:

- **Transform** sets position, scale, rotation, and opacity. **Fit** shows the whole picture within the canvas; **Fill** covers the canvas and can cut off its edges. In the timeline monitor, drag the selected picture to move it or use its corner handles to scale it.
- **Crop** sets the visible source area before fitting and transforming it.
- **Color** provides manual adjustments and **Auto**, which analyzes the clip's frames to correct levels and color cast. Save adjustments as a named grade to reuse in any project.
- **Effects** applies a built-in look to an image or video clip. Set its strength, or choose **None** to return to the clip’s color adjustments.
- **Timing** sets fade in and fade out, as well as clip timing and speed.
- **Reset.** Double-click a slider's label to reset that setting.

**Several clips.** With several clips selected, the inspector can apply fades, gain, fit, scale, opacity, still or title length, or a saved grade to all of them as one undo step.

### Add titles

1. Move the playhead to the desired start.
2. Choose **Add title** in the timeline toolbar. A title initially lasts three seconds and uses the topmost free video track.
3. Keep it above the underlying picture, and add a video track if there is no room.
4. Select the title to edit its text, font, size, alignment, position, text color, and outline in the **Title** panel.

- **Duration.** Set it with **Length** or the title's trim edges.
- **Motion.** Titles also move, scale, rotate, fade, and animate like other pictures.
- **Fonts.** Titles can use any font installed on the computer running DataForge. A missing font falls back to the default font.

### Cross-dissolves

Select the outgoing picture clip and add a **cross-dissolve** in the inspector.

- **Overlap.** This moves the next clip back to overlap the selected one; the overlap is the dissolve's duration.
- **Change or remove.** Select the transition to change its duration or remove it.
- **Pulling the clips apart** also removes the dissolve.

## Animate settings

Position, Scale, Rotation, Opacity, and an audio clip's Gain, Bass, Mid, and Treble support keyframes.

1. Select a clip and place the timeline playhead where the animation should begin.
2. Click the **diamond** beside a setting to add a keyframe at that time.
3. Move the playhead and change the setting to create another keyframe. Once a setting has keyframes, its slider and monitor drags change the value at the playhead.
4. Use the arrows beside the setting to step between keyframes. Choose **Linear**, **Ease in**, **Ease out**, **Ease in and out**, or **Hold** to control how the current keyframe leads into the next.

- **On the timeline.** Keyframes appear as diamonds on the clip; gain also appears as an envelope line over the audio waveform.
- **Clip edits.** Keyframes stay with the picture or sound when the clip is split, trimmed, or retimed.

## Mix audio

- **One clip.** Select an audio clip to set its **Gain**, fade lengths, and fade shape.
- **Overall mix.** Clear the selection to show the inspector's **Mix** panel.

### Fades and crossfades

- **Crossfades.** Audio clips on the same track may overlap the next clip; the overlap automatically crossfades between them.
- **Overlap limits.** One clip cannot completely cover another, and at most two clips can overlap on a single audio track.
- **Fade shape.** The **Fades** setting in the clip's **Audio** panel controls fades and crossfades. **Equal power**, the default, keeps crossfade loudness steady; **Linear** dips in the middle.

### Shape the sound

An audio clip's **Sound** panel has the gallery audio editor's EQ and noise reduction: **Low cut**, **Bass**, **Mid**, **Treble**, **High cut**, and **Noise reduction**.

- **Keyframes.** Bass, Mid, and Treble can be keyframed like any other setting (see [Animate settings](#animate-settings)); the cuts and noise reduction stay fixed for the whole clip.
- **Several clips.** Select several audio clips, for example every clip on a track, to set them all at once; that sets the static values, not keyframes.
- **Paste attributes** can copy them as **EQ and noise reduction**, keyframes included.
- **EQ** plays live.
- **Noise reduction** is rendered on the server first; the clip plays unprocessed while the panel says **Preparing noise reduction...**. The export reads that same render, so the clip stays in sync with its picture and sounds as previewed.

### Track levels and speech ducking

- **Levels.** **Mix** sets the level of each audio track and the **Master** level.
- **Speech ducking.** Click a track's microphone button to mark it as speech. While one of its clips sounds, other tracks lower to **Duck to**, easing down just before the speech and back up afterward. Ducking follows the speech clips' timing.
- **Mix meter.** During playback, the transport's mix meter shows the preview peak for each channel. It turns amber above -1 dB and latches **Clip** at full scale; click to clear that indicator.
- **Export.** Export's **Sound** setting can additionally limit or normalize the finished mix.

## Check the preview

The transport shows the resolution used to draw the monitor. It also reports when color-adjusted clips use a reduced copy or cannot be colored in the browser.

- **Show the export's frame** (image button) renders the playhead frame at full size with the export renderer. Use it to check output fidelity.
- **Scopes** (waveform button) shows a luma waveform, an RGB histogram, and the proportion of the monitor picture crushed to black or clipped to white. Scopes measure the displayed preview.
- **Compare with this frame** (split-square button) holds the current frame as a reference. Move to another shot or adjust this one, then drag the divider to compare the held frame on the left with the live picture on the right.
- **Safe-area guides** overlays guides to help position picture and text.

How playback behaves:

- **Start.** Playback, and every jump during it, starts once the picture and sound at the playhead are ready; the monitor shows **Preparing media...** meanwhile.
- **Sync.** The picture then follows the sound. If a video cannot keep up, the monitor skips its frames instead of interrupting the sound.
- **Pause.** Pausing stops on the frame shown.
- **Scrubbing.** Dragging the playhead along the ruler or the monitor's playhead slider plays the sound under it, through the same mix as playback.

### Preview problems

If the browser cannot play a source, the monitor names it and explains the problem, such as an unsupported codec. It draws a marked box for that source and lets playback continue.

- **Retry** loads it again.
- **Use an H.264 copy** (for a video) writes `<stem>-h264.mp4` beside the source and relinks the project to the copy. The original file stays intact.
- **Missing or changed files** need [source recovery](#missing-or-changed-sources) before export.

## Save and manage projects

### Project files

- **Autosave.** Changes save automatically after editing.
- **New projects** are not written until the first edit; the top bar initially shows **Not saved yet: nothing changed**.
- **Rename.** Use the project name field to rename the edit.

| File | Holds | Saved in |
| --- | --- | --- |
| `<stem>-edit.video-project.json` | The editable draft | The project folder |
| `<export-name>.mp4.video-project.json` | A snapshot of the edit that made a whole-timeline export | Beside the export |

- **Draft name.** The stem normally comes from the initial video; projects without one use the project name. Taken names get a number.
- **Snapshot.** Opening the exported video in the editor rebuilds the edit as a new draft.

For example, `scene.mp4` normally produces the draft `scene-edit.video-project.json` and export `scene-edited.mp4`, with snapshot `scene-edited.mp4.video-project.json`.

Drafts appear under **Video projects** above the gallery's media and in the editor's **Projects** tab. They reference media in their folder, so keep the draft and its sources together when moving or sharing a project.

### Save failures and conflicts

Check the save status beside the name before leaving.

| Status | Offers |
| --- | --- |
| **Save failed** | **Retry** |
| **Changed in another window** | **Save as a new draft**, to preserve your version separately |

If saving still fails when you try to leave, the editor offers:

- another save attempt;
- staying in the editor;
- exiting and losing changes since the last successful save.

### Versions, duplicates, and deletion

Use **Project actions** for these commands:

- **Versions...** saves a named version or restores an earlier one as a single undoable edit. Named versions remain until deleted.
- **Automatic checkpoints.** Saving also keeps automatic checkpoints at ten-minute intervals, retaining the newest 30 in the app's database.
- **Duplicate project** saves a copy and continues editing the copy.
- **Delete project...** deletes the draft and closes the editor. Its source media and exported videos remain.

### Missing or changed sources

Files used by the timeline that are missing or have changed in size or modification date appear above the timeline. Nothing is substituted automatically, and export waits until every listed source is resolved.

- **Relink**: choose a replacement of the same media type from the current folder, then click **Relink**.
- **Use the changed file**: accept the current file when its change was intentional.

## Export video

Choose **Export** to render from the source files to a new MP4 in the project folder.

- **File name.** The default filename is `<stem>-edited.mp4`.
- **No overwriting.** If that name or one of its sidecars is taken, a number is added to avoid overwriting it.

### Choose the output

| Setting | Choices |
| --- | --- |
| **File name** | The name before the `.mp4` suffix |
| **Part** | **Whole timeline**, **Marked range**, or **Selected clips** |
| **Size** | **Project size**, **480p**, **720p**, **1080p**, **1440p**, or **2160p** |
| **Shape** | **Landscape**, **Portrait**, or **Square** |
| **Quality** | **Standard**, **High quality**, or **Smaller file** |
| **Sound** | **Limit peaks**, **Normalize**, or **As mixed**; see [Set the sound level](#set-the-sound-level) |
| **Copy initial video's caption** | Off by default |

- **Part.** **Whole timeline** remains the default. **Marked range** and **Selected clips** appear when a range or selection is available.
- **Selected clips** exports the time span from the earliest selected start to the latest selected end, including other visible and audible clips in that interval. Use **Marked range** for exact boundaries.
- **Part file name.** A part defaults to `<stem>-edited-range.mp4` and has no project snapshot or caption.
- **Size.** **Project size** uses the project canvas dimensions. The other sizes set the short side and keep the project's aspect ratio.
- **Shape.** A changed output frame fits the composition without stretching it.
- **Summary.** The summary shows dimensions, frame rate, duration, and an approximate file size.
- **Caption.** When enabled for a whole-timeline export, **Copy initial video's caption** copies the initial video's caption if one exists.

### Set the sound level

| Sound option | Processing |
| --- | --- |
| **Limit peaks** | Holds true peaks at -1 dB so summed clips cannot clip |
| **Normalize** | Applies one gain to bring the whole mix to -14 LUFS, then limits true peaks at -1 dB |
| **As mixed** | Leaves the mix unprocessed |

- **Limit peaks** is the default.
- **As mixed** can clip a loud mix.
- **Report.** A finished export reports measured loudness and true peak, and warns if the sound clips.

### Follow the export

- **Background.** Export keeps running after you return to the gallery.
- **Progress.** Track its progress in the editor's top bar or the gallery, cancel it if needed, and use **Open in gallery** when it finishes.
- **Cancel or failure.** A cancelled or failed export leaves no output files behind.
- **Snapshot.** A whole-timeline export also writes its project snapshot beside the video. This records the edit as exported so later changes to the draft do not change that record.

## Keyboard shortcuts

- **macOS.** Use `⌘` for app shortcuts shown with `Ctrl`.
- **Scope.** Outside form controls, the editor uses its own keys; gallery shortcuts stay off while it is open.
- **Dialogs and menus.** Editor dialogs and menus suspend these shortcuts.

### Playback and navigation

| Shortcut | Action |
| --- | --- |
| `Space` | Play or pause |
| `←` / `→` | Step one frame back / forward |
| `↑` / `↓` | Jump to the previous / next clip edge |
| `Home` / `End` | Go to the start / end |
| `I` / `O` | Mark in / out at the playhead |
| `Esc` | Clear the selection and timeline range |
| `Esc` in Source mode | Clear source marks |
| `M` | Add a marker at the timeline playhead |
| `Shift+↑` / `Shift+↓` | Jump to the previous / next marker |

While **Source** shows a file, `Space`, `←` / `→`, `Home`, `End`, `I`, and `O` act on that file. Clip-edge and marker navigation still use the timeline.

### Tools, selection, and view

| Shortcut | Action |
| --- | --- |
| `V` / `B` / `R` | Select / Blade / Range tool |
| `T` / `N` | Ripple trim / Roll trim tool |
| `S` | Toggle snapping |
| `+` / `-` | Zoom the timeline in / out |
| `Shift+Z` | Fit the project in the timeline |
| `Ctrl+A` | Select every clip |
| `A` | Select clips starting at or after the playhead |
| `Shift+A` | Select forward on the selected clips' tracks |
| `Enter` on a clip | Select it |
| `Shift+Enter` on a clip | Toggle its selection |

### Editing and clipboard

| Shortcut | Action |
| --- | --- |
| `Ctrl+B` | Split at the playhead |
| `Delete` or `Backspace` | Delete the selected clips |
| `Shift+Delete` or `Shift+Backspace` | Ripple delete the marked timeline range |
| `Ctrl+D` | Duplicate the selected clips |
| `,` / `.` | Nudge selected clips one frame earlier / later |
| `Q` / `W` | Trim the start / end to the playhead |
| `Shift+Q` / `Shift+W` | Ripple trim the start / end to the playhead |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / cut / paste clips at the playhead |
| `Ctrl+Shift+V` | Paste attributes onto the selected clips |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
