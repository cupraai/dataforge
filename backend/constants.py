from typing import Final, TypedDict

# Written back in their own format.
NATIVE_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
# Browsers decode none of these; `/media` serves a WebP rendition.
DISPLAY_RENDITION_EXTENSIONS = {".heic", ".tif", ".tiff"}
# Everything Pillow reads as a still.
IMAGE_EXTENSIONS = NATIVE_IMAGE_EXTENSIONS | DISPLAY_RENDITION_EXTENSIONS | {".avif"}
GIF_EXTENSION = ".gif"
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".wmv", ".m4v", ".flv", ".webm"}

# GIF is still for decode/caption and motion for frames/LoRA.
PILLOW_EXTENSIONS = IMAGE_EXTENSIONS | {GIF_EXTENSION}
MOTION_EXTENSIONS = VIDEO_EXTENSIONS | {GIF_EXTENSION}

MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | MOTION_EXTENSIONS

AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".opus", ".aac"}

# Pickled checkpoints stay out: reading one runs code.
MODEL_EXTENSIONS = {".safetensors"}

# Jobs list MEDIA_EXTENSIONS, so audio is captioned by hand.
CAPTIONED_EXTENSIONS = MEDIA_EXTENSIONS | AUDIO_EXTENSIONS

GALLERY_EXTENSIONS = CAPTIONED_EXTENSIONS | MODEL_EXTENSIONS

# The safetensors library refuses longer headers.
SAFETENSORS_MAX_HEADER_BYTES = 100_000_000

# Header readers only; ffmpeg accepts more.
ISOBMFF_EXTENSIONS = {".mp4", ".mov", ".m4v"}

COMFY_WORKFLOW_EXTENSIONS = {".png"} | ISOBMFF_EXTENSIONS

# `-movflags`/`-c:a copy` only work on the MP4 family.
WATERMARK_EXTENSIONS = NATIVE_IMAGE_EXTENSIONS | ISOBMFF_EXTENSIONS | {GIF_EXTENSION}

# Browser-decodable; all accept `-movflags`.
VIDEO_EDIT_EXTENSIONS = ISOBMFF_EXTENSIONS
VIDEO_EDIT_MUXERS = {".mp4": "mp4", ".m4v": "mp4", ".mov": "mov"}

# Edited in place, so each keeps its own format; `.aac` is raw ADTS, `ipod` writes M4A.
AUDIO_EDIT_MUXERS = {
    ".wav": "wav",
    ".mp3": "mp3",
    ".flac": "flac",
    ".aac": "adts",
    ".m4a": "ipod",
    ".ogg": "ogg",
    ".opus": "ogg",
}
# The rest drop an embedded cover on edit.
AUDIO_COVER_MUXERS = {"mp3", "flac", "ipod"}

# Shared with the browser's BiquadFilterNode so preview and render agree.
AUDIO_EQ_BASS_HZ = 120.0
AUDIO_EQ_MID_HZ = 1000.0
AUDIO_EQ_TREBLE_HZ = 6000.0
AUDIO_EQ_MID_Q = 1.0
AUDIO_EQ_MAX_DB = 12.0
AUDIO_LOW_CUT_MIN_HZ = 20.0
AUDIO_LOW_CUT_MAX_HZ = 500.0
AUDIO_HIGH_CUT_MIN_HZ = 2000.0
AUDIO_HIGH_CUT_MAX_HZ = 20000.0
# afftdn's reduction in dB; more sounds underwater.
AUDIO_NOISE_REDUCTION_MAX_DB = 30.0
AUDIO_PITCH_MAX_SEMITONES = 12

# GIF stays out of the multi-track editor.
VIDEO_PROJECT_VIDEO_EXTENSIONS = ISOBMFF_EXTENSIONS
VIDEO_PROJECT_IMAGE_EXTENSIONS = NATIVE_IMAGE_EXTENSIONS
VIDEO_PROJECT_AUDIO_EXTENSIONS = set(AUDIO_EDIT_MUXERS)
VIDEO_PROJECT_SOURCE_EXTENSIONS = (
    VIDEO_PROJECT_VIDEO_EXTENSIONS | VIDEO_PROJECT_IMAGE_EXTENSIONS | VIDEO_PROJECT_AUDIO_EXTENSIONS
)

# A draft is `<stem>-edit<suffix>`; an export snapshot is `<name>.mp4<suffix>`.
VIDEO_PROJECT_SUFFIX = ".video-project.json"
VIDEO_PROJECT_DRAFT_TAG = "-edit"
VIDEO_PROJECT_EXPORT_TAG = "-edited"
VIDEO_PROJECT_EXPORT_EXTENSION = ".mp4"
VIDEO_PROJECT_FORMAT_VERSION = 1

# Must not end in a media suffix or `folder_scan` lists it.
VIDEO_PROJECT_EXPORT_TEMP_SUFFIX = ".export-tmp"

# Shorter clips cannot hold one frame at the slowest rate.
VIDEO_PROJECT_MIN_CLIP_SECONDS = 0.04
# Well under one frame at any rate.
VIDEO_PROJECT_TIME_EPSILON = 1e-4
VIDEO_PROJECT_MAX_TRACKS = 16
# A still's default length on the timeline.
VIDEO_PROJECT_STILL_SECONDS = 5.0
# The first video added names it.
VIDEO_PROJECT_UNTITLED_NAME = "Untitled project"
# A playable H.264 copy: `<stem>-h264.mp4`.
VIDEO_PROJECT_COMPATIBLE_TAG = "-h264"
# -1 dBTP leaves room for lossy encoders; -14 LUFS is the streaming norm.
VIDEO_PROJECT_TRUE_PEAK_CEILING_DB = -1.0
VIDEO_PROJECT_LOUDNESS_TARGET_LUFS = -14.0
# Automatic checkpoints: at most this often, newest few kept.
VIDEO_PROJECT_CHECKPOINT_SECONDS = 600
VIDEO_PROJECT_MAX_CHECKPOINTS = 30
# Ducking ramps the other tracks down over this before and after speech.
VIDEO_PROJECT_DUCK_RAMP_SECONDS = 0.3
VIDEO_PROJECT_MAX_KEYFRAMES = 200


class VideoExportQuality(TypedDict):
    crf: int
    preset: str
    audio_kbps: int
    #: The export size estimate at 1080p; real output varies several times over.
    bits_per_pixel: float


#: x264 rate factor and speed, AAC bitrate.
VIDEO_PROJECT_QUALITY_PRESETS: dict[str, VideoExportQuality] = {
    "standard": {"crf": 20, "preset": "fast", "audio_kbps": 192, "bits_per_pixel": 0.08},
    "high": {"crf": 16, "preset": "slow", "audio_kbps": 256, "bits_per_pixel": 0.13},
    "small": {"crf": 27, "preset": "medium", "audio_kbps": 128, "bits_per_pixel": 0.03},
}

#: The frame's short side; the long side keeps the project's aspect.
VIDEO_PROJECT_SIZE_PRESET_SHORT_SIDES: dict[str, int] = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
    "1440p": 1440,
    "2160p": 2160,
}

# GIF delays are per-frame; 24 matches the rest of the video tooling.
GIF_MP4_FRAME_RATE = 24.0
GIF_MP4_EXTENSION = ".mp4"

# The confidence setting cannot go lower.
TAG_SCORE_FLOOR = 0.1

# GIF excluded: a Pillow round-trip flattens the animation.
IMAGE_EDIT_EXTENSIONS = NATIVE_IMAGE_EXTENSIONS

# On the whole filename, so `clip.mp4` and `clip.mov` keep distinct backups.
EDIT_BACKUP_SUFFIX = ".bak"

# Two suffixes deep; use `edit_sidecars.edit_spec_path`, not `with_suffix`.
EDIT_SIDECAR_SUFFIX = ".edit.json"

# Must not end in a media suffix or `folder_scan` lists it.
EDIT_TEMP_SUFFIX = ".edit-tmp"
EDIT_STALE_SUFFIX = ".edit-stale"

# Generative fill pixels, one archive per whole filename.
FILL_ASSETS_SUFFIX = ".fills"

#: Each fill was generated from the original plus every fill before it.
MAX_IMAGE_FILLS = 16

MAX_FILL_INSTRUCTION_LENGTH = 1000

# Windows `mimetypes.guess_type` can fall back to `text/plain`.
MEDIA_MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".avif": "image/avif",
    ".heic": "image/heic",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".webm": "video/webm",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".safetensors": "application/octet-stream",
}

# Leftover Ideogram .json is not a caption.
CAPTION_SIDECAR_EXTENSIONS = (".txt",)
SIDECAR_EXTENSIONS = set(CAPTION_SIDECAR_EXTENSIONS)
# Model weights run to many GB.
IMPORT_EXTENSIONS = CAPTIONED_EXTENSIONS | SIDECAR_EXTENSIONS

# Two suffixes deep.
ISSUE_SIDECAR_SUFFIX = ".issue.json"

# Own file, so neither resolver clears the other's findings.
DUPLICATE_SIDECAR_SUFFIX = ".duplicate.json"

# The prompt states this cap.
MAX_ISSUE_FIXES = 3

MAX_RULE_FINDINGS = 5

# Models often answer "None" instead of an empty list.
ISSUE_FIX_SENTINELS = frozenset({"none", "n/a", "no issues", "no changes"})

CAPTION_BACKUP_DIR_NAME = ".backup"

# A caption write waits this long for another write to the same file instead of failing.
CAPTION_CLAIM_WAIT_SECONDS = 2.0

# Absent from SKIP_DIR_NAMES: the user browses these.
WATERMARK_DIR_NAME = "watermarked"

# The review queue pairs candidates with sources by name.
STAGING_DIR_NAME = "staging"

# A candidate pairs by stem and keeps its own format on accept.
COMFY_CANDIDATE_SUFFIX = ".png"

# Order decides which staged file a source claims.
COMFY_CANDIDATE_SUFFIXES = (COMFY_CANDIDATE_SUFFIX, ".mp4", ".mov", GIF_EXTENSION)

# Two suffixes deep.
COMFY_CANDIDATE_SIDECAR_SUFFIX = ".comfy.json"

# Not EDIT_ markers: image_edit sweeps every *.edit-tmp.
COMFY_TEMP_SUFFIX = ".comfy-tmp"
COMFY_STALE_SUFFIX = ".comfy-stale"

# Staging only checks a candidate clip's first frame.
COMFY_ACCEPT_DECODE_TIMEOUT_SECONDS = 300

# A file the loader refuses fails with ComfyUI's own error.
COMFY_PROCESS_EXTENSIONS = MEDIA_EXTENSIONS

# Any media file can hold a candidate, so settle endpoints gate on this.
CANDIDATE_SOURCE_EXTENSIONS = MEDIA_EXTENSIONS

SKIP_DIR_NAMES = {
    CAPTION_BACKUP_DIR_NAME,
    ".git",
    "node_modules",
    "__pycache__",
    "$RECYCLE.BIN",
    "$Recycle.Bin",
    # The Linux and macOS trashes at a volume's top.
    ".Trash",
    ".Trashes",
    "$WINDOWS.~BT",
    "$Windows.~WS",
    "System Volume Information",
    ".venv",
    "venv",
    "_latent_cache",
    "_t_e_cache",
}
#: A Linux volume's own trash is `.Trash-<uid>`.
SKIP_DIR_PREFIXES = (".Trash-",)

#: Where macOS and Linux attach volumes; the path bar's drive menu lists what is mounted inside.
POSIX_VOLUME_PARENTS: Final = {"darwin": ("/Volumes",), "linux": ("/media", "/run/media", "/mnt")}

LAST_FOLDER_KEY = "last_folder"

SYSPROMPT_FILENAME = ".sysprompt"

CAPTION_RULES_FILENAME = ".captionrules"

#: Never inherited, unlike instructions.
NOTE_FILENAME = ".note"

CAPTION_EDIT_PREVIEW_LIMIT = 3

# A pattern can backtrack for minutes; jobs only check cancel between files.
CAPTION_REGEX_TIMEOUT_SECONDS = 1.0

#: Shared so the UI and job notifications cannot drift apart.
JOB_TYPE_LABELS: dict[str, str] = {
    "auto_caption": "Auto-caption",
    "set_captions": "Set captions",
    "verify_captions": "Verify captions",
    "check_caption_rules": "Lint captions",
    "edit_captions": "Edit captions",
    "replace_captions": "Find & replace",
    "train_lora": "LoRA training",
    "batch_rename": "Rename",
    "strip_metadata": "Strip metadata",
    "find_duplicates": "Find duplicates",
    "backup_captions": "Backup captions",
    "restore_captions": "Restore captions",
    "watermark": "Watermark",
    "auto_adjust": "Auto-adjust",
    "resize": "Resize",
    "split_video": "Split into clips",
    "trim_video": "Trim to length",
    "comfy_run": "Run ComfyUI workflow",
    "comfy_showcase": "LoRA showcase",
}

#: Tones and colors span ±1, detail tools 0..1, hue is degrees.
ADJUST_MAX_HUE = 180.0

#: ``color_adjust`` curve constants; the TS port reads the same numbers.
COLOR_ADJUST: dict[str, float] = {
    "exposure_stops": 2.0,
    "warmth_gain": 0.35,
    "tint_gain": 0.25,
    # Above 4 (lift) or 1 (crush) the curves stop being monotonic.
    "shadow_lift": 2.0,
    "shadow_crush": 0.8,
    "highlight_recover": 2.0,
    "highlight_lift": 0.8,
    "brightness_gain": 0.9,
    "black_point_level": 0.2,
    "black_point_lift": 0.15,
    "white_point_level": 0.2,
    "white_point_dim": 0.15,
    "brilliance_shadows": 0.6,
    "brilliance_highlights": 0.6,
    "brilliance_contrast": 0.25,
    "tone_chroma_cap": 4.0,
}

#: Self-guided filter; local-contrast boost on luma.
COLOR_DETAIL: dict[str, float] = {
    "noise_luma_radius": 2,
    "noise_luma_std": 0.06,
    "noise_chroma_radius": 4,
    "noise_chroma_std": 0.12,
    "definition_short_side": 256,
    "definition_sigma": 3.84,
    "definition_gain": 1.2,
    "definition_knee": 0.15,
}

ADJUST_PREVIEW_LUT_SIZE = 33
#: Pillow's Color3DLUT stops at 65.
ADJUST_RENDER_LUT_SIZE = 65

#: Applies the reading once; the far end applies it twice.
AUTO_ADJUST_DEFAULT_AMOUNT = 0.5

#: One "MP" is 1024², as in ComfyUI's resolution nodes.
MEGAPIXEL = 1024 * 1024
DEFAULT_RESIZE_MEGAPIXELS = 2.0
DEFAULT_RESIZE_MULTIPLE = 32
MAX_RESIZE_MEGAPIXELS = 64.0
MAX_RESIZE_MULTIPLE = 256

CLIPS_DIR_NAME = "clips"
#: Mirrored by ``VideoFrameRate`` in schemas.
VIDEO_FRAME_RATES = (16, 24, 25, 30)
DEFAULT_SPLIT_INTERVAL_SECONDS = 5.0
DEFAULT_SPLIT_LONGEST_SECONDS = 5.0
DEFAULT_SPLIT_SHORTEST_SECONDS = 1.0
MIN_SPLIT_CLIP_SECONDS = 0.5
MAX_SPLIT_CLIP_SECONDS = 600.0
#: Seconds of played length.
DEFAULT_TRIM_LENGTH_SECONDS = 5.0
MIN_TRIM_LENGTH_SECONDS = 0.5
MAX_TRIM_LENGTH_SECONDS = 3600.0
DEFAULT_COMFY_GENERATE_COUNT = 1
MAX_COMFY_GENERATE_COUNT = 100
#: Files are named ``<prefix>_0001``, so the prefix stays short.
MAX_COMFY_GENERATE_PREFIX_LENGTH = 80

MAX_SHOWCASE_ITEMS = 50
#: Above one, every item renders once per LoRA: a checkpoint comparison.
MAX_SHOWCASE_SUBJECT_LORAS = 8
MAX_SHOWCASE_ITEM_LORAS = 8
#: Items times the LoRAs compared.
MAX_SHOWCASE_GENERATIONS = 200
MAX_SHOWCASE_LABEL_LENGTH = 80
MAX_SHOWCASE_SETS = 50
MAX_SHOWCASE_SET_NAME_LENGTH = 80
#: ComfyUI's own LoRA loader accepts -100..100; nothing useful lies past this.
LORA_STRENGTH_LIMIT = 10.0

MAX_SHEET_CELLS = 64
#: The long side of one cell.
MAX_SHEET_CELL_SIDE = 1024
MAX_SHEET_IMAGE_SIDE = 8192
MAX_SHEET_VIDEO_SIDE = 3840
MAX_SHEET_SECONDS = 120
MAX_SHEET_FPS = 30

MAX_SAVED_SNIPPETS = 100
MAX_SAVED_SNIPPET_NAME_LENGTH = 80
MAX_SAVED_SNIPPET_TEXT_LENGTH = 8000

MAX_WORKFLOWS = 50
MAX_WORKFLOW_STEPS = 12
MAX_WORKFLOW_NAME_LENGTH = 80

#: The newest files are the ones being worked on.
DEFAULT_GALLERY_SORT: Final = "date-desc"

DEFAULT_GALLERY_CARD_ACTIONS: Final = ("open", "copy_caption", "delete")

# Blended over the manual grade in the LUT.
STYLE_PRESETS: dict[str, dict[str, float]] = {
    "vivid": {"vibrance": 0.55, "contrast": 0.32, "brilliance": 0.24},
    "golden": {"warmth": 0.78, "tint": 0.14, "shadows": 0.28, "highlights": -0.24},
    "arctic": {"warmth": -0.74, "contrast": 0.28, "saturation": -0.18},
    "glacier": {
        "warmth": -1.0,
        "tint": -0.46,
        "shadows": 0.34,
        "brilliance": 0.25,
        "highlights": -0.2,
    },
    "blue_hour": {
        "warmth": -1.0,
        "tint": 0.24,
        "exposure": -0.2,
        "contrast": 0.4,
        "vibrance": 0.32,
    },
    "moonlight": {
        "warmth": -0.72,
        "tint": 0.82,
        "saturation": -0.25,
        "black_point": -0.32,
        "highlights": -0.32,
    },
    "faded": {"black_point": -0.72, "white_point": -0.3, "saturation": -0.32, "warmth": 0.2},
    "cinema": {"contrast": 0.68, "black_point": 0.24, "saturation": -0.36, "warmth": -0.22},
    "noir": {"saturation": -1.0, "contrast": 0.72, "black_point": 0.2},
}

# Additive sRGB casts peak in the midtones.
STYLE_TINTS: dict[str, tuple[float, float, float]] = {
    "glacier": (-0.06, 0.025, 0.1),
    "blue_hour": (-0.11, 0.015, 0.15),
    "moonlight": (-0.035, -0.025, 0.13),
}

#: Emitted into ``frontend/src/shared/constants.ts``.
SHARED_CONSTANTS: dict[str, object] = {
    "IMPORT_EXTENSIONS": sorted(IMPORT_EXTENSIONS),
    "CAPTION_SIDECAR_EXTENSIONS": list(CAPTION_SIDECAR_EXTENSIONS),
    "SYSPROMPT_FILENAME": SYSPROMPT_FILENAME,
    "CAPTION_RULES_FILENAME": CAPTION_RULES_FILENAME,
    "CAPTION_EDIT_PREVIEW_LIMIT": CAPTION_EDIT_PREVIEW_LIMIT,
    "CAPTION_BACKUP_DIR_NAME": CAPTION_BACKUP_DIR_NAME,
    "VIDEO_EXTENSIONS": sorted(VIDEO_EXTENSIONS),
    "VIDEO_EDIT_EXTENSIONS": sorted(VIDEO_EDIT_EXTENSIONS),
    "AUDIO_EXTENSIONS": sorted(AUDIO_EXTENSIONS),
    "AUDIO_EDIT_EXTENSIONS": sorted(AUDIO_EDIT_MUXERS),
    "MODEL_EXTENSIONS": sorted(MODEL_EXTENSIONS),
    "AUDIO_EQ_BASS_HZ": AUDIO_EQ_BASS_HZ,
    "AUDIO_EQ_MID_HZ": AUDIO_EQ_MID_HZ,
    "AUDIO_EQ_TREBLE_HZ": AUDIO_EQ_TREBLE_HZ,
    "AUDIO_EQ_MID_Q": AUDIO_EQ_MID_Q,
    "AUDIO_EQ_MAX_DB": AUDIO_EQ_MAX_DB,
    "AUDIO_LOW_CUT_MIN_HZ": AUDIO_LOW_CUT_MIN_HZ,
    "AUDIO_LOW_CUT_MAX_HZ": AUDIO_LOW_CUT_MAX_HZ,
    "AUDIO_HIGH_CUT_MIN_HZ": AUDIO_HIGH_CUT_MIN_HZ,
    "AUDIO_HIGH_CUT_MAX_HZ": AUDIO_HIGH_CUT_MAX_HZ,
    "AUDIO_PITCH_MAX_SEMITONES": AUDIO_PITCH_MAX_SEMITONES,
    "VIDEO_PROJECT_VIDEO_EXTENSIONS": sorted(VIDEO_PROJECT_VIDEO_EXTENSIONS),
    "VIDEO_PROJECT_IMAGE_EXTENSIONS": sorted(VIDEO_PROJECT_IMAGE_EXTENSIONS),
    "VIDEO_PROJECT_AUDIO_EXTENSIONS": sorted(VIDEO_PROJECT_AUDIO_EXTENSIONS),
    "VIDEO_PROJECT_EXPORT_EXTENSION": VIDEO_PROJECT_EXPORT_EXTENSION,
    "VIDEO_PROJECT_EXPORT_TAG": VIDEO_PROJECT_EXPORT_TAG,
    "VIDEO_PROJECT_MIN_CLIP_SECONDS": VIDEO_PROJECT_MIN_CLIP_SECONDS,
    "VIDEO_PROJECT_TIME_EPSILON": VIDEO_PROJECT_TIME_EPSILON,
    "VIDEO_PROJECT_MAX_TRACKS": VIDEO_PROJECT_MAX_TRACKS,
    "VIDEO_PROJECT_STILL_SECONDS": VIDEO_PROJECT_STILL_SECONDS,
    "VIDEO_PROJECT_UNTITLED_NAME": VIDEO_PROJECT_UNTITLED_NAME,
    "VIDEO_PROJECT_QUALITY_PRESETS": VIDEO_PROJECT_QUALITY_PRESETS,
    "VIDEO_PROJECT_SIZE_PRESET_SHORT_SIDES": VIDEO_PROJECT_SIZE_PRESET_SHORT_SIDES,
    "VIDEO_PROJECT_TRUE_PEAK_CEILING_DB": VIDEO_PROJECT_TRUE_PEAK_CEILING_DB,
    "VIDEO_PROJECT_LOUDNESS_TARGET_LUFS": VIDEO_PROJECT_LOUDNESS_TARGET_LUFS,
    "VIDEO_PROJECT_DUCK_RAMP_SECONDS": VIDEO_PROJECT_DUCK_RAMP_SECONDS,
    "VIDEO_PROJECT_MAX_KEYFRAMES": VIDEO_PROJECT_MAX_KEYFRAMES,
    "IMAGE_EDIT_EXTENSIONS": sorted(IMAGE_EDIT_EXTENSIONS),
    "MAX_IMAGE_FILLS": MAX_IMAGE_FILLS,
    "MAX_FILL_INSTRUCTION_LENGTH": MAX_FILL_INSTRUCTION_LENGTH,
    "GIF_EXTENSION": GIF_EXTENSION,
    "GIF_MP4_FRAME_RATE": GIF_MP4_FRAME_RATE,
    "COMFY_WORKFLOW_EXTENSIONS": sorted(COMFY_WORKFLOW_EXTENSIONS),
    "STAGING_DIR_NAME": STAGING_DIR_NAME,
    "POSIX_VOLUME_PARENTS": sorted(
        {path for paths in POSIX_VOLUME_PARENTS.values() for path in paths}
    ),
    "JOB_TYPE_LABELS": JOB_TYPE_LABELS,
    "ADJUST_MAX_HUE": ADJUST_MAX_HUE,
    "COLOR_ADJUST": COLOR_ADJUST,
    "STYLE_PRESETS": STYLE_PRESETS,
    "STYLE_TINTS": STYLE_TINTS,
    "COLOR_DETAIL": COLOR_DETAIL,
    "ADJUST_PREVIEW_LUT_SIZE": ADJUST_PREVIEW_LUT_SIZE,
    "AUTO_ADJUST_DEFAULT_AMOUNT": AUTO_ADJUST_DEFAULT_AMOUNT,
    "DEFAULT_GALLERY_SORT": DEFAULT_GALLERY_SORT,
    "DEFAULT_GALLERY_CARD_ACTIONS": list(DEFAULT_GALLERY_CARD_ACTIONS),
    "MEGAPIXEL": MEGAPIXEL,
    "MAX_RESIZE_MEGAPIXELS": MAX_RESIZE_MEGAPIXELS,
    "MAX_RESIZE_MULTIPLE": MAX_RESIZE_MULTIPLE,
    "CLIPS_DIR_NAME": CLIPS_DIR_NAME,
    "VIDEO_FRAME_RATES": list(VIDEO_FRAME_RATES),
    "MIN_SPLIT_CLIP_SECONDS": MIN_SPLIT_CLIP_SECONDS,
    "MAX_SPLIT_CLIP_SECONDS": MAX_SPLIT_CLIP_SECONDS,
    "MIN_TRIM_LENGTH_SECONDS": MIN_TRIM_LENGTH_SECONDS,
    "MAX_TRIM_LENGTH_SECONDS": MAX_TRIM_LENGTH_SECONDS,
    "DEFAULT_COMFY_GENERATE_COUNT": DEFAULT_COMFY_GENERATE_COUNT,
    "MAX_COMFY_GENERATE_COUNT": MAX_COMFY_GENERATE_COUNT,
    "MAX_COMFY_GENERATE_PREFIX_LENGTH": MAX_COMFY_GENERATE_PREFIX_LENGTH,
    "MAX_SHOWCASE_ITEMS": MAX_SHOWCASE_ITEMS,
    "MAX_SHOWCASE_SUBJECT_LORAS": MAX_SHOWCASE_SUBJECT_LORAS,
    "MAX_SHOWCASE_ITEM_LORAS": MAX_SHOWCASE_ITEM_LORAS,
    "MAX_SHOWCASE_LABEL_LENGTH": MAX_SHOWCASE_LABEL_LENGTH,
    "MAX_SHOWCASE_SET_NAME_LENGTH": MAX_SHOWCASE_SET_NAME_LENGTH,
    "LORA_STRENGTH_LIMIT": LORA_STRENGTH_LIMIT,
    "MAX_SAVED_SNIPPETS": MAX_SAVED_SNIPPETS,
    "MAX_SAVED_SNIPPET_NAME_LENGTH": MAX_SAVED_SNIPPET_NAME_LENGTH,
    "MAX_SAVED_SNIPPET_TEXT_LENGTH": MAX_SAVED_SNIPPET_TEXT_LENGTH,
    "MAX_WORKFLOWS": MAX_WORKFLOWS,
    "MAX_WORKFLOW_STEPS": MAX_WORKFLOW_STEPS,
    "MAX_WORKFLOW_NAME_LENGTH": MAX_WORKFLOW_NAME_LENGTH,
}
