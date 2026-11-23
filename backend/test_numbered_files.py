from __future__ import annotations

import threading
import unittest
from pathlib import Path

from media_claims import claim
from numbered_files import next_number, publish_numbered, sweep_temporary_files, temporary_file
from testing_fixtures import TempMediaFolder


def publish(folder: Path, first: int = 1) -> Path:
    with temporary_file(folder) as temp_path:
        temp_path.write_bytes(b"new")
        return publish_numbered(temp_path, folder, "shot", ".png", first, "generate")


class NumberedFileTests(unittest.TestCase):
    def test_numbers_continue_past_the_highest_used_by_any_file(self) -> None:
        with TempMediaFolder() as folder:
            (folder / "shot_0007.txt").write_text("a caption", encoding="utf-8")

            self.assertEqual(next_number(folder, "shot"), 8)

    def test_a_taken_name_is_never_replaced_and_no_temporary_file_stays(self) -> None:
        with TempMediaFolder() as folder:
            (folder / "shot_0001.png").write_bytes(b"old")

            self.assertEqual(publish(folder).name, "shot_0002.png")
            self.assertEqual((folder / "shot_0001.png").read_bytes(), b"old")
            names = sorted(entry.name for entry in folder.iterdir())
            self.assertEqual(names, ["shot_0001.png", "shot_0002.png"])

    def test_a_name_another_writer_holds_is_passed_over(self) -> None:
        with TempMediaFolder() as folder:
            held, done = threading.Event(), threading.Event()

            def hold() -> None:
                with claim([folder / "shot_0001.png"], "export"):
                    held.set()
                    done.wait(5)

            writer = threading.Thread(target=hold)
            writer.start()
            try:
                held.wait(5)
                self.assertEqual(publish(folder).name, "shot_0002.png")
            finally:
                done.set()
                writer.join()

    def test_sweeping_removes_only_leftover_temporary_files(self) -> None:
        with TempMediaFolder() as folder:
            (folder / ".generate-abc.tmp").write_bytes(b"partial")
            (folder / "shot_0001.png").write_bytes(b"kept")

            sweep_temporary_files(folder)

            self.assertEqual([entry.name for entry in folder.iterdir()], ["shot_0001.png"])


if __name__ == "__main__":
    unittest.main()
