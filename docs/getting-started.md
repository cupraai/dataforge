# Getting started

[Documentation](README.md)

- [Requirements](#requirements)
  - [Hardware](#hardware) · [Software](#software) · [FFmpeg selection](#ffmpeg-selection)
- [Install and run](#install-and-run)
  - [Windows](#windows) · [Linux and macOS](#linux-and-macos) · [Launcher options](#launcher-options)
- [Open your first dataset](#open-your-first-dataset)
- [Stop, restart, and update](#stop-restart-and-update)
  - [Stop](#stop) · [Update](#update)
- [Troubleshooting](#troubleshooting)
  - [Setup problems](#setup-problems) · [Startup problems](#startup-problems)
- [Run without the launchers](#run-without-the-launchers)

## Requirements

DataForge runs on Windows 10/11, Linux, or macOS.

### Hardware

| Need | Minimum | Practical starting point |
| --- | --- | --- |
| CPU | 64-bit dual-core | Quad-core |
| Memory | About 8 GB RAM | 16 GB RAM |
| Disk | About 2 GB for the app | An SSD |
| GPU | None | — |

- **Disk.** Add space for datasets and the thumbnail cache.
- **GPU.** Model servers, ComfyUI, and AI-Toolkit have their own hardware requirements.
- **AI jobs.** Check the chosen model's memory needs, including context and media input.
- **Audio captioning.** Needs an audio-capable model and server.

### Software

| Need | Minimum | Windows setup supplies | CI uses |
| --- | --- | --- | --- |
| Python | 3.13.x, any final release | 3.13.12 | 3.13.12 |
| Node | 26.x LTS, with npm | The release pinned in [`.node-version`](../.node-version) | The release pinned in [`.node-version`](../.node-version) |
| FFmpeg | 7.1.x | 7.1.1 | Exactly 7.1.5 |

- **FFmpeg** is needed for video and audio work. The build must include `drawtext`, `libmp3lame`, `libvorbis`, and `libopus`.
- **Windows setup** supplies FFmpeg on x64 only.
- **Images** are handled by Pillow.
- **Browser playback** depends on the browser's codec support.

### FFmpeg selection

DataForge uses the most-patched 7.1.x it finds.

- **Where it looks.** In `.ffmpeg/bin` inside the project, on PATH, and in its bundled copy. On a tie, it prefers them in that order.
- **Other release series** are rejected.
- **Bundled copy.** It is 7.1.0, which predates the 7.1 security fixes, so DataForge logs a warning while it is the only one available.

## Install and run

Get the project from the [repository](https://github.com/cupraai/dataforge) in one of two ways:

- choose **Code > Download ZIP** and extract it to a writable folder, or
- clone it with Git.

Run the commands below from that project folder.

### Windows

1. Run `setup.bat` once. It installs everything inside the project folder, so no global Python or Node is needed:
   - portable Python 3.13.12 in `.python/` and Node 26 LTS in `.node/`;
   - on x64, a checksum-verified FFmpeg 7.1.1 in `.ffmpeg/`;
   - the backend virtual environment `backend/.venv`, all dependencies, and the generated frontend API files;
   - the optional [tagger](user-guide.md#tags) for your GPU and its model, a few GB. Use `setup.bat -SkipTagging` to leave it out.
2. Run `start.bat`. It builds the UI when needed, starts the server, and opens `http://localhost:18081`.

Keep the launcher window open while you use the app.

### Linux and macOS

1. Install Python 3.13.x, FFmpeg 7.1.x (on PATH), and a supported Node version with npm; see [Requirements](#requirements).
2. From the project folder, run:

   ```bash
   ./setup.sh
   ./start.sh
   ```

- **Tagger.** Setup also installs the optional [tagger](user-guide.md#tags) and its model, a few GB; `./setup.sh --skip-tagging` leaves it out.
- **UI build.** The first start builds the UI; later starts reuse it unless sources or dependencies changed.

**Choosing a Python.** `.python-version` records 3.13.12, the release CI and Windows setup use.

- **With pyenv:** run `pyenv install 3.13.12` and `pyenv local 3.13.12`.
- **Another installed 3.13.x:** run `DATAFORGE_PYTHON=/path/to/python3.13 ./setup.sh`.
- **Existing virtual environment.** Setup rebuilds one that uses another release series or a prerelease.

### Launcher options

The production launcher serves the built UI and API together, without hot reload. `start.bat` forwards flags to `start.ps1`.

| Windows | Linux and macOS | Effect |
| --- | --- | --- |
| `-Rebuild` | `--rebuild` | Force a UI rebuild |
| `-NoBuild` | `--no-build` | Use the existing build |
| `-NoBrowser` | `--no-browser` | Do not open a browser |
| `-Detach` | `--detach` | Exit once ready |

- **No build** fails if no build exists.
- **Rebuild and no-build** cannot be combined.
- **Detach.** Stop the server later with `stop.bat` or `./stop.sh`.
- **Port.** To change it, set `DATAFORGE_UI_PORT` in `.env` and restart; see [server settings](configuration.md#server-storage-and-logging).
- **Hot reload.** See [Development](development.md).

## Open your first dataset

Browse to a dataset with the breadcrumbs and subfolder cards, or open [`sample_media/`](../sample_media/). It contains:

- captioned and uncaptioned images and videos;
- a captioned audio clip;
- flagged captions and a duplicate pair;
- folder instructions and caption rules;
- a ComfyUI result ready for review.

Then:

1. Browse the gallery. Filters and statistics show missing captions and review work.
2. Open a file and write a caption. It autosaves as a `.txt` file beside the media.
3. For local quality checks, write **Caption rules** in **Create instructions**, then run **Lint captions**.
4. To use **Auto-caption**, **Edit captions**, or **Verify captions** from **Tools**, [connect a model in Settings](configuration.md#connect-a-vision-model). Auto-caption uses a **System prompt** from the folder or a parent.
5. Open **Review** for flagged captions, duplicate groups, or staged ComfyUI results.

**Which files a job uses.** See [job scope](user-guide.md#scope).

- **Selected files**, when there is a selection.
- **What the search and filters show**, with no selection.
- **The whole folder** otherwise.
- **Training** always uses the whole folder.

The [user guide](user-guide.md) explains these workflows. On macOS, use `⌘` instead of `Ctrl` for shortcuts.

## Stop, restart, and update

### Stop

- **From the launcher.** Press a key in the launcher window, close it, or press `Ctrl+C`.
- **Detached or leftover server.** For a detached server, or one left running after its console closed, run `stop.bat` or `./stop.sh`. Stop any supervising launcher first.

### Update

Update with the app stopped.

**Git clone.** Run `update.bat` on Windows or `./update.sh` on Linux and macOS, then start again.

- **Needs** [Git](https://git-scm.com/downloads) on PATH.
- **Pulls** the latest version of the current branch.
- **Reruns setup** when the update changed a runtime or backend dependency. That setup leaves out the tagger unless it is already installed.
- **Stops without changing anything** on local commits, or on local edits the update would overwrite.

**ZIP install.**

1. Extract a new copy.
2. Move over your `.env`, custom presets, and `backend/data/` (settings, history, and cache).
3. Run setup in the new copy.

Datasets stay where they are.

**After updating.** The launcher notices dependency changes and rebuilds the UI when needed. Run setup again after a runtime upgrade or when the launcher asks.

## Troubleshooting

### Setup problems

**Setup cannot find Python or Node.**

- **Windows:** setup downloads both; read the download error it reports.
- **Linux/macOS:** install supported versions and rerun setup, with `DATAFORGE_PYTHON` if needed.

**Python is outside the supported 3.13.x series.**

- **Windows:** run `setup.bat`.
- **Linux/macOS:** install any final 3.13.x release and rerun `./setup.sh`.
- **Rejected versions.** Other release series and prereleases are rejected, and setup recreates a backend virtual environment built with one.

**Setup cannot find FFmpeg 7.1.x.**

- Install a 7.1.x build, put its binary folder on PATH, and run setup again. A global 8.x, 9.x, or unversioned development build does not count.
- The build must include the `drawtext` filter (libfreetype and libharfbuzz) for watermarking and the `libmp3lame`, `libvorbis`, and `libopus` encoders for MP3, OGG, and Opus audio edits.
- On Windows x64, setup installs a matching build into `.ffmpeg/`. To repair it, delete that folder and run setup again.
- Check which FFmpeg DataForge selects with `backend/.venv/Scripts/python scripts/check_ffmpeg.py` on Windows or `backend/.venv/bin/python scripts/check_ffmpeg.py` on Linux/macOS.

**Setup refuses the folder on Windows.** npm's Windows scripts cannot run from a path containing `&` or `^`. Move DataForge to a folder without them; spaces are fine.

**The backend venv does not start.** The folder was moved or renamed after setup, or the Python it was built with is gone. Run setup again; it rebuilds the venv.

**Shell scripts will not run.** An extracted ZIP may lose executable permissions; run `bash setup.sh` and `bash start.sh` instead.

### Startup problems

**No build with `--no-build`.** Start once without that option, or build with `cd frontend && npm run build` after setup.

**A port is in use.**

- Close an earlier launcher or stop a leftover DataForge server.
- The launchers and the stop script only stop a DataForge server started from this folder, never another program or another copy of DataForge.
- If necessary, choose another `DATAFORGE_API_PORT` or `DATAFORGE_UI_PORT`.

**The app says "Backend unreachable".** The server stopped or never started.

- Run `start.bat` or `./start.sh` again; the page reconnects by itself once the server answers.
- If it keeps stopping, read the launcher output.

**The server never becomes ready.** Read the server output for incomplete setup, a missing build, or a port conflict, and fix the reported problem before restarting. For problems after startup, see [configuration troubleshooting](configuration.md#troubleshooting).

## Run without the launchers

Install supported Python and Node versions yourself, then run from the project root.

Linux/macOS:

```bash
python3.13 -m venv backend/.venv
backend/.venv/bin/python scripts/py_version.py
backend/.venv/bin/python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
backend/.venv/bin/python scripts/check_ffmpeg.py
cd frontend && npm ci && cd ..
backend/.venv/bin/python scripts/generate_types.py
cd frontend && npm run build && cd ..
backend/.venv/bin/python scripts/prod_server.py
```

Windows, with Python 3.13.x on PATH:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python scripts/py_version.py
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
backend/.venv/Scripts/python scripts/check_ffmpeg.py
cd frontend; npm ci; cd ..
backend/.venv/Scripts/python scripts/generate_types.py
cd frontend; npm run build; cd ..
backend/.venv/Scripts/python scripts/prod_server.py
```

- **Open** `http://localhost:18081`.
- **Rebuild the UI** after frontend changes.
- **Stop** a server started this way with `Ctrl+C`.
