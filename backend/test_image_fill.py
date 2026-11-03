from __future__ import annotations

from testing_fixtures import isolate_test_database

isolate_test_database()

import base64
import io
import json
import os
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw

import edit_sidecars
import image_edit
import image_fill
from image_fill import (
    FillAsset,
    FillMaskError,
    FillOutputError,
    FillUnavailableError,
    apply_fill_chain,
    composite_fill,
    decode_mask,
    discard_result,
    file_digest,
    generated_patch,
    generation_and_blend,
    load_result,
    plan_fill_geometry,
    prepare_fill_inputs,
    resolve_fill_chain,
    save_result,
    sweep_results,
)
from media_group import media_group_paths
from media_rename import rename_media_file
from media_transfer import transfer_media_with_sidecars
from schemas import FillBox, ImageEditSpec, ImageFill
from testing_fixtures import TempMediaFolder, write_image, write_jpeg

GREY = (128, 128, 128)
MAGENTA = (255, 0, 255, 255)


def mask_png(mask: Image.Image) -> str:
    buffer = io.BytesIO()
    mask.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def painted(size: tuple[int, int], *boxes: tuple[int, int, int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for box in boxes:
        draw.rectangle(box, fill=255)
    return mask


def textured(size: tuple[int, int]) -> Image.Image:
    """Every pixel differs from its neighbours, so a pixel that moved or blended shows up."""
    image = Image.new("RGBA", size)
    width, height = size
    image.putdata(
        [
            (x * 7 % 256, y * 11 % 256, (x + y) * 5 % 256, 255)
            for y in range(height)
            for x in range(width)
        ]
    )
    return image


def make_fill(
    box: FillBox,
    *,
    fill_id: str = "a" * 32,
    parent_id: str | None = None,
    digest: str = "0" * 64,
) -> ImageFill:
    return ImageFill(
        id=fill_id,
        parent_id=parent_id,
        source_digest=digest,
        box=box,
        inference_width=64,
        inference_height=64,
        instruction="",
        preset="quality",
        seed=7,
        workflow="qwen21_fill_quality@test",
        created_at="2026-11-02T00:00:00+00:00",
    )


def solid_asset(fill: ImageFill, color=MAGENTA, blend_value: int = 255) -> FillAsset:
    size = (fill.box.width, fill.box.height)
    return FillAsset(
        fill=fill,
        generated=Image.new("RGBA", size, color),
        blend=Image.new("L", size, blend_value),
    )


class ResultsFolder(unittest.TestCase):
    """Points the temporary results at a folder of the test's own."""

    def setUp(self) -> None:
        temp = tempfile.TemporaryDirectory(prefix="dataforge-fill-results-")
        self.addCleanup(temp.cleanup)
        self.results = Path(temp.name)
        env = patch.dict(os.environ, {image_fill.FILL_RESULTS_ENV: temp.name})
        env.start()
        self.addCleanup(env.stop)
        # Deletes go to the Recycle Bin on Windows; a test must not fill the real one.
        trash = patch("file_trash.sys.platform", "linux")
        trash.start()
        self.addCleanup(trash.stop)


class DecodeMaskTests(unittest.TestCase):
    def test_grey_edges_are_thresholded_to_a_binary_selection(self) -> None:
        mask = Image.new("L", (8, 4), 0)
        mask.putpixel((1, 1), 127)
        for x in range(4, 8):
            mask.putpixel((x, 2), 128)

        decoded = decode_mask(mask_png(mask), (8, 4))

        self.assertEqual(set(decoded.get_flattened_data()), {0, 255})
        self.assertEqual(decoded.getpixel((1, 1)), 0)
        self.assertEqual(decoded.getpixel((5, 2)), 255)

    def test_a_mask_the_wrong_size_is_refused_naming_both_sizes(self) -> None:
        with self.assertRaisesRegex(FillMaskError, "8 x 4.*10 x 4"):
            decode_mask(mask_png(painted((8, 4), (0, 0, 7, 3))), (10, 4))

    def test_the_size_is_checked_from_the_header_before_decoding(self) -> None:
        # A decompression bomb would be refused here, not after allocating its frame.
        encoded = mask_png(painted((8, 4), (0, 0, 7, 3)))
        with patch.object(Image.Image, "load", side_effect=AssertionError("decoded")):
            with self.assertRaises(FillMaskError):
                decode_mask(encoded, (4, 8))

    def test_an_empty_selection_is_refused(self) -> None:
        with self.assertRaisesRegex(FillMaskError, "Paint over"):
            decode_mask(mask_png(Image.new("L", (8, 4), 0)), (8, 4))

    def test_a_jpeg_or_garbage_is_refused(self) -> None:
        buffer = io.BytesIO()
        Image.new("L", (8, 4), 255).save(buffer, format="JPEG")
        with self.assertRaisesRegex(FillMaskError, "PNG"):
            decode_mask(base64.b64encode(buffer.getvalue()).decode(), (8, 4))
        with self.assertRaisesRegex(FillMaskError, "base64"):
            decode_mask("not base64!", (8, 4))


class GeometryTests(unittest.TestCase):
    def test_the_crop_surrounds_the_selection_with_context_on_every_side(self) -> None:
        geometry = plan_fill_geometry((4000, 3000), (1000, 1000, 1400, 1200))

        left, top, right, bottom = geometry.bounds
        self.assertLessEqual(right - left, 4000)
        self.assertEqual((left, top, right, bottom), (800, 800, 1600, 1400))

    def test_inference_sides_sit_on_the_model_grid_within_the_pixel_budget(self) -> None:
        geometry = plan_fill_geometry((6000, 4000), (0, 0, 6000, 4000))

        self.assertEqual(geometry.inference_width % image_fill.FILL_SIZE_MULTIPLE, 0)
        self.assertEqual(geometry.inference_height % image_fill.FILL_SIZE_MULTIPLE, 0)
        pixels = geometry.inference_width * geometry.inference_height
        self.assertLess(
            abs(pixels - image_fill.FILL_TARGET_PIXELS) / image_fill.FILL_TARGET_PIXELS, 0.1
        )
        # The aspect survives the grid within one cell.
        self.assertAlmostEqual(
            geometry.inference_width / geometry.inference_height, 1.5, delta=0.05
        )

    def test_a_small_crop_is_scaled_up_no_more_than_the_cap(self) -> None:
        geometry = plan_fill_geometry((200, 120), (10, 10, 20, 20))

        self.assertEqual(geometry.bounds, (0, 0, 200, 120))
        self.assertLessEqual(geometry.inference_width, 200 * image_fill.FILL_MAX_UPSCALE + 32)

    def test_an_edge_selection_is_clamped_inside_the_frame(self) -> None:
        geometry = plan_fill_geometry((1000, 800), (980, 0, 1000, 30))

        left, top, right, _bottom = geometry.bounds
        self.assertEqual((right, top), (1000, 0))
        self.assertGreaterEqual(left, 0)
        self.assertEqual(right - left, image_fill.FILL_MIN_CROP_SIDE_PX)


class BlendTests(unittest.TestCase):
    def test_the_blend_is_full_on_the_selection_and_zero_outside_the_generation_area(self) -> None:
        # Two disconnected regions and a single stray pixel all keep their own coverage.
        mask = painted((300, 200), (20, 20, 60, 60), (200, 120, 260, 180))
        mask.putpixel((150, 30), 255)

        generation, blend = generation_and_blend(mask, 8)

        for xy in ((40, 40), (230, 150), (150, 30)):
            self.assertEqual(mask.getpixel(xy), 255)
            self.assertEqual(blend.getpixel(xy), 255)
            self.assertEqual(generation.getpixel(xy), 255)
        pairs = zip(generation.get_flattened_data(), blend.get_flattened_data(), strict=True)
        self.assertTrue(all(b == 0 for g, b in pairs if g == 0))
        # The generation area takes in the object's boundary: it reaches past the paint.
        self.assertEqual(generation.getpixel((150 + 8, 30)), 255)
        self.assertEqual(generation.getpixel((150 + 9, 30)), 0)

    def test_pixels_outside_the_blend_are_exactly_the_source(self) -> None:
        base = textured((120, 80))
        fill = make_fill(FillBox(left=20, top=10, width=60, height=50))
        blend = Image.new("L", (60, 50), 0)
        ImageDraw.Draw(blend).ellipse((10, 10, 40, 40), fill=200)
        asset = FillAsset(fill=fill, generated=Image.new("RGBA", (60, 50), MAGENTA), blend=blend)

        result = composite_fill(base, asset)

        changed = 0
        for y in range(80):
            for x in range(120):
                inside = 20 <= x < 80 and 10 <= y < 60
                weight = blend.getpixel((x - 20, y - 10)) if inside else 0
                if weight == 0:
                    self.assertEqual(result.getpixel((x, y)), base.getpixel((x, y)), (x, y))
                else:
                    changed += 1
        self.assertGreater(changed, 0)

    def test_a_fill_past_the_frame_is_refused_rather_than_clipped(self) -> None:
        asset = solid_asset(make_fill(FillBox(left=50, top=0, width=60, height=10)))

        with self.assertRaises(FillUnavailableError):
            composite_fill(Image.new("RGBA", (100, 10)), asset)


class InputsTests(unittest.TestCase):
    def test_an_opaque_crop_is_sent_without_alpha_and_comes_back_opaque(self) -> None:
        base = textured((400, 300))
        inputs = prepare_fill_inputs(base, painted((400, 300), (150, 100, 200, 150)))

        self.assertTrue(inputs.opaque)
        self.assertEqual(inputs.model_image.mode, "RGB")
        size = (inputs.geometry.inference_width, inputs.geometry.inference_height)
        self.assertEqual(inputs.model_image.size, size)
        self.assertEqual(inputs.model_mask.size, size)
        self.assertEqual(set(inputs.model_mask.get_flattened_data()), {0, 255})

        # The model invented transparency; an opaque source does not take it.
        patch_image = generated_patch(Image.new("RGBA", size, (1, 2, 3, 0)), inputs)
        self.assertEqual(patch_image.getchannel("A").getextrema(), (255, 255))
        self.assertEqual(patch_image.size, (inputs.geometry.box.width, inputs.geometry.box.height))

    def test_a_transparent_crop_is_sent_with_alpha_and_keeps_the_generated_alpha(self) -> None:
        base = textured((400, 300))
        base.putalpha(Image.new("L", (400, 300), 0))
        inputs = prepare_fill_inputs(base, painted((400, 300), (150, 100, 200, 150)))
        size = (inputs.geometry.inference_width, inputs.geometry.inference_height)

        self.assertFalse(inputs.opaque)
        self.assertEqual(inputs.model_image.mode, "RGBA")
        patch_image = generated_patch(Image.new("RGBA", size, (1, 2, 3, 90)), inputs)
        self.assertEqual(patch_image.getchannel("A").getextrema(), (90, 90))

    def test_the_selection_lands_where_it_was_painted_after_the_round_trip(self) -> None:
        """Scale down to inference size and back: the painted area maps onto itself."""
        base = Image.new("RGBA", (3000, 2000), (0, 0, 0, 255))
        mask = painted((3000, 2000), (1000, 400, 1999, 1399))
        inputs = prepare_fill_inputs(base, mask)
        geometry = inputs.geometry
        size = (geometry.inference_width, geometry.inference_height)
        self.assertLess(size[0], geometry.box.width)

        # A model that paints exactly its mask white.
        output = Image.merge("RGBA", (inputs.model_mask,) * 3 + (Image.new("L", size, 255),))
        asset = FillAsset(
            fill=make_fill(geometry.box),
            generated=generated_patch(output, inputs),
            blend=inputs.blend,
        )
        result = composite_fill(base, asset)

        self.assertEqual(result.getpixel((1500, 900))[:3], (255, 255, 255))
        self.assertEqual(result.getpixel((1000, 400))[:3], (255, 255, 255))
        self.assertEqual(result.getpixel((1999, 1399))[:3], (255, 255, 255))
        self.assertEqual(result.getpixel((900, 900)), (0, 0, 0, 255))
        self.assertEqual(result.getpixel((1500, 1500)), (0, 0, 0, 255))

    def test_an_answer_of_the_wrong_size_is_malformed(self) -> None:
        inputs = prepare_fill_inputs(textured((400, 300)), painted((400, 300), (10, 10, 50, 50)))

        with self.assertRaises(FillOutputError):
            generated_patch(Image.new("RGB", (17, 17)), inputs)


class ResultStoreTests(ResultsFolder):
    def test_a_result_reads_back_only_for_the_file_it_was_made_for(self) -> None:
        with TempMediaFolder() as root:
            media = write_image(root, "scene.png")
            sibling = write_image(root, "scene.jpg")
            asset = solid_asset(make_fill(FillBox(left=0, top=0, width=8, height=6)))

            save_result(media, asset)

            loaded = load_result(media, asset.fill.id)
            assert loaded is not None
            self.assertEqual(loaded.fill, asset.fill)
            self.assertEqual(loaded.generated.getpixel((3, 3)), MAGENTA)
            # Same stem, different file: whole-filename ownership.
            self.assertIsNone(load_result(sibling, asset.fill.id))

            discard_result(sibling, asset.fill.id)
            self.assertIsNotNone(load_result(media, asset.fill.id))
            discard_result(media, asset.fill.id)
            self.assertIsNone(load_result(media, asset.fill.id))

    def test_the_sweep_spares_young_and_active_results(self) -> None:
        with TempMediaFolder() as root:
            media = write_image(root, "scene.png")
            old = solid_asset(
                make_fill(FillBox(left=0, top=0, width=4, height=4), fill_id="1" * 32)
            )
            busy = solid_asset(
                make_fill(FillBox(left=0, top=0, width=4, height=4), fill_id="2" * 32)
            )
            young = solid_asset(
                make_fill(FillBox(left=0, top=0, width=4, height=4), fill_id="3" * 32)
            )
            for asset in (old, busy, young):
                save_result(media, asset)
            stale = time.time() - image_fill.FILL_RESULT_RETENTION_SECONDS - 60
            for fill_id in ("1" * 32, "2" * 32):
                os.utime(self.results / fill_id, (stale, stale))

            sweep_results({"2" * 32})

            self.assertIsNone(load_result(media, "1" * 32))
            self.assertIsNotNone(load_result(media, "2" * 32))
            self.assertIsNotNone(load_result(media, "3" * 32))


class ChainTests(ResultsFolder):
    def test_a_missing_fill_names_its_position_and_the_way_out(self) -> None:
        with TempMediaFolder() as root:
            media = write_image(root, "scene.png")
            fill = make_fill(FillBox(left=0, top=0, width=4, height=4))

            with self.assertRaisesRegex(FillUnavailableError, "fill 1 .*generate them again"):
                resolve_fill_chain(media, [fill], fill.source_digest)

    def test_a_replaced_original_invalidates_every_fill(self) -> None:
        with TempMediaFolder() as root:
            media = write_image(root, "scene.png")
            asset = solid_asset(make_fill(FillBox(left=0, top=0, width=4, height=4)))
            save_result(media, asset)

            with self.assertRaisesRegex(FillUnavailableError, "original changed"):
                resolve_fill_chain(media, [asset.fill], "f" * 64)

    def test_a_spec_that_disagrees_with_the_stored_fill_is_refused(self) -> None:
        with TempMediaFolder() as root:
            media = write_image(root, "scene.png")
            asset = solid_asset(make_fill(FillBox(left=0, top=0, width=4, height=4)))
            save_result(media, asset)
            moved = asset.fill.model_copy(update={"box": FillBox(left=1, top=0, width=4, height=4)})

            with self.assertRaisesRegex(FillUnavailableError, "does not match"):
                resolve_fill_chain(media, [moved], asset.fill.source_digest)

    def test_a_spec_whose_fills_skip_a_parent_does_not_validate(self) -> None:
        first = make_fill(FillBox(left=0, top=0, width=4, height=4), fill_id="1" * 32)
        orphan = make_fill(
            FillBox(left=0, top=0, width=4, height=4), fill_id="3" * 32, parent_id="2" * 32
        )

        with self.assertRaisesRegex(ValueError, "chain"):
            ImageEditSpec(fills=[first, orphan])
        # Removing an earlier fill drops the later ones with it.
        self.assertEqual(ImageEditSpec(fills=[first]).fills, [first])

    def test_a_spec_written_before_fills_existed_still_reads(self) -> None:
        self.assertEqual(ImageEditSpec.model_validate({"rotate": 90}).fills, [])


def _fill_for(media: Path, box: FillBox, **kwargs) -> ImageFill:
    return make_fill(box, digest=file_digest(edit_sidecars.original_path_for(media)), **kwargs)


class ApplyWithFillsTests(ResultsFolder):
    def test_a_kept_fill_renders_under_later_geometry_and_color_without_comfyui(self) -> None:
        with TempMediaFolder() as root:
            media = root / "scene.png"
            Image.new("RGB", (40, 20), GREY).save(media)
            asset = solid_asset(_fill_for(media, FillBox(left=0, top=0, width=10, height=20)))
            save_result(media, asset)

            # Any ComfyUI request would go through this; Apply must never make one.
            with patch("external.comfy_client.httpx.Client", side_effect=AssertionError("comfy")):
                image_edit.apply_image_edit(media, ImageEditSpec(fills=[asset.fill], mirror_h=True))
                with Image.open(media) as rendered:
                    self.assertEqual(rendered.convert("RGB").getpixel((39, 5)), MAGENTA[:3])
                    self.assertEqual(rendered.convert("RGB").getpixel((0, 5)), GREY)

                # Later edits reuse the archived pixels, even with the temporary result gone.
                discard_result(media, asset.fill.id)
                image_edit.apply_image_edit(
                    media, ImageEditSpec(fills=[asset.fill], rotate=90, scale=0.5)
                )
            with Image.open(media) as rendered:
                self.assertEqual(rendered.size, (10, 20))
                self.assertEqual(rendered.convert("RGB").getpixel((5, 0)), MAGENTA[:3])

    def test_the_archive_follows_the_saved_spec_and_revert_removes_it(self) -> None:
        with TempMediaFolder() as root:
            media = write_image(root, "scene.png", width=40, height=20)
            first = solid_asset(_fill_for(media, FillBox(left=0, top=0, width=10, height=20)))
            save_result(media, first)
            image_edit.apply_image_edit(media, ImageEditSpec(fills=[first.fill]))
            archive = edit_sidecars.fill_assets_path(media)
            self.assertTrue(archive.is_file())

            second = solid_asset(
                _fill_for(
                    media,
                    FillBox(left=20, top=0, width=10, height=20),
                    fill_id="b" * 32,
                    parent_id=first.fill.id,
                ),
                color=(0, 255, 0, 255),
            )
            save_result(media, second)
            image_edit.apply_image_edit(media, ImageEditSpec(fills=[first.fill, second.fill]))
            with zipfile.ZipFile(archive) as opened:
                self.assertEqual(
                    {name.split("/")[0] for name in opened.namelist()},
                    {first.fill.id, second.fill.id},
                )

            image_edit.revert_image_edit(media)
            self.assertFalse(archive.exists())
            self.assertFalse(edit_sidecars.backup_path_for(media).exists())

    def test_a_failed_publish_leaves_the_saved_edit_reopenable(self) -> None:
        with TempMediaFolder() as root:
            media = write_image(root, "scene.png", width=40, height=20)
            first = solid_asset(_fill_for(media, FillBox(left=0, top=0, width=10, height=20)))
            save_result(media, first)
            image_edit.apply_image_edit(media, ImageEditSpec(fills=[first.fill]))
            discard_result(media, first.fill.id)
            published = media.read_bytes()

            with patch("edit_sidecars.publish_replacing", side_effect=OSError("disk full")):
                with self.assertRaises(OSError):
                    image_edit.apply_image_edit(media, ImageEditSpec(rotate=90))

            self.assertEqual(media.read_bytes(), published)
            saved = image_edit.read_image_edit_spec(media)
            assert saved is not None
            self.assertEqual(saved.fills, [first.fill])
            # Its pixels are still there to render from.
            image_edit.apply_image_edit(media, ImageEditSpec(fills=[first.fill], rotate=180))

    def test_a_missing_fill_fails_the_apply_and_keeps_the_live_file(self) -> None:
        with TempMediaFolder() as root:
            media = write_image(root, "scene.png", width=40, height=20)
            before = media.read_bytes()
            fill = _fill_for(media, FillBox(left=0, top=0, width=10, height=20))

            with self.assertRaises(FillUnavailableError):
                image_edit.apply_image_edit(media, ImageEditSpec(fills=[fill]))

            self.assertEqual(media.read_bytes(), before)

    def test_fills_are_drawn_in_the_oriented_frame(self) -> None:
        with TempMediaFolder() as root:
            # Stored 40 x 20 and turned a quarter by EXIF: the editor sees 20 x 40.
            media = write_jpeg(
                root, "turned.jpg", width=40, height=20, color=(0, 0, 0), orientation=6
            )
            fill = _fill_for(media, FillBox(left=0, top=0, width=20, height=10))
            asset = solid_asset(fill, color=(255, 255, 255, 255))
            save_result(media, asset)

            image_edit.apply_image_edit(media, ImageEditSpec(fills=[fill]))

            with Image.open(media) as rendered:
                upright = rendered.convert("RGB")
                self.assertEqual(upright.size, (20, 40))
                self.assertGreater(upright.getpixel((10, 4))[0], 200)
                self.assertLess(upright.getpixel((10, 30))[0], 60)


class RelatedFileTests(ResultsFolder):
    def _edited(self, root: Path, name: str) -> Path:
        media = write_image(root, name, width=40, height=20)
        asset = solid_asset(_fill_for(media, FillBox(left=0, top=0, width=10, height=20)))
        save_result(media, asset)
        image_edit.apply_image_edit(media, ImageEditSpec(fills=[asset.fill]))
        return media

    def test_same_stem_siblings_never_share_fill_pixels(self) -> None:
        with TempMediaFolder() as root:
            png = self._edited(root, "scene.png")
            jpg = write_image(root, "scene.jpg")

            self.assertIn(edit_sidecars.fill_assets_path(png), media_group_paths(png))
            self.assertNotIn(edit_sidecars.fill_assets_path(png), media_group_paths(jpg))
            self.assertFalse(edit_sidecars.fill_assets_path(jpg).exists())

    def test_rename_takes_the_archive_and_the_edit_still_reopens(self) -> None:
        with TempMediaFolder() as root:
            media = self._edited(root, "scene.png")

            rename_media_file(media, "renamed")

            renamed = root / "renamed.png"
            self.assertTrue(edit_sidecars.fill_assets_path(renamed).is_file())
            self.assertFalse(edit_sidecars.fill_assets_path(media).exists())
            spec = image_edit.read_image_edit_spec(renamed)
            assert spec is not None
            # The temporary result was made for the old name, so only the archive can serve this.
            image_edit.apply_image_edit(renamed, spec.model_copy(update={"rotate": 90}))

    def test_copy_brings_the_archive_along(self) -> None:
        with TempMediaFolder() as root:
            media = self._edited(root, "scene.png")
            target = root / "elsewhere"
            target.mkdir()

            transfer_media_with_sidecars(media, target, mode="copy")

            copied = target / "scene.png"
            self.assertTrue(edit_sidecars.fill_assets_path(copied).is_file())
            spec = image_edit.read_image_edit_spec(copied)
            assert spec is not None
            image_edit.apply_image_edit(copied, spec.model_copy(update={"mirror_v": True}))

    def test_adopting_an_external_replacement_discards_the_archive(self) -> None:
        with TempMediaFolder() as root:
            media = self._edited(root, "scene.png")
            Image.new("RGB", (30, 30), (1, 2, 3)).save(media)

            response = image_edit.apply_image_edit(media, ImageEditSpec(rotate=90))

            self.assertTrue(response.replaced_externally)
            self.assertFalse(edit_sidecars.fill_assets_path(media).exists())

    def test_the_archive_is_valid_json_and_png_inside(self) -> None:
        with TempMediaFolder() as root:
            media = self._edited(root, "scene.png")

            with zipfile.ZipFile(edit_sidecars.fill_assets_path(media)) as opened:
                metas = [name for name in opened.namelist() if name.endswith("fill.json")]
                self.assertEqual(len(metas), 1)
                self.assertIn("source_digest", json.loads(opened.read(metas[0])))


class ApplyFillChainTests(unittest.TestCase):
    def test_fills_apply_in_order(self) -> None:
        base = Image.new("RGBA", (20, 10), (0, 0, 0, 255))
        first = solid_asset(make_fill(FillBox(left=0, top=0, width=15, height=10)), color=MAGENTA)
        second = solid_asset(
            make_fill(FillBox(left=10, top=0, width=10, height=10), fill_id="b" * 32),
            color=(0, 255, 0, 255),
        )

        result = apply_fill_chain(base, [first, second])

        self.assertEqual(result.getpixel((5, 5)), MAGENTA)
        self.assertEqual(result.getpixel((12, 5)), (0, 255, 0, 255))


if __name__ == "__main__":
    unittest.main()
