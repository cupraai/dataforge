from __future__ import annotations

import json
import struct
import unittest

from constants import SAFETENSORS_MAX_HEADER_BYTES
from safetensors_header import SafetensorsHeaderError, model_info, read_model_info
from testing_fixtures import TempMediaFolder, write_safetensors

LORA_TENSORS = {
    "blocks.0.attn.lora_A.weight": ("BF16", [16, 64]),
    "blocks.0.attn.lora_B.weight": ("BF16", [64, 16]),
    "blocks.1.attn.lora_A.weight": ("BF16", [16, 64]),
    "blocks.1.attn.lora_B.weight": ("BF16", [64, 16]),
    "blocks.1.extra.lora_A.weight": ("F32", [8, 64]),
}


class ModelInfoTests(unittest.TestCase):
    def test_reads_ai_toolkit_metadata(self) -> None:
        metadata = {
            "name": "subject_lora",
            "training_info": json.dumps({"step": 1500, "epoch": 3}),
            "ss_base_model_version": "qwen_image",
            "ss_tag_frequency": json.dumps({"1_ohwx": {"ohwx": 1}}),
            "software": json.dumps({"name": "ai-toolkit", "version": "0.7.0"}),
            "format": "pt",
        }
        with TempMediaFolder() as root:
            info = read_model_info(write_safetensors(root, tensors=LORA_TENSORS, metadata=metadata))

        self.assertEqual(info.title, "subject_lora")
        self.assertEqual(info.architecture, "qwen_image")
        self.assertEqual((info.step, info.epoch), (1500, 3))
        self.assertEqual(info.trigger_words, ["ohwx"])
        self.assertEqual(info.software, "ai-toolkit 0.7.0")
        self.assertEqual((info.adapter, info.rank, info.factor), ("lora", 16, None))
        self.assertEqual(info.tensor_count, 5)
        self.assertEqual(info.parameter_count, 4 * 16 * 64 + 8 * 64)
        self.assertEqual(info.precision, "BF16")
        self.assertEqual(info.metadata["format"], "pt")

    def test_reads_kohya_metadata(self) -> None:
        metadata = {
            "ss_output_name": "style",
            "ss_network_alpha": "8.0",
            "ss_steps": "2000",
            "ss_epoch": "10",
            "ss_tag_frequency": json.dumps({"5_style": {"painting": 40, "outdoors": 3}}),
        }
        tensors = {"lora_unet_down.lora_down.weight": ("F16", [32, 320])}
        with TempMediaFolder() as root:
            info = read_model_info(write_safetensors(root, tensors=tensors, metadata=metadata))

        self.assertEqual(info.title, "style")
        self.assertEqual(info.alpha, 8.0)
        self.assertEqual((info.step, info.epoch), (2000, 10))
        self.assertEqual(info.trigger_words, ["painting", "outdoors"])
        self.assertEqual(info.rank, 32)

    def test_reads_lokr_factor_and_optional_rank(self) -> None:
        full = {
            "blocks.0.attn.alpha": ("BF16", []),
            "blocks.0.attn.lokr_w1": ("BF16", [8, 8]),
            "blocks.0.attn.lokr_w2": ("BF16", [96, 96]),
            "blocks.1.attn.lokr_w1": ("BF16", [8, 8]),
            "blocks.1.attn.lokr_w2": ("BF16", [24, 96]),
            "blocks.1.mlp.lokr_w1": ("BF16", [4, 4]),
            "blocks.1.mlp.lokr_w2": ("BF16", [96, 96]),
        }
        low_rank = {
            "blocks.0.attn.lokr_w1": ("BF16", [4, 4]),
            "blocks.0.attn.lokr_w2_a": ("BF16", [96, 16]),
            "blocks.0.attn.lokr_w2_b": ("BF16", [16, 96]),
        }
        with TempMediaFolder() as root:
            full_info = read_model_info(write_safetensors(root, "full.safetensors", full))
            low_rank_info = read_model_info(write_safetensors(root, "low.safetensors", low_rank))

        self.assertEqual((full_info.adapter, full_info.factor, full_info.rank), ("lokr", 8, None))
        self.assertEqual(
            (low_rank_info.adapter, low_rank_info.factor, low_rank_info.rank), ("lokr", 4, 16)
        )

    def test_reads_loha_rank(self) -> None:
        tensors = {
            "blocks.0.attn.hada_w1_a": ("BF16", [64, 8]),
            "blocks.0.attn.hada_w1_b": ("BF16", [8, 64]),
        }
        with TempMediaFolder() as root:
            info = read_model_info(write_safetensors(root, tensors=tensors))

        self.assertEqual((info.adapter, info.rank, info.factor), ("loha", 8, None))

    def test_full_weights_have_no_rank_or_metadata(self) -> None:
        with TempMediaFolder() as root:
            info = read_model_info(write_safetensors(root))

        self.assertIsNone(info.adapter)
        self.assertIsNone(info.rank)
        self.assertEqual(info.metadata, {})
        self.assertEqual(info.trigger_words, [])
        self.assertEqual(info.parameter_count, 4)

    def test_drops_non_string_metadata_and_bad_embedded_json(self) -> None:
        metadata = {"name": "kept", "count": 3, "training_info": "{not json"}
        with TempMediaFolder() as root:
            info = read_model_info(write_safetensors(root, metadata=metadata))

        self.assertEqual(info.metadata, {"name": "kept", "training_info": "{not json"})
        self.assertIsNone(info.step)

    def test_malformed_files_raise_one_error(self) -> None:
        cases = {
            "short": b"\x01\x02",
            "oversized": struct.pack("<Q", SAFETENSORS_MAX_HEADER_BYTES + 1) + b"{}",
            "truncated": struct.pack("<Q", 100) + b'{"a": 1}',
            "not_json": struct.pack("<Q", 4) + b"\xff\xfe\xfd\xfc",
            "not_an_object": struct.pack("<Q", 2) + b"[]",
        }
        with TempMediaFolder() as root:
            for name, data in cases.items():
                with self.subTest(name=name):
                    path = root / f"{name}.safetensors"
                    path.write_bytes(data)
                    with self.assertRaises(SafetensorsHeaderError):
                        read_model_info(path)

    def test_cached_reading_answers_none_for_a_malformed_file(self) -> None:
        with TempMediaFolder() as root:
            path = root / "broken.safetensors"
            path.write_bytes(b"\x00" * 8)
            stat = path.stat()

            self.assertIsNone(model_info(path, stat.st_mtime_ns, stat.st_size))


def quantized_layer(name: str, dtype: str, record: dict[str, object]) -> dict:
    """One ComfyUI quantized linear: the weight, its scale and its format record."""
    payload = json.dumps(record).encode()
    return {
        f"{name}.weight": (dtype, [64, 64]),
        f"{name}.weight_scale": ("F32", []),
        f"{name}.comfy_quant": ("U8", [len(payload)], payload),
    }


# Unquantized norms outnumber the quantized weights by tensor count, never by parameters.
NORMS = {f"blocks.{index}.norm.weight": ("BF16", [64]) for index in range(8)}
INT8_CONVROT = {"format": "int8_tensorwise", "convrot": True, "convrot_groupsize": 256}


class PrecisionTests(unittest.TestCase):
    def precision(self, tensors: dict) -> str | None:
        with TempMediaFolder() as root:
            return read_model_info(write_safetensors(root, tensors=tensors)).precision

    def test_names_comfy_quantized_formats(self) -> None:
        cases = {
            "INT8 ConvRot": ("I8", INT8_CONVROT),
            "INT8": ("I8", {"format": "int8_tensorwise"}),
            "FP8 scaled": ("F8_E4M3", {"format": "float8_e4m3fn"}),
            "NVFP4": ("U8", {"format": "nvfp4"}),
            "some_new_format": ("U8", {"format": "some_new_format"}),
        }
        for expected, (dtype, record) in cases.items():
            with self.subTest(expected=expected):
                tensors = {**NORMS, **quantized_layer("blocks.0.attn", dtype, record)}
                self.assertEqual(self.precision(tensors), expected)

    def test_a_file_quantized_several_ways_is_named_by_its_largest_format(self) -> None:
        tensors = {
            **quantized_layer("blocks.0.mlp", "U8", {"format": "nvfp4"}),
            **quantized_layer("blocks.1.mlp", "U8", {"format": "nvfp4"}),
            **quantized_layer("blocks.0.attn", "F8_E4M3", {"format": "float8_e4m3fn"}),
        }
        self.assertEqual(self.precision(tensors), "NVFP4 mixed")

        tensors["blocks.0.mlp.pre_quant_scale"] = ("BF16", [64])
        self.assertEqual(self.precision(tensors), "NVFP4 AWQ mixed")

    def test_record_options_do_not_make_a_file_mixed(self) -> None:
        tensors = {
            **quantized_layer("blocks.0.attn", "I8", INT8_CONVROT),
            **quantized_layer("blocks.1.attn", "I8", {**INT8_CONVROT, "convrot_groupsize": 64}),
        }
        self.assertEqual(self.precision(tensors), "INT8 ConvRot")

    def test_names_legacy_scaled_fp8(self) -> None:
        tensors = {
            **NORMS,
            "blocks.0.attn.weight": ("F8_E4M3", [64, 64]),
            "blocks.0.attn.scale_weight": ("F32", []),
            "scaled_fp8": ("F8_E4M3", [0]),
        }
        self.assertEqual(self.precision(tensors), "FP8 scaled")

    def test_falls_back_to_the_dtype_holding_the_most_parameters(self) -> None:
        tensors = {**NORMS, "blocks.0.attn.weight": ("F8_E4M3", [64, 64])}
        self.assertEqual(self.precision(tensors), "FP8")

        scales = {f"blocks.{index}.scale": ("F32", []) for index in range(8)}
        self.assertEqual(self.precision({**scales, "proj.weight": ("F16", [8, 8])}), "FP16")

    def test_an_unreadable_record_is_ignored(self) -> None:
        tensors = {
            "blocks.0.attn.weight": ("I8", [64, 64]),
            "blocks.0.attn.comfy_quant": ("U8", [4], b"\xff{x}"),
        }
        self.assertEqual(self.precision(tensors), "INT8")


if __name__ == "__main__":
    unittest.main()
