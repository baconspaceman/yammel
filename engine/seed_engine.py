"""Seed engine: counts a world's checks for a given set of option values.

Run with the Python of the Archipelago source tree being read:
    <ap-root>\\.venv\\Scripts\\python.exe engine\\seed_engine.py --ap-root <ap-root>

Protocol: one JSON object per line on stdin, one JSON object per line on stdout.
  -> {"id": 1, "op": "count", "game": "APQuest", "options": {"extra_starting_chest": true}}
  <- {"id": 1, "ok": true, "checks": 7, "items": 7, "unresolved": [], "invalid": [], "ms": 12}
  -> {"id": 2, "op": "scan", "game": "APQuest"}
  <- {"id": 2, "ok": true, "checks": 6, "items": 6, "earlyOpen": 3, "needsFile": false, "systems": []}
  -> {"id": 3, "op": "quit"}
With --scan-all OUT it scans every visible world once, writes OUT, prints {"event": "scanned", ...} and exits.
The first line the engine writes is {"event": "ready", "apVersion": "...", "games": N}.
Everything the worlds themselves print goes to stderr, never to the protocol stream.
It runs only Archipelago's early generation steps (no fill) and never writes any file.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import traceback
import warnings
from argparse import Namespace
from pathlib import Path
from typing import Any

STEPS = ("generate_early", "create_regions", "create_items")
_RANDOM = re.compile(r"^random(-|$)", re.IGNORECASE)


def _refuse_to_save(self: Any, location: Any = None) -> None:
    """Stands in for Settings.save: the engine writes no files, ever."""
    return None


class EngineError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


def is_random_text(value: Any) -> bool:
    """Archipelago's own random forms (random, random-low, random-range-1-5...). Not names like random_balanced."""
    return isinstance(value, str) and _RANDOM.match(value.strip()) is not None


class Engine:
    def __init__(self, ap_root: Path):
        warnings.filterwarnings("ignore")
        sys.dont_write_bytecode = True  # no .pyc files may appear in the Archipelago folder
        sys.path.insert(0, str(ap_root))
        import settings

        settings.skip_autosave = True  # importing worlds must never rewrite host.yaml
        settings.no_gui = True  # a missing required file must raise an error, never open a file-picker window
        # Archipelago also saves a brand-new host.yaml when it cannot find one, whatever skip_autosave says.
        settings.Settings.save = _refuse_to_save  # type: ignore[method-assign]
        import Options
        import Utils
        from BaseClasses import CollectionState, MultiWorld
        from worlds import AutoWorldRegister
        from worlds.AutoWorld import call_all

        self._Options = Options
        self._CollectionState = CollectionState
        self._MultiWorld = MultiWorld
        self._call_all = call_all
        self._worlds = AutoWorldRegister.world_types
        self.ap_version = Utils.__version__

    def load_apworld(self, path: Path) -> tuple[list[str], str | None]:
        """
        Loads one .apworld file the way Archipelago's launcher does, so a custom world can be counted without being copied into
        Archipelago's own folder. Returns (games added, problem). A world that is already loaded is left alone (the bundled copy wins).
        """
        import importlib.abc
        import zipimport
        from worlds import AutoWorldRegister, WorldSource, failed_world_loads

        module = f"worlds.{path.stem}"
        if module in sys.modules:
            return [], None
        spec = zipimport.zipimporter(str(path)).find_spec(module)

        class Finder(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname: str, _path: Any = None, _target: Any = None) -> Any:
                return spec if fullname == module else None

        sys.meta_path.insert(0, Finder())
        before = set(AutoWorldRegister.world_types)
        failed_world_loads.pop(path.stem, None)
        ok = WorldSource(str(path), is_zip=True, relative=False).load()
        added = sorted(set(AutoWorldRegister.world_types) - before)
        if not ok or not added:
            reason = failed_world_loads.pop(path.stem, "")
            last = [line for line in reason.strip().splitlines() if line.strip()]
            return [], last[-1] if last else "It did not add a game."
        return added, None

    def visible_games(self) -> list[str]:
        return sorted(name for name, world in self._worlds.items() if not getattr(world, "hidden", False))

    def _classify(self, world_type: type, overrides: dict[str, Any]):
        """Split option values into usable overrides, ones decided at generation time, and invalid ones."""
        hints = world_type.options_dataclass.type_hints
        usable: dict[str, Any] = {}
        unresolved: list[str] = []
        invalid: list[dict[str, str]] = []
        keeps_dicts = (self._Options.OptionDict, self._Options.OptionCounter)
        for key, value in overrides.items():
            option = hints.get(key)
            if option is None:
                invalid.append({"key": key, "message": "unknown option"})
            elif is_random_text(value) or (isinstance(value, dict) and not issubclass(option, keeps_dicts)):
                unresolved.append(key)  # random or weighted: the count depends on the roll, so use the default
            else:
                try:
                    option.from_any(value)
                except Exception as exc:  # noqa: BLE001 - any failure means this value cannot be used
                    invalid.append({"key": key, "message": str(exc)[:120] or type(exc).__name__})
                else:
                    usable[key] = value
        return usable, unresolved, invalid

    def _build(self, world_type: type, usable: dict[str, Any]) -> Any:
        """A one-player multiworld after Archipelago's early generation steps (no fill)."""
        multiworld = self._MultiWorld(1)
        multiworld.game = {1: world_type.game}
        multiworld.player_name = {1: "Player"}
        multiworld.set_seed(1)
        args = Namespace()
        for key, option in world_type.options_dataclass.type_hints.items():
            setattr(args, key, {1: option.from_any(usable.get(key, option.default))})
        multiworld.set_options(args)
        multiworld.state = self._CollectionState(multiworld)
        for step in STEPS:
            self._call_all(multiworld, step)
        return multiworld

    def count(self, game: str, options: dict[str, Any]) -> dict[str, Any]:
        world_type = self._worlds.get(game)
        if world_type is None or getattr(world_type, "hidden", False):
            raise EngineError("unknown_game", game)
        started = time.perf_counter()
        usable, unresolved, invalid = self._classify(world_type, options)
        multiworld = self._build(world_type, usable)
        checks = sum(1 for location in multiworld.get_locations(1) if location.address is not None)
        items = sum(1 for item in multiworld.itempool if item.player == 1)
        return {
            "checks": checks,
            "items": items,
            "unresolved": sorted(unresolved),
            "invalid": invalid,
            "ms": round((time.perf_counter() - started) * 1000),
        }

    def _emulator_systems(self) -> dict[str, list[str]]:
        """Which BizHawk system(s) each game's client runs on, from Archipelago's own client registry."""
        try:
            from worlds._bizhawk.client import AutoBizHawkClientRegister
        except Exception:  # noqa: BLE001 - no BizHawk support in this tree: no game is reported as one
            return {}
        systems: dict[str, list[str]] = {}
        for names, handlers in AutoBizHawkClientRegister.game_handlers.items():
            for game in handlers:
                systems[game] = sorted(set(systems.get(game, [])) | set(names))
        return systems

    def _needs_user_file(self, world_type: type) -> bool:
        """True when the world has a host.yaml section with a required file the player must supply (a ROM, ISO or program).

        This reads the settings class only. It never creates the settings object or reads a value from it,
        because Archipelago answers a missing required file by opening a file-picker window.
        """
        import settings as ap_settings

        annotation = world_type.__dict__.get("__annotations__", {}).get("settings")
        if annotation is None:
            return False
        group_class: Any = annotation
        if isinstance(annotation, str):
            name = annotation.split("[", 1)[1].rsplit("]", 1)[0] if "[" in annotation else annotation
            group_class = getattr(sys.modules.get(world_type.__module__), name.strip("'\" "), None)
        else:
            args = getattr(annotation, "__args__", None)
            if args:
                group_class = args[0]
        if not isinstance(group_class, type):
            return False
        return any(isinstance(value, ap_settings.FilePath) and getattr(value, "required", True) for value in vars(group_class).values())

    def scan(self, game: str, systems: dict[str, list[str]] | None = None) -> dict[str, Any]:
        """Facts about a world at its default options: size, how much is open at the start, and what it needs."""
        world_type = self._worlds.get(game)
        if world_type is None or getattr(world_type, "hidden", False):
            raise EngineError("unknown_game", game)
        multiworld = self._build(world_type, {})
        locations = [location for location in multiworld.get_locations(1) if location.address is not None]
        early_open: int | None
        try:
            self._call_all(multiworld, "set_rules")
            state = multiworld.state
            early_open = sum(1 for location in locations if location.can_reach(state))
        except Exception:  # noqa: BLE001 - some worlds cannot be asked this without a full generation
            early_open = None
        known = systems if systems is not None else self._emulator_systems()
        return {
            "checks": len(locations),
            "items": sum(1 for item in multiworld.itempool if item.player == 1),
            "earlyOpen": early_open,
            "needsFile": self._needs_user_file(world_type),
            "systems": known.get(game, []),
        }

    def scan_all(self) -> dict[str, Any]:
        """Scans every visible world. A world that fails is listed under "failed" and left out of "games"."""
        systems = self._emulator_systems()
        games: dict[str, Any] = {}
        failed: dict[str, str] = {}
        for game in self.visible_games():
            try:
                games[game] = self.scan(game, systems)
            except (Exception, SystemExit) as exc:  # noqa: BLE001 - one broken world must not stop the scan
                failed[game] = f"{type(exc).__name__}: {exc}"[:200]
        return {"apVersion": self.ap_version, "games": games, "failed": failed}


def handle(engine: Engine, request: Any) -> tuple[dict[str, Any], bool]:
    """Returns (reply, should_quit)."""
    if not isinstance(request, dict):
        return {"id": None, "ok": False, "error": "bad_request"}, False
    request_id = request.get("id")
    op = request.get("op")
    if op == "quit":
        return {"id": request_id, "ok": True}, True
    if op == "scan":
        game = request.get("game")
        if not isinstance(game, str):
            return {"id": request_id, "ok": False, "error": "bad_request"}, False
        try:
            return {"id": request_id, "ok": True, **engine.scan(game)}, False
        except EngineError as exc:
            return {"id": request_id, "ok": False, "error": exc.code, "detail": exc.detail}, False
        except (Exception, SystemExit) as exc:  # noqa: BLE001
            traceback.print_exc(file=sys.stderr)
            return {"id": request_id, "ok": False, "error": "world_error", "detail": f"{type(exc).__name__}: {exc}"[:300]}, False
    if op != "count":
        return {"id": request_id, "ok": False, "error": "unknown_op"}, False
    game, options = request.get("game"), request.get("options", {})
    if not isinstance(game, str) or not isinstance(options, dict):
        return {"id": request_id, "ok": False, "error": "bad_request"}, False
    try:
        return {"id": request_id, "ok": True, **engine.count(game, options)}, False
    except EngineError as exc:
        return {"id": request_id, "ok": False, "error": exc.code, "detail": exc.detail}, False
    except (Exception, SystemExit) as exc:  # noqa: BLE001 - a broken world (even one that calls exit) must not kill the engine
        traceback.print_exc(file=sys.stderr)
        return {"id": request_id, "ok": False, "error": "world_error", "detail": f"{type(exc).__name__}: {exc}"[:300]}, False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ap-root", required=True, type=Path)
    parser.add_argument("--scan-all", type=Path, metavar="OUT", help="scan every world, write the facts to OUT as JSON, and exit")
    parser.add_argument("--custom-world", type=Path, action="append", default=[], metavar="FILE", help="also load this .apworld file (repeatable)")
    args = parser.parse_args()

    # Keep the protocol stream clean. Worlds print, and Archipelago may start programs of its own (its module updater runs
    # pip when a world's requirements are missing); those write to file descriptor 1 directly. So the protocol gets a private
    # copy of the real stdout, and descriptor 1 itself is pointed at stderr for everything else.
    sys.stdout.flush()
    protocol = os.fdopen(os.dup(1), "w", encoding="utf-8", newline="\n")
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")  # the app sends UTF-8, not the Windows code page

    def send(message: dict[str, Any]) -> None:
        protocol.write(json.dumps(message, separators=(",", ":")) + "\n")
        protocol.flush()

    engine = Engine(args.ap_root.resolve())
    for custom in args.custom_world:
        try:
            _, problem = engine.load_apworld(custom.resolve())
        except Exception as exc:  # noqa: BLE001 - a world that will not load must not stop the engine for the others
            problem = f"{type(exc).__name__}: {exc}"
        if problem is not None:
            print(f"custom world {custom.name} was not loaded: {problem}", file=sys.stderr)
    if args.scan_all is not None:
        from datetime import datetime, timezone

        result = engine.scan_all()
        result["scannedAt"] = datetime.now(timezone.utc).isoformat()
        args.scan_all.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        send({"event": "scanned", "games": len(result["games"]), "failed": len(result["failed"])})
        return 0
    send({"event": "ready", "apVersion": engine.ap_version, "games": len(engine.visible_games())})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except (ValueError, RecursionError):  # not JSON, or nested so deeply that it cannot be read
            send({"id": None, "ok": False, "error": "bad_json"})
            continue
        reply, quit_now = handle(engine, request)
        send(reply)
        if quit_now:
            break
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
