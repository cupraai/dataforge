"""What a ``.safetensors`` file says about itself, read without loading its weights.

The layout is an 8-byte little-endian header length, the JSON header, then raw tensor bytes. The
header maps each tensor name to its dtype and shape, plus an optional ``__metadata__`` of string
values that trainers fill with their own keys: kohya's ``ss_*``, the ``modelspec.*`` convention, and
AI-Toolkit's JSON-in-a-string ``training_info`` and ``software``.

ComfyUI's quantized checkpoints record each layer's format in a tiny ``<layer>.comfy_quant`` tensor
of JSON bytes, such as ``{"format": "int8_tensorwise", "convrot": true}``. Those records are the only
tensor data read; older ``*_fp8_scaled`` files mark themselves with an empty ``scaled_fp8`` tensor.
"""

from __future__ import annotations

import json
import math
import struct
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO, Literal

from caption_cache import cached_by_stat
from constants import SAFETENSORS_MAX_HEADER_BYTES
from schemas import AdapterKind

__all__ = ["ModelInfo", "SafetensorsHeaderError", "model_info", "read_model_info"]

_NAMESPACE = "safetensors-header"
_METADATA_KEY = "__metadata__"
# Adapter layouts, told apart by tensor names: ``{suffix: (adapter, measure, shape axis)}``.
# LoRA's down projection is ``(rank, in)``. LyCORIS LoKr's small Kronecker half ``lokr_w1`` (or its
# low-rank ``lokr_w1_a``) leads with the factor, ``(factor, factor)`` when it divides the layer; the
# large half is either a full ``lokr_w2`` or a low-rank ``lokr_w2_a`` of ``(out, rank)``. LoHa's
# ``hada_w1_a`` is ``(out, rank)`` too.
_ADAPTER_TENSORS: dict[str, tuple[AdapterKind, Literal["rank", "factor"], int]] = {
    ".lora_down.weight": ("lora", "rank", 0),
    ".lora_A.weight": ("lora", "rank", 0),
    ".lokr_w1": ("lokr", "factor", 0),
    ".lokr_w1_a": ("lokr", "factor", 0),
    ".lokr_w2_a": ("lokr", "rank", 1),
    ".hada_w1_a": ("loha", "rank", 1),
}
_QUANT_RECORD_SUFFIX = ".comfy_quant"
# A record is a short JSON object; anything larger is not one and is never read.
_MAX_QUANT_RECORD_BYTES = 4096
_SCALED_FP8_MARKER = "scaled_fp8"
_AWQ_SUFFIX = ".pre_quant_scale"

_DTYPE_LABELS = {
    "F32": "FP32",
    "F16": "FP16",
    "BF16": "BF16",
    "F8_E4M3": "FP8",
    "F8_E5M2": "FP8 E5M2",
    "I8": "INT8",
}
# Every ComfyUI quantized layer carries a weight scale, so the FP8 formats read as "scaled".
_QUANT_FORMAT_LABELS = {
    "float8_e4m3fn": "FP8 scaled",
    "float8_e5m2": "FP8 E5M2 scaled",
    "nvfp4": "NVFP4",
    "mxfp8": "MXFP8",
}


class SafetensorsHeaderError(ValueError):
    """The file is not a readable safetensors header."""


@dataclass(frozen=True, slots=True)
class ModelInfo:
    tensor_count: int
    parameter_count: int
    metadata: dict[str, str] = field(default_factory=dict)
    precision: str | None = None
    architecture: str | None = None
    title: str | None = None
    adapter: AdapterKind | None = None
    rank: int | None = None
    factor: int | None = None
    alpha: float | None = None
    step: int | None = None
    epoch: int | None = None
    trigger_words: list[str] = field(default_factory=list)
    software: str | None = None


def _read_header(handle: BinaryIO) -> dict:
    prefix = handle.read(8)
    if len(prefix) != 8:
        raise SafetensorsHeaderError("File is too short")
    (length,) = struct.unpack("<Q", prefix)
    if length == 0 or length > SAFETENSORS_MAX_HEADER_BYTES:
        raise SafetensorsHeaderError("Header length is out of range")
    raw = handle.read(length)
    if len(raw) != length:
        raise SafetensorsHeaderError("Header runs past the end of the file")
    try:
        header = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SafetensorsHeaderError("Header is not JSON") from error
    if not isinstance(header, dict):
        raise SafetensorsHeaderError("Header is not an object")
    return header


def _json_value(text: str | None) -> object:
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _whole_number(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _number(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def _trigger_words(metadata: dict[str, str]) -> list[str]:
    phrase = _text(metadata.get("modelspec.trigger_phrase"))
    if phrase is not None:
        return [phrase]
    # kohya and AI-Toolkit both write `{"<repeats>_<folder>": {"<tag>": count}}`.
    frequency = _json_value(metadata.get("ss_tag_frequency"))
    if not isinstance(frequency, dict):
        return []
    words: list[str] = []
    for tags in frequency.values():
        if isinstance(tags, dict):
            words.extend(tag for tag in tags if isinstance(tag, str) and tag not in words)
    return words


def _software(metadata: dict[str, str]) -> str | None:
    software = _json_value(metadata.get("software"))
    if not isinstance(software, dict):
        return None
    name = _text(software.get("name"))
    version = _text(software.get("version"))
    if name is None:
        return None
    return f"{name} {version}" if version else name


def _quant_record_spans(header: dict) -> list[tuple[int, int, str]]:
    spans = []
    for name, tensor in header.items():
        if not name.endswith(_QUANT_RECORD_SUFFIX) or not isinstance(tensor, dict):
            continue
        offsets = tensor.get("data_offsets")
        if not isinstance(offsets, list) or len(offsets) != 2:
            continue
        start, end = (_whole_number(n) for n in offsets)
        if start is None or end is None or not 0 <= start < end <= start + _MAX_QUANT_RECORD_BYTES:
            continue
        spans.append((start, end, name.removesuffix(_QUANT_RECORD_SUFFIX)))
    return sorted(spans)


def _read_quant_records(handle: BinaryIO, header: dict) -> dict[str, dict]:
    """Each quantized layer's record, keyed by layer name; unreadable records are skipped."""
    data_start = handle.tell()
    records: dict[str, dict] = {}
    for start, end, layer in _quant_record_spans(header):
        handle.seek(data_start + start)
        try:
            record = json.loads(handle.read(end - start))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        if isinstance(record, dict):
            records[layer] = record
    return records


def _format_label(record: dict) -> str | None:
    quant_format = _text(record.get("format"))
    if quant_format is None:
        return None
    if quant_format.startswith("int8"):
        label = "INT8"
    else:
        label = _QUANT_FORMAT_LABELS.get(quant_format, quant_format)
    return f"{label} ConvRot" if record.get("convrot") is True else label


def _precision(
    header: dict, parameters_by_dtype: Counter[str], records: dict[str, dict]
) -> str | None:
    """How the weights are stored, named the way checkpoint filenames do, such as ``INT8 ConvRot``.

    A file quantized several ways is named by the format holding the most parameters, plus "mixed".
    """
    formats: Counter[str] = Counter()
    for layer, record in records.items():
        label = _format_label(record)
        if label is not None:
            formats[label] += _parameters(header.get(f"{layer}.weight")) or 1
    if formats:
        label = formats.most_common(1)[0][0]
        if any(name.endswith(_AWQ_SUFFIX) for name in header):
            label = f"{label} AWQ"
        return f"{label} mixed" if len(formats) > 1 else label

    marker = header.get(_SCALED_FP8_MARKER)
    if isinstance(marker, dict):
        return "FP8 E5M2 scaled" if marker.get("dtype") == "F8_E5M2" else "FP8 scaled"

    if not parameters_by_dtype:
        return None
    dtype = parameters_by_dtype.most_common(1)[0][0]
    return _DTYPE_LABELS.get(dtype, dtype)


def _parameters(tensor: object) -> int | None:
    if not isinstance(tensor, dict):
        return None
    shape = tensor.get("shape")
    if not isinstance(shape, list) or not all(_whole_number(n) is not None for n in shape):
        return None
    return math.prod(int(n) for n in shape)


def _adapter_layout(name: str) -> tuple[AdapterKind, Literal["rank", "factor"], int] | None:
    return next(
        (layout for suffix, layout in _ADAPTER_TENSORS.items() if name.endswith(suffix)), None
    )


def _most_common(counts: Counter[int]) -> int | None:
    return counts.most_common(1)[0][0] if counts else None


def _parse(header: dict, quant_records: dict[str, dict]) -> ModelInfo:
    raw_metadata = header.get(_METADATA_KEY)
    metadata = (
        {key: value for key, value in raw_metadata.items() if isinstance(value, str)}
        if isinstance(raw_metadata, dict)
        else {}
    )

    # Weighted by parameters: a quantized layer keeps a few F32 scales beside each large weight.
    parameters_by_dtype: Counter[str] = Counter()
    adapters: Counter[AdapterKind] = Counter()
    ranks: Counter[int] = Counter()
    factors: Counter[int] = Counter()
    tensor_count = 0
    parameter_count = 0
    for name, tensor in header.items():
        if name == _METADATA_KEY:
            continue
        parameters = _parameters(tensor)
        if parameters is None:
            continue
        tensor_count += 1
        parameter_count += parameters
        dtype = tensor.get("dtype")
        if isinstance(dtype, str):
            parameters_by_dtype[dtype] += parameters
        shape = tensor["shape"]
        layout = _adapter_layout(name)
        if layout is not None and len(shape) >= 2:
            adapter, measure, axis = layout
            adapters[adapter] += 1
            (ranks if measure == "rank" else factors)[int(shape[axis])] += 1

    training = _json_value(metadata.get("training_info"))
    if not isinstance(training, dict):
        training = {}

    return ModelInfo(
        tensor_count=tensor_count,
        parameter_count=parameter_count,
        metadata=metadata,
        precision=_precision(header, parameters_by_dtype, quant_records),
        architecture=_text(metadata.get("modelspec.architecture"))
        or _text(metadata.get("ss_base_model_version")),
        title=_text(metadata.get("modelspec.title"))
        or _text(metadata.get("name"))
        or _text(metadata.get("ss_output_name")),
        adapter=adapters.most_common(1)[0][0] if adapters else None,
        rank=_most_common(ranks),
        factor=_most_common(factors),
        alpha=_number(metadata.get("ss_network_alpha")),
        step=_whole_number(training.get("step")) or _whole_number(metadata.get("ss_steps")),
        epoch=_whole_number(training.get("epoch")) or _whole_number(metadata.get("ss_epoch")),
        trigger_words=_trigger_words(metadata),
        software=_software(metadata),
    )


def read_model_info(path: Path) -> ModelInfo:
    """Raises :class:`SafetensorsHeaderError` for a malformed file and ``OSError`` for IO."""
    with path.open("rb") as handle:
        header = _read_header(handle)
        return _parse(header, _read_quant_records(handle, header))


def _load(path: Path) -> ModelInfo | None:
    try:
        return read_model_info(path)
    except SafetensorsHeaderError:
        return None


def model_info(path: Path, mtime_ns: int, size: int) -> ModelInfo | None:
    """``None`` when the header cannot be read; a malformed file is remembered, an IO error is not."""
    return cached_by_stat(_NAMESPACE, path, mtime_ns, size, lambda: _load(path), lambda: None)
