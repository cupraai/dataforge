import asyncio
import os
import tempfile
import unittest
from itertools import chain, repeat
from pathlib import Path
from unittest.mock import patch

import events
from comfy_preset_watch import run_comfy_preset_feed
from external.comfy_workflows import comfy_presets_fingerprint


class ComfyPresetFeedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        events.clear_subscribers_for_tests()
        self.addCleanup(events.clear_subscribers_for_tests)
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.presets = Path(temp.name)
        self.enterContext(patch.dict(os.environ, {"COMFY_WORKFLOWS_DIR": temp.name}))
        self.enterContext(patch("comfy_preset_watch.SCAN_SECONDS", 0.01))
        self.enterContext(patch("comfy_preset_watch.IDLE_SECONDS", 0.01))

    def _run_feed(self) -> None:
        task = asyncio.create_task(run_comfy_preset_feed())
        self.addCleanup(task.cancel)

    async def _announced(self, subscriber: events.Subscriber) -> None:
        self.assertEqual(await subscriber.next_event(2.0), {"type": "comfy_presets"})

    async def test_every_change_to_the_folder_is_announced_once(self) -> None:
        preset = self.presets / "first.json"
        with events.subscribe() as subscriber:
            self._run_feed()
            # A tab may have read the list before the first scan.
            await self._announced(subscriber)
            self.assertIsNone(await subscriber.next_event(0.1))

            preset.write_text("{}", encoding="utf-8")
            await self._announced(subscriber)

            preset.write_text('{"1": {}}', encoding="utf-8")
            await self._announced(subscriber)

            preset.rename(self.presets / "second.json")
            await self._announced(subscriber)

            (self.presets / "second.json").unlink()
            await self._announced(subscriber)
            self.assertIsNone(await subscriber.next_event(0.1))

    async def test_files_that_are_not_presets_are_ignored(self) -> None:
        with events.subscribe() as subscriber:
            self._run_feed()
            await self._announced(subscriber)

            (self.presets / "notes.txt").write_text("x", encoding="utf-8")
            self.assertIsNone(await subscriber.next_event(0.1))

    async def test_a_change_while_no_tab_is_open_reaches_the_next_one(self) -> None:
        with events.subscribe() as subscriber:
            self._run_feed()
            await self._announced(subscriber)

        await asyncio.sleep(0.05)
        (self.presets / "added.json").write_text("{}", encoding="utf-8")

        with events.subscribe() as subscriber:
            await self._announced(subscriber)

    async def test_nothing_is_scanned_without_a_tab(self) -> None:
        with patch("comfy_preset_watch.comfy_presets_fingerprint") as scan:
            self._run_feed()
            await asyncio.sleep(0.1)

            scan.assert_not_called()

    async def test_a_failing_scan_does_not_kill_the_feed(self) -> None:
        with (
            events.subscribe() as subscriber,
            patch(
                "comfy_preset_watch.comfy_presets_fingerprint",
                side_effect=chain([OSError("drive gone")], repeat("a")),
            ),
        ):
            self._run_feed()
            await self._announced(subscriber)


class FingerprintTests(unittest.TestCase):
    def test_a_missing_folder_has_an_empty_fingerprint(self) -> None:
        with (
            tempfile.TemporaryDirectory() as temp,
            patch.dict(os.environ, {"COMFY_WORKFLOWS_DIR": str(Path(temp, "gone"))}),
        ):
            self.assertEqual(comfy_presets_fingerprint(), "")


if __name__ == "__main__":
    unittest.main()
