"""Check that stylesheets draw keyboard focus only through the shared focus ring.

Run from the project root:
  backend/.venv/Scripts/python scripts/check_focus.py

``base/_focus.scss`` gives every ``:focus-visible`` element one ring, drawn inside its edge so no
scroll container clips it. A component that needs it elsewhere uses a ``focus-ring-*`` mixin, and
one that needs another colour sets ``--focus-ring-color``. A rule under a focus selector that
declares its own ``outline`` or ``box-shadow`` brings back a second look, so it fails here.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STYLES = ROOT / "frontend" / "src" / "styles"
# The ring itself and its mixins are defined here.
EXEMPT = ("abstracts/", "base/_focus.scss")

_FOCUS_SELECTOR = re.compile(r":focus|\.cm-focused")
_RING_PROPERTY = re.compile(r"^(?:outline(?:-[a-z]+)?|box-shadow)\s*:", re.I)
_LINE_COMMENT = re.compile(r"(?<!:)//.*$", re.M)
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)


def _blank(match: re.Match[str]) -> str:
    # Keeps line numbers: a stripped comment leaves its newlines behind.
    return re.sub(r"[^\n]", " ", match.group(0))


def problems_in(relative: str, source: str) -> list[str]:
    code = _LINE_COMMENT.sub(_blank, _BLOCK_COMMENT.sub(_blank, source))
    found: list[str] = []
    selectors: list[str] = []
    chunk, chunk_start, index = "", 0, 0
    while index < len(code):
        char = code[index]
        if not chunk:
            chunk_start = index
        if char in "\"'" or code.startswith("#{", index):
            # A string or an interpolation is text, whatever braces or semicolons it holds.
            close = char if char in "\"'" else "}"
            end = code.find(close, index + 1)
            end = len(code) - 1 if end == -1 else end
            chunk += code[index : end + 1]
            index = end + 1
            continue
        if char not in "{};":
            chunk += char
            index += 1
            continue
        if char == "{":
            selectors.append(chunk.strip())
        elif char == "}":
            if selectors:
                selectors.pop()
        else:
            declaration = chunk.strip()
            if _RING_PROPERTY.match(declaration) and any(
                _FOCUS_SELECTOR.search(selector) for selector in selectors
            ):
                start = chunk_start + len(chunk) - len(chunk.lstrip())
                line = code.count("\n", 0, start) + 1
                name = declaration.split(":", 1)[0].strip()
                found.append(
                    f"{relative}:{line}: {name!r} under a focus selector; use a focus-ring mixin "
                    "or --focus-ring-color"
                )
        chunk, index = "", index + 1
    return found


def collect_problems() -> list[str]:
    found = []
    for path in sorted(STYLES.rglob("*.scss")):
        relative = path.relative_to(STYLES).as_posix()
        if relative.startswith(EXEMPT):
            continue
        found.extend(problems_in(f"styles/{relative}", path.read_text(encoding="utf-8")))
    return found


def main() -> int:
    found = collect_problems()
    for problem in found:
        print(problem)
    if found:
        print(f"\n{len(found)} focus ring problem(s).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
