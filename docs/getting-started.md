# Getting started

[Documentation](README.md)

## Requirements

| Need | Minimum | Notes |
| --- | --- | --- |
| Platform | Windows 10/11, Linux, or macOS; 64-bit dual-core CPU | A quad-core CPU is a practical starting point |
| Memory and disk | About 8 GB RAM and 2 GB disk for the app | Plus space for datasets and the thumbnail cache. 16 GB RAM and an SSD are practical starting points |
| Python | 3.13.x, any final release | Windows setup supplies 3.13.12 |
| Node | `^20.19.0 \|\| ^22.13.0 \|\| >=24`, with npm | Windows setup supplies 24.21.0 |
| FFmpeg | 7.1.x, with `drawtext` and `libmp3lame` | Needed for video and audio work. Windows x64 setup supplies 7.1.1 |
| GPU | None | Model servers, ComfyUI, and AI-Toolkit have their own hardware requirements |

Pillow handles images. Browser playback depends on the browser's codec support.

**FFmpeg selection.** DataForge uses the most-patched 7.1.x it finds, looking in `.ffmpeg/bin` inside the project, on PATH, and in its bundled copy, preferring them in that order on a tie. Other release series are rejected. The bundled copy is 7.1.0, which predates the 7.1 security fixes, so DataForge logs a warning while it is the only one available. CI uses exactly 7.1.5.

For AI jobs, check the chosen model's memory needs, including context and media input. Captioning audio also needs an audio-capable model and server.

## Install and run

Get the project from the [repository](https://github.com/cupraai/dataforge): choose **Code > Download ZIP** and extract it to a writable folder, or clone it with Git. Run the commands below from that project folder.

### Windows

1. Run `setup.bat` once. It installs everything inside the project folder, so no global Python or Node is needed:
   - portable Python 3.13.12 in `.python/` and Node 24 in `.node/`;
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

Setup also installs the optional [tagger](user-guide.md#tags) and its model, a few GB; `./setup.sh --skip-tagging` leaves it out. The first start builds the UI; later starts reuse it unless sources or dependencies changed.

**Choosing a Python.** `.python-version` records 3.13.12, the release CI and Windows setup use. To use it with pyenv, run `pyenv install 3.13.12` and `pyenv local 3.13.12`. To use another installed 3.13.x, run `DATAFORGE_PYTHON=/path/to/python3.13 ./setup.sh`. Setup rebuilds an existing virtual environment that uses another release series or a prerelease.

## Open your first dataset

Browse to a dataset with the breadcrumbs and subfolder cards, or open [`sample_media/`](../sample_media/). It contains captioned and uncaptioned images and videos, a captioned audio clip, flagged captions, a duplicate pair, folder instructions, caption rules, and a ComfyUI result ready for review.

1. Browse the gallery. Filters and statistics show missing captions and review work.
2. Open a file and write a caption. It autosaves as a `.txt` file beside the media.
3. For local quality checks, write **Caption rules** in **Create instructions**, then run **Lint captions**.
4. For AI jobs, [connect a model in Settings](configuration.md#connect-a-vision-model). Auto-caption also needs a **System prompt** in the folder or a parent.
5. Jobs run on the selected files; with no selection, on what the search and filters show; otherwise on the whole folder. Training always uses the whole folder. See [job scope](user-guide.md#scope).
6. Open **Review** for flagged captions, duplicate groups, or staged ComfyUI results.

The [user guide](user-guide.md) explains these workflows. On macOS, use `⌘` instead of `Ctrl` for shortcuts.

## Stop, restart, and update

**Stop** by pressing a key in the launcher window, closing it, or pressing `Ctrl+C`. For a detached server, or one left running after its console closed, run `stop.bat` or `./stop.sh`; stop any supervising launcher first.

**Update** with the app stopped:

- **Git clone:** pull, then start again.
- **ZIP install:** extract a new copy, move over your `.env`, custom presets, and `backend/data/` (settings, history, and cache), and run setup in the new copy. Datasets stay where they are.

The launcher notices dependency changes and rebuilds the UI when needed. Run setup again after a runtime upgrade or when the launcher asks.

### Launcher options

The production launcher serves the built UI and API together, without hot reload. `start.bat` forwards flags to `start.ps1`.

| Windows | Linux and macOS | Effect |
| --- | --- | --- |
| `-Rebuild` | `--rebuild` | Force a UI rebuild |
| `-NoBuild` | `--no-build` | Use the existing build; fails if none exists |
| `-NoBrowser` | `--no-browser` | Do not open a browser |
| `-Detach` | `--detach` | Exit once ready; stop later with `stop.bat` or `./stop.sh` |

Rebuild and no-build cannot be combined. To change the port, set `DATAFORGE_UI_PORT` in `.env` and restart; see [server settings](configuration.md#server-storage-and-logging). For hot reload, see [Development](development.md).

## Troubleshooting

**Setup cannot find Python or Node.** Windows setup downloads both; read the download error it reports. On Linux/macOS, install supported versions and rerun setup, with `DATAFORGE_PYTHON` if needed.

**Python is outside the supported 3.13.x series.** On Windows, run `setup.bat`. On Linux/macOS, install any final 3.13.x release and rerun `./setup.sh`. Other release series and prereleases are rejected, and setup recreates a backend virtual environment built with one.

**Setup cannot find FFmpeg 7.1.x.**

- Install a 7.1.x build, put its binary folder on PATH, and run setup again. A global 8.x, 9.x, or unversioned development build does not count.
- The build must include the `drawtext` filter (libfreetype and libharfbuzz) for watermarking and the `libmp3lame` encoder for MP3 audio edits.
- On Windows x64, setup installs a matching build into `.ffmpeg/`. To repair it, delete that folder and run setup again.
- Check which FFmpeg DataForge selects with `backend/.venv/Scripts/python scripts/check_ffmpeg.py` on Windows or `backend/.venv/bin/python scripts/check_ffmpeg.py` on Linux/macOS.

**Shell scripts will not run.** An extracted ZIP may lose executable permissions; run `bash setup.sh` and `bash start.sh` instead.

**No build with `--no-build`.** Start once without that option, or build with `cd frontend && npm run build` after setup.

**A port is in use.** Close an earlier launcher or stop a leftover DataForge server. The launcher never kills another program's process; choose another `DATAFORGE_UI_PORT` if necessary.

**The app says "Backend unreachable".** The server stopped or never started. Run `start.bat` or `./start.sh` again; the page reconnects by itself once the server answers. If it keeps stopping, read the launcher output.

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

Open `http://localhost:18081`. Rebuild the UI after frontend changes. `Ctrl+C` stops a server started this way.
