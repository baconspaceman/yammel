"""Writes a tiny custom world, as a .apworld file, into the folder given on the command line (used by the e2e tests)."""
import sys
import zipfile
from pathlib import Path

SOURCE = '''
from dataclasses import dataclass
from Options import PerGameCommonOptions, Toggle, Range
from worlds.AutoWorld import World


class TinySwitch(Toggle):
    """A tiny switch for the end to end test."""
    display_name = "Tiny switch"


class TinyNumber(Range):
    """A tiny number."""
    display_name = "Tiny number"
    range_start = 1
    range_end = 5
    default = 3


@dataclass
class TinyOptions(PerGameCommonOptions):
    tiny_switch: TinySwitch
    tiny_number: TinyNumber


class TinyWorld(World):
    """Tiny."""
    game = "Tiny Custom E2E Game"
    options_dataclass = TinyOptions
    item_name_to_id = {}
    location_name_to_id = {}
'''

folder = Path(sys.argv[1])
with zipfile.ZipFile(folder / "tiny_e2e_world.apworld", "w") as z:
    z.writestr("tiny_e2e_world/__init__.py", SOURCE)
with zipfile.ZipFile(folder / "broken_e2e_world.apworld", "w") as z:
    z.writestr("broken_e2e_world/__init__.py", "def (:\n")
