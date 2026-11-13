"""Check that stylesheets size type and round corners from the scale tokens.

Run from the project root:
  backend/.venv/Scripts/python scripts/check_tokens.py

A literal font size or corner radius drifts off the scale and is invisible to a later retune of
it. Sizes come from ``var(--text-*)`` and radii from ``var(--radius-*)``; a file-level SCSS
variable is accepted for a deliberate one-off, so its reason sits beside its definition. A
radius may also be ``0``, a circle's ``50%``, or a hairline of at most 2px on a thin mark.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STYLES = ROOT / "frontend" / "src" / "styles"
# The scales themselves are defined here.
EXEMPT_DIRS = ("abstracts/", "tokens/")

_FONT_SIZE = re.compile(r"(?<![\w$-])font-size\s*:\s*([^;{}]+);")
_ALLOWED = re.compile(r"^(?:var\(--text-[\w-]+\)|\$[\w-]+|inherit|100%)$")
_RADIUS = re.compile(r"(?<![\w$-])border(?:-[a-z]+)*-radius\s*:\s*([^;{}]+);")
_RADIUS_PART = re.compile(r"^(?:var\(--radius(?:-[\w-]+)?\)|\$[\w-]+|0|50%|inherit|[12]px)$")
_LINE_COMMENT = re.compile(r"(?<!:)//.*$")


def problems_in(relative: str, source: str) -> list[str]:
    found = []
    for number, line in enumerate(source.splitlines(), start=1):
        code = _LINE_COMMENT.sub("", line)
        for match in _FONT_SIZE.finditer(code):
            value = match.group(1).strip()
            if not _ALLOWED.match(value):
                found.append(f"{relative}:{number}: font-size {value!r}; use a var(--text-*) token")
        for match in _RADIUS.finditer(code):
            value = match.group(1).strip()
            if not all(_RADIUS_PART.match(part) for part in value.split()):
                found.append(f"{relative}:{number}: radius {value!r}; use a var(--radius-*) token")
    return found


def collect_problems() -> list[str]:
    found = []
    for path in sorted(STYLES.rglob("*.scss")):
        relative = path.relative_to(STYLES).as_posix()
        if relative.startswith(EXEMPT_DIRS):
            continue
        found.extend(problems_in(f"styles/{relative}", path.read_text(encoding="utf-8")))
    return found


def main() -> int:
    found = collect_problems()
    for problem in found:
        print(problem)
    if found:
        print(f"\n{len(found)} value(s) off the type or radius scale.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
