from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

#: 300 entries yield 115-290 lines; the panel shows ~20.
LOG_TAIL_LINES = 200

_ANSI_PATTERN = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]")


def assemble_log_lines(
    entries: Iterable[Mapping[str, Any]],
    *,
    limit: int = LOG_TAIL_LINES,
) -> list[str]:
    """Display lines, newest last; entries are stdout writes, not lines."""
    text = "".join(entry["m"] for entry in entries if isinstance(entry.get("m"), str))

    # Before the newline pass, or a `\r\x1b[K\n` repaint keeps its `\r`.
    text = _ANSI_PATTERN.sub("", text).replace("\r\n", "\n")

    # The unterminated last segment is the progress bar still being drawn.
    lines = [segment.rsplit("\r", 1)[-1].rstrip() for segment in text.split("\n")]

    # Interior blanks are ComfyUI's own separators.
    while lines and not lines[-1]:
        lines.pop()

    return lines[-limit:] if limit > 0 else lines
