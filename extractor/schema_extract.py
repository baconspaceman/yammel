"""Extract Archipelago world option schemas into one JSON file.

Run with the Python of the Archipelago source tree being read:
    <ap-root>\\.venv\\Scripts\\python.exe extractor\\schema_extract.py --ap-root <ap-root> --out <file>
"""
from __future__ import annotations

import argparse
import datetime
import inspect
import json
import os
import sys
import warnings
from pathlib import Path
from typing import Any

KINDS = (
    "toggle", "choice", "text_choice", "range", "named_range", "free_text",
    "set", "list", "dict", "counter", "plando_items", "plando_connections", "other",
)


def _jsonable(value: Any) -> Any:
    """Convert option defaults and preset values into JSON-safe data."""
    if isinstance(value, bool) or value is None or isinstance(value, (int, float, str)):
        return value
    if isinstance(value, (set, frozenset)):
        return sorted((_jsonable(v) for v in value), key=_sort_key)
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return str(value)


def _sort_key(value: Any) -> tuple[int, Any]:
    """Order ints first, then everything else by text, so odd world data cannot crash sorting."""
    if isinstance(value, int) and not isinstance(value, bool):
        return (0, value)
    return (1, str(value))


def kind_of(option: type) -> str:
    import Options as O

    ordered = (
        (O.PlandoItems, "plando_items"),
        (O.PlandoConnections, "plando_connections"),
        (O.NamedRange, "named_range"),
        (O.Range, "range"),
        (O.TextChoice, "text_choice"),
        (O.Choice, "choice"),
        (O.Toggle, "toggle"),
        (O.OptionCounter, "counter"),
        (O.OptionDict, "dict"),
        (O.OptionList, "list"),
        (O.OptionSet, "set"),
        (O.FreeText, "free_text"),
    )
    for base, name in ordered:
        if issubclass(option, base):
            return name
    return "other"


def _visibility(option: type) -> list[str]:
    import Options as O

    flags = (
        ("template", O.Visibility.template),
        ("simple_ui", O.Visibility.simple_ui),
        ("complex_ui", O.Visibility.complex_ui),
        ("spoiler", O.Visibility.spoiler),
    )
    return [name for name, flag in flags if flag in option.visibility]


def option_to_dict(key: str, option: type) -> dict[str, Any]:
    import Options as O

    kind = kind_of(option)
    out: dict[str, Any] = {
        "key": key,
        "kind": kind,
        "displayName": str(getattr(option, "display_name", key)),
        "description": inspect.cleandoc(option.__doc__ or ""),
        "visibility": _visibility(option),
        "supportsWeighting": bool(option.supports_weighting),
    }
    default = getattr(option, "default", None)

    if kind == "toggle":
        out["default"] = bool(default)
    elif kind in ("choice", "text_choice"):
        values = sorted(option.name_lookup, key=_sort_key)
        out["choices"] = [
            {"key": option.name_lookup[v], "label": option.get_option_name(v)}
            | ({"value": v} if isinstance(v, int) and not isinstance(v, bool) else {})
            for v in values
        ]
        out["aliases"] = {
            alias: option.name_lookup[value] for alias, value in sorted(option.aliases.items())
        }
        if isinstance(default, int) and default in option.name_lookup:
            out["default"] = option.name_lookup[default]
        else:
            out["default"] = _jsonable(default)
    elif kind in ("range", "named_range"):
        out["min"] = option.range_start
        out["max"] = option.range_end
        out["default"] = _jsonable(default)
        if kind == "named_range":
            out["specialNames"] = {
                str(name): int(value) for name, value in option.special_range_names.items()
            }
    else:
        out["default"] = _jsonable(default)
        if issubclass(option, O.LocationSet):
            out["domain"] = "locations"
        elif issubclass(option, O.ItemSet) or issubclass(option, O.ItemDict):
            out["domain"] = "items"
    return out


def groups_of(world: type) -> list[dict[str, Any]]:
    """Option groups in Archipelago's own order, never dropping an option.

    Some worlds reuse one option class under several names, so a class maps to a list of keys.
    """
    keys_of: dict[type, list[str]] = {}
    for name, opt in world.options_dataclass.type_hints.items():
        keys_of.setdefault(opt, []).append(name)
    named = [(g.name, list(g.options), bool(g.start_collapsed)) for g in world.web.option_groups]
    grouped = {opt for _, opts, _ in named for opt in opts}
    leftover = [key for opt, keys in keys_of.items() if opt not in grouped for key in keys]

    groups: list[dict[str, Any]] = []
    has_game_group = any(name == "Game Options" for name, _, _ in named)
    if leftover and not has_game_group:
        groups.append({"name": "Game Options", "collapsed": False, "options": leftover})
    for name, opts, collapsed in named:
        keys = [key for opt in opts for key in keys_of.get(opt, [])]
        if name == "Game Options" and leftover:
            keys = leftover + keys
        groups.append({"name": name, "collapsed": collapsed, "options": keys})
    return groups


def game_to_dict(name: str, world: type) -> dict[str, Any]:
    options = {
        key: option_to_dict(key, option)
        for key, option in world.options_dataclass.type_hints.items()
    }
    return {
        "name": name,
        "hidden": bool(getattr(world, "hidden", False)),
        "groups": groups_of(world),
        "options": options,
        "presets": _jsonable(dict(world.web.options_presets)),
        "items": sorted(getattr(world, "item_name_to_id", {}) or {}),
        "locations": sorted(getattr(world, "location_name_to_id", {}) or {}),
        "itemGroups": sorted(getattr(world, "item_name_groups", {}) or {}),
        "locationGroups": sorted(getattr(world, "location_name_groups", {}) or {}),
    }


def load_failures(failed: dict[str, str]) -> list[dict[str, str]]:
    """Worlds that Archipelago failed to import (it swallows the error), as extraction errors."""
    return [{"game": name, "error": failed[name]} for name in sorted(failed)]


def write_schema_file(result: dict[str, Any], out: Path) -> bool:
    """Write the result atomically. An empty result never overwrites a previous good file."""
    if not result["games"]:
        return False
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp")
    tmp.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, out)
    return True


def _short(exc: BaseException) -> str:
    """One readable line for a person: the error kind and its first line."""
    first = (str(exc).strip().splitlines() or [""])[0]
    return f"{type(exc).__name__}: {first}"


def load_custom_worlds(folder: Path) -> tuple[dict[str, str], list[dict[str, str]]]:
    """
    Loads each .apworld in `folder` on its own, the way Archipelago's launcher does, but one at a time so a world
    written for a newer Python or missing a library is reported instead of stopping everything.
    Returns ({game: file name} for the games that loaded, [{file, error}] for the ones that did not).
    Worlds whose game is already loaded are skipped quietly (the bundled copy wins, as in Archipelago).
    """
    import importlib.abc
    import zipimport
    from Utils import version_tuple
    from worlds import AutoWorldRegister, WorldSource, failed_world_loads
    from worlds.Files import APWorldContainer, InvalidDataError

    specs: dict[str, Any] = {}

    class Finder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname: str, _path: Any = None, _target: Any = None) -> Any:
            return specs.get(fullname)

    sys.meta_path.insert(0, Finder())
    loaded: dict[str, str] = {}
    problems: list[dict[str, str]] = []
    for path in sorted(folder.glob("*.apworld"), key=lambda p: p.name.lower()):
        if path.name.startswith(("_", ".")):
            continue
        try:
            container = APWorldContainer(str(path))
            try:
                container.read()
            except InvalidDataError:
                pass  # older worlds have no manifest; Archipelago 0.6 still loads them
            if container.minimum_ap_version and container.minimum_ap_version > version_tuple:
                problems.append({"file": path.name, "error": f"Needs a newer Archipelago ({'.'.join(map(str, container.minimum_ap_version))} or later)."})
                continue
            if container.maximum_ap_version and container.maximum_ap_version < version_tuple:
                problems.append({"file": path.name, "error": f"Made for an older Archipelago (up to {'.'.join(map(str, container.maximum_ap_version))})."})
                continue
            if container.game and container.game in AutoWorldRegister.world_types:
                continue
            module = f"worlds.{path.stem}"
            if module in sys.modules:
                continue  # a world with this file name is already loaded
            specs[module] = zipimport.zipimporter(str(path)).find_spec(module)
            before = set(AutoWorldRegister.world_types)
            failed_world_loads.pop(path.stem, None)
            ok = WorldSource(str(path), is_zip=True, relative=False).load()
            added = set(AutoWorldRegister.world_types) - before
            if not ok or not added:
                reason = failed_world_loads.pop(path.stem, "")
                last = [line for line in reason.strip().splitlines() if line.strip()]
                problems.append({"file": path.name, "error": last[-1] if last else "It did not add a game."})
                continue
            for game in added:
                loaded[game] = path.name
        except Exception as exc:  # a broken file must not stop the others
            problems.append({"file": path.name, "error": _short(exc)})
    return loaded, problems


def extract(ap_root: Path, custom_worlds: Path | None = None, only_custom: bool = False) -> dict[str, Any]:
    warnings.filterwarnings("ignore")
    sys.path.insert(0, str(ap_root))
    import settings

    settings.skip_autosave = True  # importing worlds must never rewrite host.yaml in the source tree
    settings.no_gui = True
    import Utils
    from worlds import AutoWorldRegister, failed_world_loads

    custom_games: dict[str, str] = {}
    custom_problems: list[dict[str, str]] = []
    if custom_worlds is not None:
        custom_games, custom_problems = load_custom_worlds(custom_worlds)

    games: dict[str, Any] = {}
    errors: list[dict[str, str]] = []
    for name, world in sorted(AutoWorldRegister.world_types.items()):
        if only_custom and name not in custom_games:
            continue
        try:
            games[name] = game_to_dict(name, world)
            if name in custom_games:
                games[name]["customFile"] = custom_games[name]
        except Exception as exc:  # one broken world must not hide the rest
            errors.append({"game": name, "error": f"{type(exc).__name__}: {exc}"})
    if not only_custom:
        errors.extend(load_failures(dict(failed_world_loads)))
    result: dict[str, Any] = {
        "apVersion": Utils.__version__,
        "extractedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "games": games,
        "errors": errors,
    }
    if custom_worlds is not None:
        result["customProblems"] = custom_problems
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ap-root", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--custom-worlds", type=Path, default=None, help="a folder of .apworld files to load as well")
    parser.add_argument("--only-custom", action="store_true", help="write only the games that came from --custom-worlds")
    args = parser.parse_args()

    custom = args.custom_worlds.resolve() if args.custom_worlds is not None else None
    result = extract(args.ap_root.resolve(), custom, args.only_custom)
    if custom is not None and args.only_custom:
        # A scan that finds nothing is still a valid answer: write it so the app can say so.
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
        print(f"{len(result['games'])} custom games, {len(result['customProblems'])} problems -> {args.out}")
        return 0
    if not write_schema_file(result, args.out):
        print(
            f"No games were extracted ({len(result['errors'])} errors); left {args.out} untouched.",
            file=sys.stderr,
        )
        return 1
    print(
        f"AP {result['apVersion']}: {len(result['games'])} games, "
        f"{len(result['errors'])} errors -> {args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
