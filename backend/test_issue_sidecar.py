from __future__ import annotations

from testing_fixtures import isolate_test_database

isolate_test_database()

import json
import unittest

from captions import (
    IssueSummary,
    delete_issue_file,
    issue_file_path,
    load_issue_summary,
    normalize_issue_fixes,
    save_issue_findings,
)
from constants import MAX_ISSUE_FIXES, MAX_RULE_FINDINGS
from testing_fixtures import TempMediaFolder, write_issue_sidecar, write_media


class NormalizeIssueFixesTests(unittest.TestCase):
    def test_cleans_quotes_and_commas_idempotently(self) -> None:
        cases = [
            ('the caption claims "test test"', 'the caption claims "test test"'),
            (r"the caption claims \"test test,\"", 'the caption claims "test test"'),
            (r'the caption claims \\"test test,\\"', 'the caption claims "test test"'),
            ("Replace “blue, green,” with „red,”.", 'Replace "blue, green" with "red".'),
            ('Remove "lake,,," and "trees,  ".', 'Remove "lake" and "trees".'),
            (r'Keep C:\Photos and \n; "blue, green!"', r'Keep C:\Photos and \n; "blue, green!"'),
            ('An unmatched "lake,', 'An unmatched "lake,'),
            ('Keep "lake", then "trees".', 'Keep "lake", then "trees".'),
            ("  Plain text.  ", "Plain text."),
        ]
        for original, expected in cases:
            with self.subTest(original=original):
                normalized = normalize_issue_fixes([original])
                self.assertEqual(normalized, [expected])
                self.assertEqual(normalize_issue_fixes(normalized), normalized)
        self.assertEqual(normalize_issue_fixes(["", "  "]), [])


class LoadIssueSummaryTests(unittest.TestCase):
    def test_cleans_existing_sidecar_without_rewriting_it(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            write_issue_sidecar(media, r"The caption claims \"a blue lake,\".")
            path = issue_file_path(media)
            original = path.read_bytes()

            self.assertEqual(
                load_issue_summary(media),
                IssueSummary(['The caption claims "a blue lake".'], [], True),
            )
            self.assertEqual(path.read_bytes(), original)

    def test_reports_nothing_when_no_sidecar_exists(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")

            self.assertEqual(load_issue_summary(media), IssueSummary([], [], False))

    def test_reads_the_fixes_array(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            write_issue_sidecar(media, 'Replace "a blue lake" with "a harbour".', 'Remove "dusk".')

            self.assertEqual(
                load_issue_summary(media),
                IssueSummary(
                    ['Replace "a blue lake" with "a harbour".', 'Remove "dusk".'], [], True
                ),
            )

    def test_caps_the_fix_list(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            write_issue_sidecar(media, *[f"Fix {index}." for index in range(MAX_ISSUE_FIXES + 2)])

            fixes, _rules, has_issue_file, *_revisions = load_issue_summary(media)

            self.assertEqual(len(fixes), MAX_ISSUE_FIXES)
            self.assertTrue(has_issue_file)

    def test_superseded_sidecars_read_as_broken_rather_than_resolved(self) -> None:
        """An unknown shape is not translated: a re-run of the job rewrites it."""
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            issue_file_path(media).write_text(
                '{"correct": false, "issues": "Wrong lake.", "suggestions": "Say harbour."}',
                encoding="utf-8",
            )

            self.assertEqual(load_issue_summary(media), IssueSummary([], [], True))

    def test_unreadable_sidecars_read_as_broken(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            issue_file_path(media).write_text("{not json", encoding="utf-8")

            self.assertEqual(load_issue_summary(media), IssueSummary([], [], True))


class SaveIssueFixesTests(unittest.TestCase):
    def test_normalized_quotes_round_trip_as_valid_json(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            save_issue_findings(
                media, "fixes", [r'Replace \\"blue lake,\\" with \"river,\".'], revision=None
            )

            expected = ['Replace "blue lake" with "river".']
            payload = json.loads(issue_file_path(media).read_text(encoding="utf-8"))
            self.assertEqual(payload, {"fixes": expected})
            self.assertEqual(load_issue_summary(media), IssueSummary(expected, [], True))

    def test_writes_the_fixes_it_is_given(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")

            save_issue_findings(media, "fixes", ['Remove "dusk".'], revision=None)

            payload = json.loads(issue_file_path(media).read_text(encoding="utf-8"))
            self.assertEqual(payload, {"fixes": ['Remove "dusk".']})

    def test_caps_the_list(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")

            save_issue_findings(
                media,
                "fixes",
                [f"Fix {index}." for index in range(MAX_ISSUE_FIXES + 2)],
                revision=None,
            )

            self.assertEqual(len(load_issue_summary(media)[0]), MAX_ISSUE_FIXES)

    def test_removes_the_sidecar_when_there_are_no_fixes(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            write_issue_sidecar(media, 'Remove "dusk".')

            save_issue_findings(media, "fixes", [], revision=None)

            self.assertFalse(issue_file_path(media).exists())

    def test_writes_nothing_when_there_was_no_sidecar_to_begin_with(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")

            save_issue_findings(media, "fixes", [], revision=None)

            self.assertFalse(issue_file_path(media).exists())


class IssueSourcesTests(unittest.TestCase):
    """Verify captions and the caption rules share one sidecar without clobbering each other."""

    def test_saving_rule_hits_keeps_the_model_findings(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            write_issue_sidecar(media, "The caption omits the mountains.")

            save_issue_findings(media, "rules", ['Flagged "floating".'], revision=None)

            self.assertEqual(
                load_issue_summary(media),
                IssueSummary(["The caption omits the mountains."], ['Flagged "floating".'], True),
            )

    def test_saving_model_findings_keeps_the_rule_hits(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            write_issue_sidecar(media, "Old finding.", rules=('Flagged "floating".',))

            save_issue_findings(media, "fixes", ["The caption omits the mountains."], revision=None)

            self.assertEqual(
                load_issue_summary(media),
                IssueSummary(["The caption omits the mountains."], ['Flagged "floating".'], True),
            )

    def test_a_clean_verdict_leaves_the_rule_hits_behind(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            write_issue_sidecar(media, "Old finding.", rules=('Flagged "floating".',))

            save_issue_findings(media, "fixes", [], revision=None)

            payload = json.loads(issue_file_path(media).read_text(encoding="utf-8"))
            self.assertEqual(payload, {"rules": ['Flagged "floating".']})

    def test_each_source_keeps_the_caption_revision_it_checked(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")

            save_issue_findings(media, "fixes", ["The caption omits the mountains."], revision="a1")
            save_issue_findings(media, "rules", ['Flagged "floating".'], revision="b2")

            summary = load_issue_summary(media)
            self.assertEqual((summary.fixes_revision, summary.rules_revision), ("a1", "b2"))

    def test_a_clean_source_drops_only_its_own_revision(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            save_issue_findings(media, "fixes", ["The caption omits the mountains."], revision="a1")
            save_issue_findings(media, "rules", ['Flagged "floating".'], revision="b2")

            save_issue_findings(media, "fixes", [], revision="c3")

            payload = json.loads(issue_file_path(media).read_text(encoding="utf-8"))
            self.assertEqual(
                payload, {"rules": ['Flagged "floating".'], "checked": {"rules": "b2"}}
            )

    def test_a_recheck_without_a_revision_forgets_the_old_one(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            save_issue_findings(media, "rules", ['Flagged "floating".'], revision="b2")

            save_issue_findings(media, "rules", ['Flagged "drifting".'], revision=None)

            self.assertIsNone(load_issue_summary(media).rules_revision)

    def test_the_sidecar_goes_once_both_sources_are_clean(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            write_issue_sidecar(media, rules=('Flagged "floating".',))

            save_issue_findings(media, "rules", [], revision=None)

            self.assertFalse(issue_file_path(media).exists())

    def test_rule_hits_are_kept_verbatim_up_to_the_cap(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            hits = [f'Flagged "term {index}".' for index in range(MAX_RULE_FINDINGS + 2)]
            write_issue_sidecar(media, rules=tuple(hits))

            self.assertEqual(load_issue_summary(media).rules, hits[:MAX_RULE_FINDINGS])

    def test_an_unreadable_sidecar_is_replaced_by_the_new_findings(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            issue_file_path(media).write_text("{not json", encoding="utf-8")

            save_issue_findings(media, "rules", ['Flagged "floating".'], revision=None)

            self.assertEqual(
                load_issue_summary(media), IssueSummary([], ['Flagged "floating".'], True)
            )


class SidecarNamingTests(unittest.TestCase):
    """One sidecar per media file, not per stem, so ``clip.mp4`` and ``clip.png`` cannot share one."""

    def test_the_name_carries_the_media_extension(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "clip.png")

            self.assertEqual(issue_file_path(media).name, "clip.png.issue.json")

    def test_two_media_under_one_stem_keep_their_own_findings(self) -> None:
        with TempMediaFolder() as root:
            first = write_media(root, "clip.png")
            second = write_media(root, "clip.jpg")

            save_issue_findings(first, "fixes", ["The caption omits the mountains."], revision=None)
            save_issue_findings(
                second, "fixes", ["The caption says dusk, the sky is bright."], revision=None
            )

            self.assertEqual(load_issue_summary(first)[0], ["The caption omits the mountains."])
            self.assertEqual(
                load_issue_summary(second)[0], ["The caption says dusk, the sky is bright."]
            )

    def test_clearing_one_leaves_the_other_alone(self) -> None:
        """The bug itself: the clean file's clear took the flagged file's findings."""
        with TempMediaFolder() as root:
            flagged = write_media(root, "clip.png")
            clean = write_media(root, "clip.jpg")
            save_issue_findings(
                flagged, "fixes", ["The caption omits the mountains."], revision=None
            )

            save_issue_findings(clean, "fixes", [], revision=None)

            self.assertEqual(
                load_issue_summary(flagged),
                IssueSummary(["The caption omits the mountains."], [], True),
            )

    def test_deleting_removes_only_this_file_findings(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "clip.png")
            stem_sharer = write_media(root, "clip.jpg")
            save_issue_findings(media, "fixes", ["The caption omits the mountains."], revision=None)
            save_issue_findings(
                stem_sharer, "fixes", ["The caption says dusk, the sky is bright."], revision=None
            )

            delete_issue_file(media)

            self.assertFalse(issue_file_path(media).exists())
            self.assertTrue(issue_file_path(stem_sharer).is_file())


if __name__ == "__main__":
    unittest.main()
