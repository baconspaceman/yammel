# Settings and appearance

Settings is where you choose how the app looks and switch on the optional extras. Every part of it is optional: the editor works with all of it left as it is.

Contents:

- [Opening Settings](#opening-settings)
- [Appearance](#appearance)
- [Check counts](#check-counts)
- [Custom worlds](#custom-worlds)
- [Archipelago's own settings](#archipelagos-own-settings)
- [Optional AI helpers](#optional-ai-helpers)
- [Where settings are kept](#where-settings-are-kept)
- [Everything is optional](#everything-is-optional)

## Opening Settings

Press **Settings** in the toolbar. Press **Back** to return to where you were.

![The Settings page](../images/18-settings.jpg)

## Appearance

Choose how the app looks. The options are:

- **Same as my computer**, which follows your computer's light or dark setting.
- **Light**
- **Dark**

The toolbar also has a button for this. It shows **Auto**, **Light** or **Dark**, and each press moves to the next one in that order.

![The start screen in light mode](../images/22-light-start-screen.jpg)

## Check counts

The live check count needs an Archipelago **source** folder with its own Python. Without one, everything else still works, and the count says it is unavailable.

At the top of the section, a line says either "Ready. Using [folder] ([where it came from])." or "Off." followed by the reason.

- **Archipelago source folder** shows **Automatic** or the folder you chose. Press **Browse…** to choose a folder, or **Use automatic** to go back to automatic.
- **Python program** shows **Automatic (the folder's own .venv)** or the Python you chose. Press **Browse…** to choose one, or **Use automatic**.
- **Installed Archipelago** says whether an installed copy was found. The editor only looks at it and never changes it.

**How automatic works.** The app takes the first of these that is set, and does not try the others if it is wrong:

1. The folder you chose here.
2. The `ARCHIPELAGO_AP_ROOT` setting on your computer, if you have one.
3. An Archipelago folder inside an `archipelago-dev` folder next to the app.

A source folder must contain `ModuleUpdate.py` and a `worlds` folder. Its Python is the `.venv` (or `venv`) folder inside it, unless you choose another.

## Custom worlds

Choose the folder of extra `.apworld` games, scan it, and forget it again when you no longer need it. The full steps are in [Custom worlds](custom-worlds.md).

## Archipelago's own settings

Press **Open host.yaml settings** to edit Archipelago's own settings file as a form, with a review and a backup before anything is saved. See [Archipelago's own settings (host.yaml)](archipelago-settings-host-yaml.md).

## Optional AI helpers

These add an AI that understands more open-ended requests in the Helper. Each one is off until you switch it on, and the built-in guide keeps working without them.

- **Claude Code**, **Codex** and **OpenRouter** each have a checkbox, **Use [name] in the Helper**. The first time you switch one on, the app asks you to confirm what is sent.
- **Model (optional)** lets you choose a model. Leave it empty for the default.
- **OpenRouter key** is where you paste your OpenRouter key. Press **Save key**, or **Remove key** to delete it.

The Helper page explains what each one sends, who pays, and how the key is kept: [The Helper](helper.md).

## Where settings are kept

Everything is stored in the app's own data folder on your computer, which the operating system sets aside for this app.

- **Settings** are saved in one small file, `settings.json`. It holds folder paths, switches, your appearance choice and any model names. It never holds a password or a key. Nothing is written until you change a setting.
- **Your OpenRouter key** is kept in a separate file, `secrets.json`. The operating system encrypts it, and the app never reads it back into the window.
- **Other things the app remembers** are kept in the same folder: recent files, your saved presets, the Games to mix memory, the results of a custom worlds scan, and backups made before saves.
- **Make a seed** writes its output to a folder named **Yammel**, with a **Seeds** folder inside it, in your Documents folder.

If a settings file is damaged or cannot be read, the app starts with the defaults.

For the full list of files and where they are, see [Settings and files](../reference/settings-and-files.md).

## Everything is optional

Nothing in Settings is required, and the app needs no account, login or key. Editing, preview, save, undo, the difficulty estimate, Randomize and Game roulette all work with nothing set up. The live check count, Make a seed, custom worlds, the host.yaml editor and the AI helpers each add something on top, and each can be left off.
