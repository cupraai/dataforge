"""Run the backend type checker.

Run from the project root:
  backend/.venv/Scripts/python scripts/run_typecheck.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"

# CI checks on Linux, where code behind a `sys.platform != "win32"` guard is unreachable and
# typed differently, so a Windows or macOS run checks for Linux as well.
CI_PLATFORM = "linux"


def main() -> int:
    # Settings, including the test relaxation, live in backend/pyproject.toml under [tool.ty].
    command = [sys.executable, "-m", "ty", "check", "--error-on-warning", "."]
    platforms = [None] if sys.platform == CI_PLATFORM else [None, CI_PLATFORM]

    failed = False
    for platform in platforms:
        extra = [] if platform is None else ["--python-platform", platform]
        if platform is not None:
            print(f"Type-checking for {platform}, as CI does:", flush=True)
        result = subprocess.run([*command, *extra], cwd=BACKEND, check=False)
        failed = failed or result.returncode != 0
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
