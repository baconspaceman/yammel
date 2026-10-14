"""Writes data/feel-profiles.json: drafted "what is this game like" profiles used by the Games to mix recommender.

These are Claude's judgement from general knowledge of each game (2026-10-13), not measured data, so the app
always labels them Drafted. Edit the table below and re-run to correct one:
    python scripts/make-feel-profiles.py

Fields: genre, pace (1 relaxed .. 5 frantic), length (1 under an hour .. 5 twenty hours or more),
tones (up to three of: cozy whimsical heroic dark tense funny mysterious serious energetic),
era (classic up to 1995, mid 1996 to 2007, modern after), families (franchise or maker groups), activities.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# game: (genre, pace, length, tones, era, families, activities)
P = {
    "A Hat in Time": ("platformer", 3, 4, ["whimsical", "funny"], "modern", [], ["platforming", "collecting", "exploration"]),
    "A Link to the Past": ("action-adventure", 3, 4, ["heroic", "mysterious"], "classic", ["zelda"], ["exploration", "combat", "puzzle"]),
    "A Short Hike": ("action-adventure", 1, 2, ["cozy", "whimsical"], "modern", [], ["exploration", "collecting"]),
    "APQuest": ("action-adventure", 2, 1, ["whimsical"], "modern", [], ["exploration", "collecting", "combat"]),
    "Adventure": ("action-adventure", 3, 1, ["whimsical"], "classic", ["atari"], ["exploration", "collecting"]),
    "Aquaria": ("metroidvania", 2, 4, ["mysterious"], "modern", [], ["exploration", "combat", "collecting"]),
    "Blasphemous": ("metroidvania", 3, 4, ["dark", "serious"], "modern", [], ["combat", "exploration", "platforming"]),
    "Bomb Rush Cyberfunk": ("platformer", 4, 3, ["energetic", "funny"], "modern", [], ["platforming", "collecting", "exploration"]),
    "Bumper Stickers": ("puzzle", 3, 2, ["cozy"], "modern", [], ["puzzle", "logic"]),
    "Castlevania - Circle of the Moon": ("metroidvania", 3, 3, ["dark"], "mid", ["castlevania"], ["combat", "exploration", "collecting"]),
    "Castlevania 64": ("action-adventure", 3, 3, ["dark"], "mid", ["castlevania"], ["combat", "platforming", "exploration"]),
    "Celeste (Open World)": ("platformer", 4, 4, ["serious", "energetic"], "modern", [], ["platforming", "exploration"]),
    "Celeste 64": ("platformer", 3, 2, ["whimsical"], "modern", [], ["platforming", "collecting"]),
    "ChecksFinder": ("puzzle", 2, 1, ["cozy"], "modern", [], ["logic", "puzzle"]),
    "Choo-Choo Charles": ("survival", 4, 3, ["tense", "dark"], "modern", [], ["exploration", "combat", "stealth"]),
    "Civilization VI": ("strategy", 2, 5, ["serious"], "modern", ["civilization"], ["management", "building", "strategy"]),
    "DLCQuest": ("platformer", 3, 2, ["funny"], "modern", [], ["platforming", "collecting", "grinding"]),
    "DOOM 1993": ("shooter", 5, 3, ["tense", "energetic"], "classic", ["doom"], ["shooting", "exploration"]),
    "DOOM II": ("shooter", 5, 3, ["tense", "energetic"], "classic", ["doom"], ["shooting", "exploration"]),
    "Dark Souls III": ("rpg", 4, 5, ["dark", "serious"], "modern", ["fromsoftware"], ["combat", "exploration", "grinding"]),
    "EarthBound": ("jrpg", 2, 5, ["funny", "whimsical"], "classic", ["mother"], ["combat", "dialogue", "exploration"]),
    "Factorio": ("automation", 3, 5, ["serious"], "modern", [], ["building", "management", "crafting"]),
    "Faxanadu": ("action-adventure", 3, 3, ["dark"], "classic", [], ["combat", "platforming", "exploration"]),
    "Final Fantasy": ("jrpg", 2, 5, ["heroic"], "classic", ["final-fantasy"], ["combat", "grinding", "exploration"]),
    "Final Fantasy Mystic Quest": ("jrpg", 2, 3, ["whimsical", "heroic"], "classic", ["final-fantasy"], ["combat", "exploration"]),
    "Heretic": ("shooter", 5, 3, ["dark", "tense"], "classic", ["doom"], ["shooting", "exploration"]),
    "Hollow Knight": ("metroidvania", 3, 5, ["dark", "mysterious"], "modern", [], ["combat", "exploration", "platforming"]),
    "Hylics 2": ("rpg", 2, 3, ["whimsical", "mysterious"], "modern", [], ["combat", "exploration", "dialogue"]),
    "Inscryption": ("card", 2, 3, ["dark", "mysterious"], "modern", [], ["cards", "puzzle", "strategy"]),
    "Jak and Daxter: The Precursor Legacy": ("platformer", 3, 4, ["whimsical", "funny"], "mid", [], ["platforming", "collecting", "exploration"]),
    "Kingdom Hearts": ("rpg", 3, 5, ["heroic", "whimsical"], "mid", ["kingdom-hearts"], ["combat", "exploration", "dialogue"]),
    "Kingdom Hearts 2": ("rpg", 4, 5, ["heroic"], "mid", ["kingdom-hearts"], ["combat", "exploration", "dialogue"]),
    "Kirby's Dream Land 3": ("platformer", 2, 3, ["cozy", "whimsical"], "classic", ["kirby"], ["platforming", "collecting"]),
    "Landstalker - The Treasures of King Nole": ("action-adventure", 3, 4, ["whimsical", "heroic"], "classic", [], ["exploration", "combat", "puzzle"]),
    "Lingo": ("puzzle", 1, 5, ["cozy", "mysterious"], "modern", [], ["puzzle", "logic", "exploration"]),
    "Links Awakening DX": ("action-adventure", 3, 4, ["whimsical", "mysterious"], "classic", ["zelda"], ["exploration", "combat", "puzzle"]),
    "Lufia II Ancient Cave": ("roguelike", 3, 3, ["heroic"], "classic", [], ["combat", "grinding", "collecting"]),
    "Mario & Luigi Superstar Saga": ("jrpg", 3, 4, ["funny", "whimsical"], "mid", ["mario"], ["combat", "exploration", "dialogue"]),
    "Mega Man 2": ("platformer", 4, 2, ["energetic", "heroic"], "classic", ["megaman"], ["platforming", "shooting"]),
    "Mega Man 3": ("platformer", 4, 2, ["energetic", "heroic"], "classic", ["megaman"], ["platforming", "shooting"]),
    "MegaMan Battle Network 3": ("jrpg", 3, 4, ["energetic", "heroic"], "mid", ["megaman"], ["combat", "grinding", "exploration"]),
    "Meritous": ("shooter", 4, 3, ["tense", "mysterious"], "modern", [], ["shooting", "exploration"]),
    "Muse Dash": ("rhythm", 4, 1, ["energetic", "whimsical"], "modern", [], ["rhythm"]),
    "Noita": ("roguelike", 4, 4, ["dark", "tense"], "modern", [], ["combat", "exploration"]),
    "Ocarina of Time": ("action-adventure", 3, 4, ["heroic", "mysterious"], "mid", ["zelda"], ["exploration", "combat", "puzzle"]),
    "Old School Runescape": ("rpg", 1, 5, ["whimsical", "funny"], "modern", [], ["grinding", "collecting", "exploration"]),
    "Overcooked! 2": ("party", 5, 2, ["funny", "energetic"], "modern", [], ["management", "cooking"]),
    "Paint": ("creative", 1, 1, ["cozy", "funny"], "modern", [], ["drawing"]),
    "Pokemon Emerald": ("jrpg", 2, 5, ["whimsical", "heroic"], "mid", ["pokemon"], ["collecting", "combat", "exploration"]),
    "Pokemon Red and Blue": ("jrpg", 2, 5, ["whimsical"], "classic", ["pokemon"], ["collecting", "combat", "exploration"]),
    "Raft": ("survival", 2, 4, ["tense", "whimsical"], "modern", [], ["building", "crafting", "exploration"]),
    "Risk of Rain 2": ("roguelike", 5, 3, ["energetic", "tense"], "modern", [], ["shooting", "combat"]),
    "SMZ3": ("metroidvania", 3, 5, ["heroic", "mysterious"], "classic", ["zelda", "metroid"], ["exploration", "combat", "puzzle"]),
    "Satisfactory": ("automation", 3, 5, ["serious"], "modern", [], ["building", "management", "crafting"]),
    "Saving Princess": ("platformer", 4, 2, ["funny", "energetic"], "modern", [], ["shooting", "platforming", "exploration"]),
    "Secret of Evermore": ("rpg", 3, 4, ["whimsical", "mysterious"], "classic", [], ["combat", "exploration", "crafting"]),
    "Shivers": ("puzzle", 1, 3, ["dark", "mysterious"], "classic", [], ["puzzle", "exploration"]),
    "Sonic Adventure 2 Battle": ("platformer", 5, 3, ["energetic", "funny"], "mid", ["sonic"], ["platforming", "racing", "collecting"]),
    "Starcraft 2": ("strategy", 4, 4, ["serious", "heroic"], "modern", ["starcraft"], ["strategy", "combat", "management"]),
    "Stardew Valley": ("sim", 1, 5, ["cozy", "whimsical"], "modern", [], ["farming", "crafting", "management"]),
    "Subnautica": ("survival", 2, 5, ["tense", "mysterious"], "modern", [], ["exploration", "crafting", "survival"]),
    "Super Mario 64": ("platformer", 3, 3, ["whimsical", "energetic"], "mid", ["mario"], ["platforming", "collecting", "exploration"]),
    "Super Mario Land 2": ("platformer", 3, 2, ["whimsical"], "classic", ["mario"], ["platforming", "collecting"]),
    "Super Mario World": ("platformer", 3, 3, ["whimsical"], "classic", ["mario"], ["platforming", "exploration", "collecting"]),
    "Super Metroid": ("metroidvania", 3, 3, ["dark", "mysterious"], "classic", ["metroid"], ["exploration", "combat", "platforming"]),
    "TUNIC": ("action-adventure", 3, 4, ["mysterious", "whimsical"], "modern", [], ["exploration", "combat", "puzzle"]),
    "Terraria": ("sandbox", 4, 5, ["whimsical", "tense"], "modern", [], ["building", "combat", "exploration", "crafting"]),
    "The Legend of Zelda": ("action-adventure", 3, 4, ["heroic"], "classic", ["zelda"], ["exploration", "combat", "puzzle"]),
    "The Messenger": ("platformer", 4, 3, ["funny", "energetic"], "modern", [], ["platforming", "combat", "exploration"]),
    "The Wind Waker": ("action-adventure", 3, 5, ["whimsical", "heroic"], "mid", ["zelda"], ["exploration", "combat", "puzzle"]),
    "The Witness": ("puzzle", 1, 5, ["mysterious", "serious"], "modern", [], ["puzzle", "logic", "exploration"]),
    "Timespinner": ("metroidvania", 3, 4, ["heroic", "mysterious"], "modern", [], ["combat", "exploration", "platforming"]),
    "Undertale": ("rpg", 2, 3, ["funny", "whimsical"], "modern", [], ["dialogue", "combat", "exploration"]),
    "VVVVVV": ("platformer", 4, 2, ["energetic", "whimsical"], "modern", [], ["platforming", "exploration"]),
    "Wargroove": ("strategy", 2, 4, ["whimsical", "heroic"], "modern", [], ["strategy", "combat", "management"]),
    "Yacht Dice": ("casual", 2, 1, ["cozy"], "modern", [], ["dice", "luck"]),
    "Yoshi's Island": ("platformer", 3, 3, ["cozy", "whimsical"], "classic", ["mario"], ["platforming", "collecting", "exploration"]),
    "Yu-Gi-Oh! 2006": ("card", 2, 4, ["energetic", "serious"], "mid", ["yugioh"], ["cards", "strategy", "grinding"]),
    "Zillion": ("action-adventure", 3, 2, ["serious", "mysterious"], "classic", [], ["exploration", "shooting", "puzzle"]),
    "shapez": ("automation", 2, 4, ["cozy"], "modern", [], ["building", "puzzle", "management"]),
}


def main() -> None:
    schema = json.loads((ROOT / "data" / "schema.json").read_text(encoding="utf-8"))
    visible = sorted(name for name, game in schema["games"].items() if not game["hidden"])
    missing, extra = set(visible) - set(P), set(P) - set(visible)
    if missing or extra:
        raise SystemExit(f"table and schema disagree. Missing a profile: {sorted(missing)}. Not in schema: {sorted(extra)}")
    out = {
        "note": "Drafted by Claude from general knowledge of the games on 2026-10-13. Judgement, not measured data; every value is a draft.",
        "games": {},
    }
    for game in visible:
        genre, pace, length, tones, era, families, activities = P[game]
        out["games"][game] = {
            "genre": genre, "pace": pace, "length": length, "tones": tones,
            "era": era, "families": families, "activities": activities,
        }
    (ROOT / "data" / "feel-profiles.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(out['games'])} profiles")


if __name__ == "__main__":
    main()
