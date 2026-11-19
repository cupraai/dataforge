"""Caption sidecars: one reader, and one writer that only replaces the revision it read."""

import hashlib
import json
import os
import re
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Literal, NamedTuple

from api_errors import ConflictError
from caption_cache import cached_by_stat
from constants import (
    CAPTION_BACKUP_DIR_NAME,
    CAPTION_CLAIM_WAIT_SECONDS,
    CAPTION_SIDECAR_EXTENSIONS,
    ISSUE_FIX_SENTINELS,
    ISSUE_SIDECAR_SUFFIX,
    MAX_ISSUE_FIXES,
    MAX_RULE_FINDINGS,
)
from file_write import write_bytes_atomic, write_text_atomic
from media_claims import claim
from schemas import CaptionReadError, CaptionStatus


class CaptionConflictError(ConflictError):
    """The caption is no longer the revision the writer read; nothing was written."""

    code = "caption_conflict"


class CaptionRead(NamedTuple):
    status: CaptionStatus
    #: Stripped, and only for ``"text"``.
    text: str | None
    #: ``None`` when there is no file or it could not be opened.
    revision: str | None
    read_error: CaptionReadError | None


NO_CAPTION_FILE = CaptionRead("none", None, None, None)
_INACCESSIBLE = CaptionRead("unreadable", None, None, "access")


def caption_revision(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()[:16]


def _caption_from_bytes(raw: bytes) -> CaptionRead:
    revision = caption_revision(raw)
    try:
        # Universal newlines, so a search spanning lines matches CRLF files.
        text = raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n").strip()
    except UnicodeDecodeError:
        return CaptionRead("unreadable", None, revision, "encoding")
    if not text:
        return CaptionRead("empty", None, revision, None)
    return CaptionRead("text", text, revision, None)


def read_caption_file(path: Path) -> CaptionRead:
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        return NO_CAPTION_FILE
    except OSError:
        return _INACCESSIBLE
    return _caption_from_bytes(raw)


def caption_path_for(media_path: Path) -> Path:
    return media_path.parent / f"{media_path.stem}{CAPTION_SIDECAR_EXTENSIONS[0]}"


def read_caption(media_path: Path) -> CaptionRead:
    return read_caption_file(caption_path_for(media_path))


def caption_from_sidecar(sidecar_path: Path, mtime_ns: int, size: int) -> CaptionRead:
    """A file that cannot be opened is not cached."""
    return cached_by_stat(
        "caption",
        sidecar_path,
        mtime_ns,
        size,
        lambda: _caption_from_bytes(sidecar_path.read_bytes()),
        lambda: _INACCESSIBLE,
    )


def is_blank_caption_file(path: Path) -> bool:
    """An unreadable file is not blank."""
    return read_caption_file(path).status == "empty"


def resolve_caption_file_name(stem: str, exists: Callable[[str], bool]) -> str | None:
    for extension in CAPTION_SIDECAR_EXTENSIONS:
        name = f"{stem}{extension}"
        if exists(name):
            return name

    return None


def load_backup_caption(media_path: Path) -> str | None:
    """``None`` when the backup has none."""
    backup_dir = media_path.parent / CAPTION_BACKUP_DIR_NAME
    name = resolve_caption_file_name(
        media_path.stem,
        lambda candidate: (backup_dir / candidate).is_file(),
    )
    if name is None:
        return None

    backup = read_caption_file(backup_dir / name)
    if backup.status == "unreadable":
        return None
    return backup.text or ""


class CaptionTarget(NamedTuple):
    caption: Path
    #: Every given media file that reads this caption, in order.
    media: tuple[Path, ...]

    @property
    def primary(self) -> Path:
        """The file a job reports and reads pixels from."""
        return self.media[0]

    @property
    def shared_with(self) -> list[str]:
        return [path.name for path in self.media[1:]]


def caption_targets(media_files: Iterable[Path]) -> list[CaptionTarget]:
    """One per caption file, so a shared caption changes once."""
    grouped: dict[str, tuple[Path, list[Path]]] = {}
    for media in media_files:
        caption = caption_path_for(media)
        grouped.setdefault(os.path.normcase(caption), (caption, []))[1].append(media)
    return [CaptionTarget(caption, tuple(media)) for caption, media in grouped.values()]


NO_CAPTION_STATUS = "no_caption"
CAPTION_READ_ERROR = "read_error"
#: The caption or its file changed after it was read.
CAPTION_CHANGED_STATUS = "caption_changed"


class ReferenceCaption(NamedTuple):
    """The revision to write back against."""

    text: str | None
    #: ``"ok"``, :data:`NO_CAPTION_STATUS` or :data:`CAPTION_READ_ERROR`.
    status: str
    revision: str | None


def load_reference_caption(media_path: Path) -> ReferenceCaption:
    read = read_caption(media_path)
    if read.status == "unreadable":
        return ReferenceCaption(None, CAPTION_READ_ERROR, read.revision)
    if read.status == "text":
        return ReferenceCaption(read.text, "ok", read.revision)
    return ReferenceCaption(None, NO_CAPTION_STATUS, read.revision)


def build_caption_response(media_path: Path) -> dict[str, object]:
    read = read_caption(media_path)
    issue = load_issue_summary(media_path)

    return {
        "description": read.text,
        "has_description": read.text is not None,
        "has_caption_file": read.status != "none",
        "caption_status": read.status,
        "caption_revision": read.revision,
        "caption_read_error": read.read_error,
        "caption_file": str(caption_path_for(media_path)) if read.status != "none" else "",
        "issue_fixes": issue.fixes,
        "rule_findings": issue.rules,
        "has_issue_file": issue.has_file,
        "issue_fixes_revision": issue.fixes_revision,
        "rule_findings_revision": issue.rules_revision,
    }


def save_caption(
    media_path: Path,
    text: str,
    *,
    base_revision: str | None,
    resolve_issue: bool = False,
    trailing_newline: bool = True,
) -> dict[str, object]:
    """Raises :class:`CaptionConflictError` if the caption changed since ``base_revision``."""
    caption_path = caption_path_for(media_path)
    with claim([caption_path], "caption", wait_s=CAPTION_CLAIM_WAIT_SECONDS):
        if not media_path.is_file():
            raise CaptionConflictError(f"{media_path.name} was moved or deleted")
        current = read_caption_file(caption_path)
        if current.read_error == "access":
            raise PermissionError(f"{caption_path.name} could not be read, so it was not replaced")
        if current.revision != base_revision:
            raise CaptionConflictError(
                f"The caption of {media_path.name} changed since it was loaded"
            )

        normalized = text.strip()
        write_text_atomic(
            caption_path,
            normalized + ("\n" if normalized and trailing_newline else ""),
        )
        if resolve_issue:
            delete_issue_file(media_path)
        return build_caption_response(media_path)


class CaptionUndo(NamedTuple):
    """The replaced bytes and the revision the write left."""

    media_path: Path
    #: ``None``: undoing deletes the file.
    previous: bytes | None
    revision: str | None


def save_caption_undoably(media_path: Path, text: str, *, base_revision: str | None) -> CaptionUndo:
    """Keeps the replaced bytes for :func:`restore_caption`; they must be ``base_revision``."""
    caption_path = caption_path_for(media_path)
    try:
        previous: bytes | None = caption_path.read_bytes()
    except FileNotFoundError:
        previous = None
    if (None if previous is None else caption_revision(previous)) != base_revision:
        raise CaptionConflictError(f"The caption of {media_path.name} changed since it was loaded")
    written = save_caption(media_path, text, base_revision=base_revision)
    revision = written["caption_revision"]
    return CaptionUndo(media_path, previous, revision if isinstance(revision, str) else None)


def restore_caption(undo: CaptionUndo) -> bool:
    """Put back what a job replaced; ``False`` when the caption changed since."""
    caption_path = caption_path_for(undo.media_path)
    with claim([caption_path], "caption", wait_s=CAPTION_CLAIM_WAIT_SECONDS):
        current = read_caption_file(caption_path)
        if current.read_error == "access":
            raise PermissionError(f"{caption_path.name} could not be read, so it was not restored")
        if current.revision != undo.revision:
            return False
        if undo.previous is None:
            caption_path.unlink(missing_ok=True)
        else:
            write_bytes_atomic(caption_path, undo.previous)
    return True


def issue_file_path(media_path: Path) -> Path:
    """Named after the whole file so ``clip.mp4`` and ``clip.png`` never share one."""
    return media_path.with_name(media_path.name + ISSUE_SIDECAR_SUFFIX)


def delete_issue_file(media_path: Path) -> None:
    issue_path = issue_file_path(media_path)
    if not issue_path.is_file():
        return
    issue_path.unlink()


_TYPOGRAPHIC_QUOTES = str.maketrans({"“": '"', "”": '"', "„": '"', "‟": '"'})


def normalize_issue_text(text: str) -> str:
    text = text.translate(_TYPOGRAPHIC_QUOTES)
    text = re.sub(r'\\+"', '"', text)
    return re.sub(
        r'"([^"]*)"',
        lambda match: '"' + re.sub(r"(?:,\s*)+$", "", match[1]) + '"',
        text,
    ).strip()


def normalize_issue_fixes(value: object) -> list[str]:
    if not isinstance(value, list):
        return []

    fixes = []
    for entry in value:
        if not isinstance(entry, str):
            continue
        text = normalize_issue_text(entry)
        if not text or text.lower() in ISSUE_FIX_SENTINELS:
            continue
        fixes.append(text)
        if len(fixes) == MAX_ISSUE_FIXES:
            break

    return fixes


type IssueSource = Literal["fixes", "rules"]


class IssueSummary(NamedTuple):
    fixes: list[str]
    rules: list[str]
    has_file: bool
    #: The caption revision each source checked; ``None`` when unknown.
    fixes_revision: str | None = None
    rules_revision: str | None = None


def _normalize_rule_findings(value: object) -> list[str]:
    if not isinstance(value, list):
        return []

    findings = [entry.strip() for entry in value if isinstance(entry, str) and entry.strip()]
    return findings[:MAX_RULE_FINDINGS]


_NORMALIZERS: dict[IssueSource, Callable[[object], list[str]]] = {
    "fixes": normalize_issue_fixes,
    "rules": _normalize_rule_findings,
}


class _StoredIssues(NamedTuple):
    findings: dict[IssueSource, list[str]]
    #: Only for sources with findings.
    checked: dict[IssueSource, str]


def _issues_from_json(raw: bytes | None) -> _StoredIssues:
    """An unusable sidecar reads as empty."""
    try:
        data = json.loads(raw) if raw is not None else None
    except ValueError:
        data = None

    if not isinstance(data, dict):
        data = {}

    findings = {source: normalize(data.get(source)) for source, normalize in _NORMALIZERS.items()}
    revisions = data.get("checked")
    if not isinstance(revisions, dict):
        revisions = {}
    checked: dict[IssueSource, str] = {
        source: revision
        for source in _NORMALIZERS
        if findings[source] and isinstance(revision := revisions.get(source), str)
    }
    return _StoredIssues(findings, checked)


def _issues_from_file(issue_path: Path) -> _StoredIssues:
    try:
        raw = issue_path.read_bytes()
    except OSError:
        raw = None
    return _issues_from_json(raw)


def _summary(stored: _StoredIssues) -> IssueSummary:
    # The stat cache returns one shared value.
    return IssueSummary(
        list(stored.findings["fixes"]),
        list(stored.findings["rules"]),
        True,
        stored.checked.get("fixes"),
        stored.checked.get("rules"),
    )


def issue_summary_from_sidecar(issue_path: Path, mtime_ns: int, size: int) -> IssueSummary:
    stored = cached_by_stat(
        "issue",
        issue_path,
        mtime_ns,
        size,
        lambda: _issues_from_json(issue_path.read_bytes()),
        lambda: _issues_from_json(None),
    )
    return _summary(stored)


def load_issue_summary(media_path: Path) -> IssueSummary:
    issue_path = issue_file_path(media_path)
    if not issue_path.is_file():
        return IssueSummary([], [], False)

    return _summary(_issues_from_file(issue_path))


def save_issue_findings(
    media_path: Path, source: IssueSource, findings: list[str], *, revision: str | None
) -> None:
    """Replace one source's findings, keeping the other's; ``revision`` marks them stale later."""
    issue_path = issue_file_path(media_path)
    stored = _issues_from_file(issue_path)
    stored.findings[source] = _NORMALIZERS[source](findings)
    stored.checked.pop(source, None)
    if stored.findings[source] and revision is not None:
        stored.checked[source] = revision
    payload: dict[str, object] = {key: found for key, found in stored.findings.items() if found}

    if not payload:
        if issue_path.is_file():
            issue_path.unlink()
        return

    if stored.checked:
        payload["checked"] = stored.checked
    write_text_atomic(issue_path, json.dumps(payload, indent=2) + "\n")
