import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve()
AP_ROOT = Path(os.environ.get("AP_ROOT", HERE.parents[3] / "archipelago-dev" / "Archipelago"))
ENGINE = HERE.parents[1] / "seed_engine.py"
PYTHON = AP_ROOT / ".venv" / "Scripts" / "python.exe"
sys.path.insert(0, str(AP_ROOT))
sys.path.insert(0, str(HERE.parents[1]))

import seed_engine as E  # noqa: E402


class ClassifyValueTests(unittest.TestCase):
    def test_random_forms_are_unresolved(self):
        for text in ("random", "Random", "random-low", "random-middle", "random-high", "random-range-1-5", "random-range-low-1-5"):
            self.assertTrue(E.is_random_text(text), text)

    def test_ordinary_text_is_not_random(self):
        for text in ("random_balanced", "randomized", "easy", "", "Randomizer fan"):
            self.assertFalse(E.is_random_text(text), text)
        self.assertFalse(E.is_random_text(5))
        self.assertFalse(E.is_random_text(True))


class CountTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = E.Engine(AP_ROOT)

    def test_default_count_of_a_small_game(self):
        result = self.engine.count("APQuest", {})
        self.assertEqual(result["checks"], 6)
        self.assertEqual((result["unresolved"], result["invalid"]), ([], []))

    def test_an_option_changes_the_count(self):
        self.assertEqual(self.engine.count("APQuest", {"extra_starting_chest": True})["checks"], 7)

    def test_random_and_weighted_values_are_left_at_default_and_reported(self):
        result = self.engine.count("APQuest", {"extra_starting_chest": "random", "hard_mode": {"true": 50, "false": 50}})
        self.assertEqual(result["checks"], 6)
        self.assertEqual(sorted(result["unresolved"]), ["extra_starting_chest", "hard_mode"])

    def test_invalid_and_unknown_options_are_reported_not_fatal(self):
        result = self.engine.count("APQuest", {"extra_starting_chest": True, "no_such_option": 1, "hard_mode": "banana"})
        self.assertEqual(result["checks"], 7)
        keys = sorted(item["key"] for item in result["invalid"])
        self.assertEqual(keys, ["hard_mode", "no_such_option"])

    def test_unknown_game_is_an_error_result(self):
        with self.assertRaises(E.EngineError) as ctx:
            self.engine.count("Not A Real Game", {})
        self.assertEqual(ctx.exception.code, "unknown_game")

    def test_every_visible_game_can_be_counted(self):
        failures = {}
        for game in self.engine.visible_games():
            try:
                result = self.engine.count(game, {})
                self.assertGreaterEqual(result["checks"], 0)
            except Exception as exc:  # noqa: BLE001
                failures[game] = f"{type(exc).__name__}: {exc}"
        self.assertEqual(failures, {})

    def test_the_engine_never_writes_files(self):
        import tempfile

        import settings

        self.assertTrue(sys.dont_write_bytecode, "no .pyc files may be written into the Archipelago folder")
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "host.yaml"
            # Archipelago itself saves a new host.yaml when it cannot find one; the engine must have disabled that.
            settings.Settings.save(settings.get_settings(), str(target))
            self.assertFalse(target.exists())

    def test_counting_is_repeatable(self):
        first = self.engine.count("A Hat in Time", {})["checks"]
        second = self.engine.count("A Hat in Time", {})["checks"]
        self.assertEqual(first, second)


class ScanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = E.Engine(AP_ROOT)

    def test_scan_reports_size_openness_and_needs_of_a_small_game(self):
        result = self.engine.scan("APQuest")
        self.assertEqual(result["checks"], 6)
        self.assertIsInstance(result["earlyOpen"], int)
        self.assertLessEqual(result["earlyOpen"], result["checks"])
        self.assertIs(result["needsFile"], False)
        self.assertEqual(result["systems"], [])

    def test_a_game_that_needs_a_rom_says_so_without_opening_a_window(self):
        import settings

        self.assertTrue(settings.no_gui, "a missing required file must raise an error, never open a file-picker")
        self.assertIs(self.engine.scan("Super Mario World")["needsFile"], True)

    def test_bizhawk_systems_come_from_the_client_registry(self):
        self.assertIn("GB", self.engine.scan("Pokemon Red and Blue")["systems"])

    def test_unknown_game_is_an_error(self):
        with self.assertRaises(E.EngineError):
            self.engine.scan("Not A Real Game")

    def test_scan_all_covers_every_visible_game_and_lists_failures_instead_of_raising(self):
        result = self.engine.scan_all()
        self.assertEqual(sorted(result["games"]) + sorted(result["failed"]), self.engine.visible_games())
        self.assertGreater(len(result["games"]), 70)

    def test_scan_over_the_protocol(self):
        process = subprocess.run(
            [str(PYTHON), "-W", "ignore", str(ENGINE), "--ap-root", str(AP_ROOT)],
            input="\n".join([json.dumps({"id": 1, "op": "scan", "game": "APQuest"}), json.dumps({"id": 2, "op": "scan", "game": "Nope"})]) + "\n",
            capture_output=True,
            text=True,
            timeout=120,
        )
        out = [json.loads(line) for line in process.stdout.splitlines() if line.strip()]
        self.assertEqual((out[1]["id"], out[1]["ok"], out[1]["checks"]), (1, True, 6))
        self.assertEqual((out[2]["ok"], out[2]["error"]), (False, "unknown_game"))


class ProtocolTests(unittest.TestCase):
    def run_engine(self, lines):
        process = subprocess.run(
            [str(PYTHON), "-W", "ignore", str(ENGINE), "--ap-root", str(AP_ROOT)],
            input="\n".join(lines) + "\n",
            capture_output=True,
            text=True,
            timeout=120,
        )
        out = [json.loads(line) for line in process.stdout.splitlines() if line.strip()]
        return process, out

    def test_ready_event_replies_in_order_and_quit_ends_the_process(self):
        host_yaml = AP_ROOT / "host.yaml"
        before = host_yaml.stat().st_mtime_ns if host_yaml.exists() else None
        process, out = self.run_engine(
            [
                json.dumps({"id": 1, "op": "count", "game": "APQuest", "options": {}}),
                "this is not json",
                json.dumps({"id": 3, "op": "count", "game": "Nope", "options": {}}),
                json.dumps({"id": 4, "op": "wat"}),
                json.dumps({"id": 5, "op": "quit"}),
            ]
        )
        self.assertEqual(process.returncode, 0)
        self.assertEqual(out[0]["event"], "ready")
        self.assertGreater(out[0]["games"], 50)
        self.assertEqual((out[1]["id"], out[1]["ok"], out[1]["checks"]), (1, True, 6))
        self.assertEqual((out[2]["ok"], out[2]["error"]), (False, "bad_json"))
        self.assertEqual((out[3]["id"], out[3]["ok"], out[3]["error"]), (3, False, "unknown_game"))
        self.assertEqual((out[4]["id"], out[4]["ok"], out[4]["error"]), (4, False, "unknown_op"))
        self.assertEqual((out[5]["id"], out[5]["ok"]), (5, True))
        after = host_yaml.stat().st_mtime_ns if host_yaml.exists() else None
        self.assertEqual(before, after, "the engine must never rewrite host.yaml")

    def test_world_chatter_never_reaches_the_protocol_stream(self):
        # Every stdout line must be JSON even though some worlds print while loading or generating.
        process, out = self.run_engine([json.dumps({"id": 1, "op": "count", "game": "Mega Man 3", "options": {}}), json.dumps({"id": 2, "op": "quit"})])
        self.assertTrue(all(isinstance(item, dict) for item in out))
        self.assertTrue(out[1]["ok"])

    def run_engine_bytes(self, payload: bytes):
        process = subprocess.run(
            [str(PYTHON), "-W", "ignore", str(ENGINE), "--ap-root", str(AP_ROOT)],
            input=payload,
            capture_output=True,
            timeout=120,
        )
        out = [json.loads(line) for line in process.stdout.decode("ascii").splitlines() if line.strip()]
        return process, out

    def test_non_ascii_option_text_is_read_as_utf8_and_does_not_crash_the_engine(self):
        # Node sends UTF-8. Reading it with the Windows code page would mangle it, or fail on bytes such as 0x81.
        text = "Pokémon Á ポケモン"
        line = json.dumps({"id": 1, "op": "count", "game": "APQuest", "options": {"hard_mode": text}}, ensure_ascii=False)
        quit_line = json.dumps({"id": 2, "op": "quit"})
        process, out = self.run_engine_bytes((line + "\n" + quit_line + "\n").encode("utf-8"))
        self.assertEqual(process.returncode, 0)
        self.assertTrue(out[1]["ok"])
        self.assertEqual(out[1]["checks"], 6)
        self.assertEqual([item["key"] for item in out[1]["invalid"]], ["hard_mode"])

    def test_absurdly_nested_input_is_a_bad_request_and_the_engine_keeps_running(self):
        nested = "[" * 5000 + "]" * 5000
        line = '{"id":1,"op":"count","game":"APQuest","options":{"x":' + nested + "}}"
        after = json.dumps({"id": 2, "op": "count", "game": "APQuest", "options": {}})
        process, out = self.run_engine([line, after, json.dumps({"id": 3, "op": "quit"})])
        self.assertEqual(process.returncode, 0)
        self.assertEqual((out[1]["ok"], out[1]["error"]), (False, "bad_json"))
        self.assertEqual((out[2]["id"], out[2]["ok"], out[2]["checks"]), (2, True, 6))

    def test_it_exits_when_the_input_closes(self):
        process, out = self.run_engine([])
        self.assertEqual(process.returncode, 0)
        self.assertEqual(out[0]["event"], "ready")


if __name__ == "__main__":
    unittest.main()
