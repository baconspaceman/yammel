"""Loading custom .apworld files one at a time, against the real Archipelago source folder."""
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve()
AP_ROOT = Path(os.environ.get("AP_ROOT", HERE.parents[3] / "archipelago-dev" / "Archipelago"))
sys.path.insert(0, str(AP_ROOT))
sys.path.insert(0, str(HERE.parents[1]))

import settings  # noqa: E402

settings.skip_autosave = True
settings.no_gui = True
import schema_extract as S  # noqa: E402

TINY = '''
from dataclasses import dataclass
from Options import PerGameCommonOptions, Toggle, Range
from worlds.AutoWorld import World


class TinyToggle(Toggle):
    """A tiny switch."""
    display_name = "Tiny switch"


class TinyRange(Range):
    """A tiny number."""
    range_start = 1
    range_end = 5
    default = 3


@dataclass
class TinyOptions(PerGameCommonOptions):
    tiny_toggle: TinyToggle
    tiny_range: TinyRange


class TinyWorld(World):
    """Tiny."""
    game = "Tiny Custom Test Game"
    options_dataclass = TinyOptions
    item_name_to_id = {}
    location_name_to_id = {}
'''

BROKEN = "def (:\n    this is not python\n"


def make_apworld(folder: Path, name: str, source: str) -> None:
    with zipfile.ZipFile(folder / f"{name}.apworld", "w") as z:
        z.writestr(f"{name}/__init__.py", source)


class CustomWorldsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.folder = Path(cls.tmp.name)
        make_apworld(cls.folder, "tiny_custom_test", TINY)
        make_apworld(cls.folder, "broken_custom_test", BROKEN)
        (cls.folder / "notes.txt").write_text("not a world", encoding="utf-8")
        cls.result = S.extract(AP_ROOT, cls.folder, True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_the_good_world_is_found_with_its_options_and_its_file(self):
        game = self.result["games"]["Tiny Custom Test Game"]
        self.assertEqual(game["customFile"], "tiny_custom_test.apworld")
        self.assertIn("tiny_toggle", game["options"])
        self.assertEqual(game["options"]["tiny_range"]["kind"], "range")
        self.assertEqual(game["options"]["tiny_range"]["default"], 3)

    def test_only_custom_games_are_kept(self):
        self.assertEqual(list(self.result["games"]), ["Tiny Custom Test Game"])

    def test_a_broken_world_is_reported_and_does_not_stop_the_good_one(self):
        files = [p["file"] for p in self.result["customProblems"]]
        self.assertEqual(files, ["broken_custom_test.apworld"])
        self.assertTrue(self.result["customProblems"][0]["error"])

    def test_result_is_json_safe(self):
        json.dumps(self.result)

    def test_a_game_that_is_already_loaded_is_skipped_quietly(self):
        folder = Path(self.tmp.name) / "again"
        folder.mkdir()
        make_apworld(folder, "tiny_custom_test", TINY)  # same game, now already registered
        result = S.extract(AP_ROOT, folder, True)
        self.assertEqual(result["games"], {})
        self.assertEqual(result["customProblems"], [])


if __name__ == "__main__":
    unittest.main()
