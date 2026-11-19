"""Wall-clock microsecond revisions, so they keep rising across restarts."""

from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_last = 0


def next_revision() -> int:
    """Greater than every earlier one, across processes."""
    global _last
    with _lock:
        _last = max(_last + 1, time.time_ns() // 1000)
        return _last
