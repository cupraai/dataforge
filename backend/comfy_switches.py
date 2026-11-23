"""The nodes that pass on one of several inputs."""

from __future__ import annotations

import re

#: The selector input, then the input each of its values passes on; the other never runs.
BOOLEAN_SWITCHES = {
    "ComfySwitchNode": ("switch", "on_true", "on_false"),
    "ImpactConditionalBranch": ("cond", "tt_value", "ff_value"),
}
#: Impact Pack's indexed switches evaluate only `input{select}`.
INDEXED_SWITCHES = frozenset({"ImpactSwitch", "LatentSwitch", "SEGSSwitch"})
INDEXED_INPUT = re.compile(r"input\d+")


def is_switch_side(class_type: str, key: str) -> bool:
    if class_type in BOOLEAN_SWITCHES:
        return key in BOOLEAN_SWITCHES[class_type][1:]
    return class_type in INDEXED_SWITCHES and INDEXED_INPUT.fullmatch(key) is not None
