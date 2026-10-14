# Getting started with Yammel

Yammel helps you make player files (YAMLs) for Archipelago without hand-editing text: pick a game, flip switches and set numbers, and the YAML writes itself.

Contents:

1. What it is
2. What you need
3. Running it
4. A tour of the start screen
5. Making your first YAML
6. Saving it
7. Where to go next

## What it is

[Archipelago](https://archipelago.gg) is a randomizer where many games are linked into one multiworld. Each player gives the generator a small file, called a YAML, that says which game they want to play and how they want it set up. Writing those files by hand is easy to get wrong. A single misspelled word can stop a whole seed.

This app shows every option of every bundled game as a switch, a choice, a number or a text box. As you change things, the YAML on the right updates. A problem checker reads your YAML the way Archipelago will, and tells you in plain words what would go wrong.

## What you need

Nothing is required. You do not need an account, a login or a key to use the editing, saving, checking and difficulty features.

Some extras are optional:

- **An Archipelago source folder** (set in Settings). With it, the editor can show a live check count, which is how many checks your settings give. It also lets you make a seed.
- **An installed copy of Archipelago.** The app can use it to make a seed when there is no source folder.
- **Claude Code, Codex or your own OpenRouter key** for the helper chat. Each one is off until you turn it on in Settings.

Without these extras, everything else still works.

## Running it

The easiest way is to download it from the [Releases page](https://github.com/baconspaceman/yammel/releases/latest):

- **The installer** (`Yammel-Setup-<version>.exe`) installs it for your own account. It does not need administrator rights.
- **The portable file** (`Yammel-Portable-<version>.exe`) is one file you can run from anywhere. Nothing is installed.

Windows may warn about an "unknown publisher", because the downloads are not code-signed. Choose **More info**, then **Run anyway**.

If you prefer to run it from the source code, follow [building and running](../development/building-and-running.md).

## A tour of the start screen

![The start screen with the recent files and the list of games](../images/01-start-screen.jpg)

The start screen has these parts:

- **Open a YAML file.** Opens an existing YAML from your computer.
- **Recent files.** The YAML files you opened or saved lately. Click one to open it again.
- **Search games.** A box above the game list. Type part of a game name to narrow the list. The list shows the games that match.
- **The game list.** Click a game to start a new YAML for it. Games you added from your own custom worlds are tagged in the list.

![Searching for a game in the start screen](../images/02-search-games.jpg)

## Making your first YAML

1. On the start screen, type a few letters of the game in **Search games**, then click the game.
2. The editor opens with the game's options grouped on the left. At the top, fill in **Player name**. This is the name Archipelago will show for you. It cannot be empty. You can also add a **Description** if you like.
3. Change the options you want. Each option is a card:
   - A **switch** is on or off.
   - A **choice** is a drop-down list.
   - A **number** or a **text box** takes what you type.
   
   Options you leave alone keep the game's default. A card shows **Changed** once you change it.
4. Watch the **YAML** tab on the right. It shows the text you are building.
5. Look at the bar under the header. It shows the check count and the difficulty, and it says **No problems found** when Archipelago should accept the YAML.

![The editor with the option cards, the YAML preview and the check count](../images/03-editor-overview.jpg)

When you are happy with it, save it. See the next section.

## Saving it

1. Click **Save** in the toolbar, or press Ctrl+S.
2. If this is a new YAML, a save window opens. Pick a name and a place. The suggested name uses your player name and game.
3. If you opened an existing file, **Save** writes back to that file. The app keeps a backup of the old version first.

The toolbar shows a dot after the file name when you have changes that are not saved yet. For the full details, see [files and saving](files-and-saving.md).

## Where to go next

- [Editing options](editing-options.md) explains every part of the editor screen, including random values, weighted values, lists and the Raw tab.
- [Checking your work](checking-your-work.md) explains the problem checker, the check count, the difficulty gauge and the seed tool.
- [Files and saving](files-and-saving.md) explains saving, backups, several players in one file and damaged files.
- [Ideas and shortcuts](ideas-and-shortcuts.md) covers randomize, game roulette and games to mix.
- [Helper](helper.md) explains the helper chat.
- [Custom worlds](custom-worlds.md) explains how to use your own games.
- [Archipelago settings and host.yaml](archipelago-settings-host-yaml.md) covers the settings that point the app at Archipelago.
- [Settings and appearance](settings-and-appearance.md) covers the look of the app and other settings.
- [Troubleshooting](troubleshooting.md) and the [FAQ](faq.md) answer common questions.
- [Keyboard shortcuts](../reference/keyboard-shortcuts.md) lists every shortcut.
