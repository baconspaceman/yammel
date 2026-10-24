# Custom worlds

Custom worlds let the editor use extra games you have added to Archipelago as `.apworld` files. Once scanned, they appear in the game list, and you can make a YAML for any of them the same way you do for a bundled game.

Contents:

- [What you need](#what-you-need)
- [Choose the folder and scan it](#choose-the-folder-and-scan-it)
- [What you see](#what-you-see)
- [A game Yammel has no data for](#a-game-yammel-has-no-data-for)
- [Files that could not be added](#files-that-could-not-be-added)
- [Limits and safety](#limits-and-safety)
- [Forgetting the folder](#forgetting-the-folder)

## What you need

- **A folder of `.apworld` files.** The app reads the files that sit directly in that folder. Unzipped world folders are not read.
- **An Archipelago source folder with its own Python.** This is the same requirement as the live check count. Set it up under **Check counts** in Settings. Scanning uses that folder's Python, so the Python must have Archipelago's requirements installed. An installed copy of Archipelago alone is not enough.

## Choose the folder and scan it

1. Open **Settings**, or press **Add custom worlds** on the start screen. That button opens Settings at the Custom worlds section.
2. Under **Custom worlds**, press **Choose…** and pick the folder. The dialog asks for the folder "with .apworld files".
3. The scan starts straight away when it can run. The section shows "Scanning… (a big folder takes a few minutes)" and a seconds counter. Press **Stop** to end it. A stopped scan keeps nothing.
4. When it finishes, the section says how many custom games it found, or that it found none.

The result is saved, so the app does not scan again every time it starts. Press **Scan again** when you add or change files. A scan that takes longer than fifteen minutes is stopped. In testing, a folder of about 230 files took a few minutes.

## What you see

- **The game list** marks custom games with a **custom** tag. See the picture below.
- **The Custom worlds section** says how many custom games are available, and how many files could not be added, and when the folder was last scanned.
- **The games found** opens a list of each game with its file name and a **Make a YAML** button.
- **Save a starter YAML for every custom game…** asks for a folder and saves a plain starter YAML for each game in it.

A custom game has the same options, checks and Raw view as any other game. A custom game never replaces a bundled game with the same name.

![Custom games tagged in the game list](../images/17-custom-games-tagged-in-the-list.jpg)

## Files that could not be added

A file that cannot be loaded does not stop the others. It is listed under **Files that could not be added** with a plain reason:

- **"Written for a newer Python than the one used to scan (3.12 or later)".** The world uses Python syntax that the scanning Python cannot read. The installed Archipelago runs on Python 3.13, so many custom worlds are written for it. To read them, choose a Python 3.13 (with Archipelago's requirements installed) under **Python program** in Check counts, then scan again.
- **"Needs something that is not installed for the scanning Python"**, naming the missing library. Install it into the Python the scan uses (the source folder's `.venv`, or the Python you chose in Settings), then scan again.
- **"Needs a newer Archipelago"** or **"Made for an older Archipelago"**, with the version range the world supports.
- **"It did not add a game (it may be a tool rather than a world)."**
- Any other problem, shown as the first part of the scanner's message.

![The custom worlds scan with 181 games found and files that could not be added](../images/19-custom-worlds-scan.jpg)

## Limits and safety

- **Loading a world runs that world's own code.** That is what Archipelago's launcher does too. Only choose a folder you trust.
- **The folder is only read.** The app never changes it.
- **Unzipped world folders are not scanned yet.** Only `.apworld` files count.
- **The live check count works for every scanned custom game.** The first count of a custom game loads its `.apworld` into the check engine, so it can take a few seconds longer.
- **Make a seed needs the world in Archipelago's own folder.** It runs Archipelago's generator, which only knows a custom game if its `.apworld` is also in the source folder's `custom_worlds` folder. The Seed tab says this when a custom game is open.
- **Scanning needs a source folder with its Python.** An installed-only Archipelago cannot scan custom worlds.

## A game Yammel has no data for

You do not have to scan anything to edit a custom game's YAML. If you open a YAML whose game Yammel does not know, it reads the options from the file itself. An Archipelago template (the file you get from the launcher's **Generate Template Options**) holds everything an editor needs: each option's name, its weighted choices, its range, the section headings and the description under each option.

- Every option in the file gets a control, and comments and layout are kept like in any other YAML.
- A line at the top says the options were read from the file.
- **Not available for this game:** the live check count, the difficulty estimate, and the checks of item and location names, because Yammel has no list of them. Everything else, such as weights, the Raw view, Triggers and saving, works.
- A file with only plain values (`goal: ganon`) opens too. It has no list of other choices to offer, so such an option is a text box or a number box.
- A name that looks like a misspelling of a game Yammel does know (`Ocarina of Tmie`) is still reported, so a typo is not mistaken for a new game.
- Scanning the custom worlds folder is still worth doing when it works, because a scanned game also has its item and location names.

## Forgetting the folder

Press **Forget this folder** to remove the folder choice and the saved scan. The custom games leave the game list. The `.apworld` files themselves are not touched, and you can choose the folder again later. Choosing a different folder also drops the old scan, so the list never mixes two folders.

The button is unavailable while a scan is running.
