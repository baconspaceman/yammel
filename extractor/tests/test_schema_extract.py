import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve()
AP_ROOT = Path(
    os.environ.get("AP_ROOT", HERE.parents[3] / "archipelago-dev" / "Archipelago")
)
sys.path.insert(0, str(AP_ROOT))
sys.path.insert(0, str(HERE.parents[1]))

import settings  # noqa: E402  (needs AP_ROOT on sys.path)

settings.skip_autosave = True
import Options as O  # noqa: E402
import schema_extract as S  # noqa: E402


class DemoToggle(O.Toggle):
    """Demo toggle."""


class DemoOnToggle(O.DefaultOnToggle):
    """Demo toggle that starts on."""


class DemoChoice(O.Choice):
    """Pick one.

    Second paragraph."""
    display_name = "Demo Choice"
    option_easy = 0
    option_hard = 1
    alias_difficult = 1
    default = 0


class DemoRange(O.Range):
    """Pick a number."""
    range_start = 1
    range_end = 10
    default = 5


class DemoNamedRange(O.NamedRange):
    """Pick a number or a name."""
    range_start = 0
    range_end = 100
    default = 50
    special_range_names = {"none": 0, "all": 100}


class DemoItems(O.ItemSet):
    """Some items."""


class DemoLocations(O.LocationSet):
    """Some locations."""


class DemoText(O.FreeText):
    """Free words."""
    default = "hello"


class OddChoice(O.Choice):
    """A world bug: one value is a tuple (a stray trailing comma), as in A Link to the Past."""
    option_slow = 0
    option_fast = (4,)
    default = 0


class WordedRange(O.NamedRange):
    """A named range with one name that stands for a word, not a number (Final Fantasy Tactics Advance does this)."""
    range_start = 0
    range_end = 100
    default = 10
    special_range_names = {"none": 0, "individually-randomized": "individually-randomized"}


class OptionToDictTests(unittest.TestCase):
    def test_named_range_keeps_word_names_apart_instead_of_failing(self):
        out = S.option_to_dict("gil", WordedRange)
        self.assertEqual(out["kind"], "named_range")
        self.assertEqual(out["specialNames"], {"none": 0})
        self.assertEqual(out["extraWords"], ["individually-randomized"])

    def test_option_set_exports_allowed_names(self):
        class Minigames(O.OptionSet):
            valid_keys = {"Crabs", "Hover Blasters"}
        out = S.option_to_dict("excluded", Minigames)
        self.assertEqual(out["kind"], "set")
        self.assertEqual(out["validKeys"], ["Crabs", "Hover Blasters"])

    def test_choice_with_a_non_int_value_does_not_crash(self):
        out = S.option_to_dict("speed", OddChoice)
        self.assertEqual({c["key"] for c in out["choices"]}, {"slow", "fast"})

    def test_toggle_defaults_are_booleans(self):
        self.assertEqual(S.option_to_dict("t", DemoToggle)["default"], False)
        self.assertEqual(S.option_to_dict("t", DemoOnToggle)["default"], True)
        self.assertEqual(S.option_to_dict("t", DemoToggle)["kind"], "toggle")

    def test_choice_lists_keys_aliases_and_default(self):
        out = S.option_to_dict("difficulty", DemoChoice)
        self.assertEqual(out["kind"], "choice")
        self.assertEqual([c["key"] for c in out["choices"]], ["easy", "hard"])
        self.assertEqual(out["aliases"], {"difficult": "hard"})
        self.assertEqual(out["default"], "easy")
        self.assertEqual(out["displayName"], "Demo Choice")
        self.assertEqual(out["description"], "Pick one.\n\nSecond paragraph.")

    def test_range_has_bounds(self):
        out = S.option_to_dict("lives", DemoRange)
        self.assertEqual((out["kind"], out["min"], out["max"], out["default"]), ("range", 1, 10, 5))

    def test_named_range_has_special_names(self):
        out = S.option_to_dict("amount", DemoNamedRange)
        self.assertEqual(out["kind"], "named_range")
        self.assertEqual(out["specialNames"], {"none": 0, "all": 100})

    def test_item_and_location_sets_have_domains(self):
        self.assertEqual(S.option_to_dict("i", DemoItems)["domain"], "items")
        self.assertEqual(S.option_to_dict("l", DemoLocations)["domain"], "locations")
        self.assertEqual(S.option_to_dict("i", DemoItems)["default"], [])

    def test_free_text(self):
        out = S.option_to_dict("note", DemoText)
        self.assertEqual((out["kind"], out["default"]), ("free_text", "hello"))

    def test_visibility_names(self):
        out = S.option_to_dict("t", DemoToggle)
        self.assertEqual(out["visibility"], ["template", "simple_ui", "complex_ui", "spoiler"])


class LoadFailuresTests(unittest.TestCase):
    def test_failed_loads_become_sorted_error_entries(self):
        failed = {"Zeta": "ImportError: no", "Alpha": "SyntaxError: bad"}
        self.assertEqual(
            S.load_failures(failed),
            [
                {"game": "Alpha", "error": "SyntaxError: bad"},
                {"game": "Zeta", "error": "ImportError: no"},
            ],
        )

    def test_no_failures_gives_empty_list(self):
        self.assertEqual(S.load_failures({}), [])


class WriteSchemaFileTests(unittest.TestCase):
    def test_empty_games_leaves_existing_file_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "schema.json"
            out.write_bytes(b'{"good":true}')
            self.assertFalse(S.write_schema_file({"games": {}, "errors": []}, out))
            self.assertEqual(out.read_bytes(), b'{"good":true}')
            self.assertEqual([p.name for p in Path(tmp).iterdir()], ["schema.json"])

    def test_non_empty_replaces_file_and_leaves_no_tmp(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "schema.json"
            out.write_bytes(b"old")
            result = {"games": {"G": {}}, "errors": []}
            self.assertTrue(S.write_schema_file(result, out))
            self.assertEqual(json.loads(out.read_text(encoding="utf-8")), result)
            self.assertEqual([p.name for p in Path(tmp).iterdir()], ["schema.json"])


class FullExtractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = S.extract(AP_ROOT)

    def test_many_games_and_json_safe(self):
        self.assertGreater(len(self.result["games"]), 50)
        json.dumps(self.result)

    def test_every_option_has_a_known_kind(self):
        for game in self.result["games"].values():
            for option in game["options"].values():
                self.assertIn(option["kind"], S.KINDS, f"{game['name']}.{option['key']}")

    def test_groups_cover_every_option_exactly_once(self):
        for game in self.result["games"].values():
            listed = [key for group in game["groups"] for key in group["options"]]
            self.assertEqual(sorted(listed), sorted(game["options"]), game["name"])

    def test_choice_defaults_are_valid_choices(self):
        for game in self.result["games"].values():
            for option in game["options"].values():
                if option["kind"] == "choice":
                    keys = {c["key"] for c in option["choices"]} | {"random"}
                    self.assertIn(option["default"], keys, f"{game['name']}.{option['key']}")


if __name__ == "__main__":
    unittest.main()
