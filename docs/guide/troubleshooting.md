# Troubleshooting

This page lists the problems people run into with the Archipelago YAML Editor, what each message means, and what to do about it.

Contents:

1. [How to read this page](#how-to-read-this-page)
2. [The check count says "Unavailable"](#the-check-count-says-unavailable)
3. ["Archipelago has not been set up on this computer yet"](#archipelago-has-not-been-set-up-on-this-computer-yet)
4. [The Seed tab says "It cannot run here"](#the-seed-tab-says-it-cannot-run-here)
5. [Archipelago would not make a seed](#archipelago-would-not-make-a-seed)
6. [A host.yaml could not be found or changed](#a-hostyaml-could-not-be-found-or-changed)
7. ["host.yaml was changed by something else"](#hostyaml-was-changed-by-something-else)
8. [A custom worlds scan lists files that could not be added](#a-custom-worlds-scan-lists-files-that-could-not-be-added)
9. [A custom worlds scan will not run, or does not finish](#a-custom-worlds-scan-will-not-run-or-does-not-finish)
10. [The Helper does not answer](#the-helper-does-not-answer)
11. [An AI helper is "not set up"](#an-ai-helper-is-not-set-up)
12. [A file will not open](#a-file-will-not-open)
13. [A file will not save](#a-file-will-not-save)
14. [The window is too small](#the-window-is-too-small)
15. [Still stuck](#still-stuck)

## How to read this page

Each problem has three parts: **Problem** (what you see), **What it means**, and **What to do**. Messages are quoted exactly as the app shows them. If a message has a folder or file name in it, yours will show your own.

Most extras in the app (the check count, Make a seed, custom worlds, the AI helpers) are optional. When one of them does not work, editing, the live YAML preview, the problem checker, Randomize and saving all keep working.

## The check count says "Unavailable"

**Problem.** In the bar under the YAML header, the **Checks** number shows **Unavailable**, with a note beside it and a **Set up check counts** button.

**What it means.** The live check count asks Archipelago itself to count the checks. For that it needs an Archipelago **source** folder with its own Python. The note tells you which part is missing. These are the notes you may see:

- "No Archipelago source folder was found. The check count needs one; everything else works without it."
- "The folder (your folder) was not found." You chose a folder in Settings that is no longer there.
- "(your folder) does not look like an Archipelago source folder (it has no ModuleUpdate.py and worlds folder)."
- "The Archipelago folder (your folder) has no Python environment (.venv). Set one up there, or choose a Python below."
- "The Python you chose ((your Python)) was not found."
- "The check engine could not be started:" followed by a reason.
- "The check engine keeps stopping, so it was switched off for a minute."

**What to do.**

1. Press **Set up check counts**, or open **Settings** and find **Check counts**.
2. Press **Browse…** next to **Archipelago source folder** and pick a source folder. The installed copy of Archipelago, the one with the launcher, is not a source folder and cannot be used for the count.
3. Make sure that folder has a `.venv` Python environment with Archipelago's requirements installed. If it does not, or you keep your Python somewhere else, press **Browse…** next to **Python program**.
4. If you made a change and the count still says unavailable, wait a moment. After an "unavailable" the app waits about 30 seconds before it asks again, and it retries by itself.
5. For the "keeps stopping" note, wait a minute and edit something. If it comes back, the Python environment is probably missing a requirement. Reinstall Archipelago's `requirements.txt` into the `.venv`.

Or leave it. The count is a convenience. The difficulty gauge and everything else work without it. See [Settings and appearance](settings-and-appearance.md#check-counts) and [Checking your work](checking-your-work.md).

## "Archipelago has not been set up on this computer yet"

**Problem.** On the **Seed** tab, a red box says **It cannot run here.** with this line: "Archipelago has not been set up on this computer yet. Open the Archipelago launcher once so it can create its host.yaml, then try again."

**What it means.** To make a seed the app runs Archipelago's generator. The generator needs the `host.yaml` file next to it. The app never changes an Archipelago folder on its own, so it will not create that file for you. The same message appears for a source folder and for an installed Archipelago.

**What to do.** Open the Archipelago launcher once. It creates `host.yaml`. Then go back to the **Seed** tab and try again. If you only use a source folder, running Archipelago from it once does the same.

## The Seed tab says "It cannot run here"

**Problem.** The **Seed** tab shows **It cannot run here.** and one of these lines:

- "No Archipelago was found to make a seed with. Install Archipelago, or choose a source folder in Settings."
- "The Archipelago folder (your folder) has no Generate.py."
- "ArchipelagoGenerate.exe was not found in (your folder)."

**What it means.** The app looked for a way to run the generator and found none that works. It uses your source folder and its Python if you have one set up. If not, it uses the installed `ArchipelagoGenerate.exe`.

**What to do.** Install Archipelago, or choose a source folder under **Check counts** in Settings. Check that the folder is a complete copy, with `Generate.py` in it. If the installed copy is missing `ArchipelagoGenerate.exe`, reinstall Archipelago from its own installer. The **Open Settings** button on the Seed tab takes you to the right place.

## Archipelago would not make a seed

**Problem.** The **Seed** tab shows **Archipelago would not make a seed.** with a short list of reasons, and a **Show the full log** button. Or it shows **It was stopped.** with "It took longer than five minutes, so it was stopped." or "You stopped it."

**What it means.** The generator ran, but it refused your YAML or it could not place every item. The app picks out the lines that explain the refusal. For a YAML Archipelago does not accept, the first line is like "(file name) is not accepted." followed by the reasons Archipelago gave. For other failures you see the last error lines the generator printed. If it printed nothing useful, the app says "The generator stopped without saying why." Other lines you may see:

- "The generator finished but wrote no seed file."
- "One of the extra player files was not chosen with the file dialog, so it was not used."
- "It could not be started:" followed by a reason.

**What to do.**

1. Read the reasons. They usually name an option or value that is not allowed.
2. Look at the problem checker in the editor. It often points at the same thing. See [Checking your work](checking-your-work.md).
3. Press **Show the full log** if the reasons are not enough, and look near the end.
4. Fix the YAML and press **Check it** again.
5. If you added other players' files, remember the generator reads all of them. The reason may be in one of the other files.
6. If your game is a custom world, Archipelago only knows it if its `.apworld` file is also in Archipelago's own `custom_worlds` folder. See [Custom worlds](custom-worlds.md#limits-and-safety).
7. If the run was stopped for taking longer than five minutes, try a smaller setup, or run the seed in the Archipelago launcher instead.

## A host.yaml could not be found or changed

**Problem.** The host.yaml editor shows one of these messages:

- "That host.yaml could not be found on this computer."
- "That host.yaml is too large to be a real one."
- "(path) is not there any more."
- "Windows did not allow changing (path). If Archipelago is installed in a protected folder, close this app and open it as administrator, or make the change in a text editor."
- "(path) is in use by another program. Close Archipelago and try again."
- "The changed host.yaml could not be read back, so nothing was written."
- "Save or discard your changes before switching to the other host.yaml."

**What it means.** The editor can work with up to two files: the host.yaml of an installed Archipelago, and the host.yaml of a source folder. It only lists the ones it finds. The others are file-permission and file-in-use problems on your computer.

**What to do.**

- **Could not be found, or not there any more.** Open the Archipelago launcher once so it creates the file, or check that the folder still exists. Then open **Settings** and use **Open host.yaml settings** again.
- **Windows did not allow changing it.** Archipelago in a folder such as Program Files is protected. Either close the app and start it again as administrator, or make the change in a text editor yourself.
- **In use by another program.** Close Archipelago and any other program that has the file open, then save again.
- **Could not be read back.** The text you changed is no longer a list of settings. Review your last change in the review step, and undo it.
- **Switching to the other host.yaml.** Save or discard your changes first. The editor does not keep unsaved changes when you switch.

Before every save the editor makes a backup of the file it is about to change. After a save it tells you where the old file was kept. See [Archipelago's own settings (host.yaml)](archipelago-settings-host-yaml.md).

## "host.yaml was changed by something else"

**Problem.** When you save, the editor says: "host.yaml was changed by something else since you opened it. Reload it, then make your change again."

**What it means.** The file on disk is no longer the same as the one you opened. Another program, or you in a text editor, changed it. The editor refuses to save, so it does not overwrite those changes. Nothing was written.

**What to do.** Press **Reload the file** in the host.yaml editor so you see its current contents. Then make your change again and save. If you have changes in a text editor that are not yet saved, save those first.

## A custom worlds scan lists files that could not be added

**Problem.** After a scan, the **Custom worlds** section says some files could not be added, and lists each one under **Files that could not be added** with a reason. The other files in the folder still work.

**What it means.** The scan loads each `.apworld` with Archipelago's own loader, one at a time. A file that fails is skipped. The reasons are these, shown as written:

| Reason shown | What it means | What to do |
|---|---|---|
| "Written for a newer Python than the one used to scan (3.12 or later), so it could not be read." | The world uses newer Python syntax than the Python the scan uses. | Choose a newer Python under **Python program** in Settings (with Archipelago's requirements installed), then scan again. Or skip that world. |
| "Needs something that is not installed for the scanning Python (name)." | The world needs a Python library the scanning Python does not have. The library's name is in brackets. | Install that library into the Python the scan uses (the `.venv` of your source folder, or the Python you chose), then press **Scan again**. |
| "It did not add a game (it may be a tool rather than a world)." | The file loaded but did not add a game. Some `.apworld` files are helper tools. | Nothing to fix. It is not a game. |
| "Needs a newer Archipelago (0.7.0 or later)." (the version may differ) | The world was made for a newer Archipelago than your source folder. | Update the Archipelago source folder, or use an older release of the world. |
| "Made for an older Archipelago" followed by a version | The world was made for an older Archipelago and your source folder is newer. | Look for an updated release of the world. |
| Anything else | The first part of the scanner's own message, cut to about 160 characters. | Search for the message, or ask the world's author. |

The scan never changes your folder. See [Custom worlds](custom-worlds.md#files-that-could-not-be-added).

## A custom worlds scan will not run, or does not finish

**Problem.** The scan does not start, or ends with a message.

**What it means and what to do.**

- "Scanning custom worlds needs an Archipelago source folder with its Python. Choose one under "Check counts" above." Scanning needs the same source folder and Python as the check count. Set that up first. An installed Archipelago alone cannot scan.
- If the source folder has its own problem (for example no `.venv`), the scan shows that problem's note instead. These are the same notes as in [The check count says "Unavailable"](#the-check-count-says-unavailable).
- "The scan finished but found no games in that folder." The folder had no `.apworld` files directly in it. Files in sub-folders and unzipped world folders are not read.
- "The scan was stopped." You pressed **Stop**. A stopped scan keeps nothing.
- "The scan took longer than fifteen minutes, so it was stopped." Try a smaller folder.
- "The scan did not finish." followed by the last line the scanner printed. One of the worlds probably crashed the scanner. Move the world files you do not trust out of the folder and scan again.
- "The scan produced far more data than expected, so it was not kept."
- "The scan result could not be read:" followed by a reason. Press **Scan again**. If it keeps happening, press **Forget this folder** and choose it again.

If the saved scan result is damaged, the app still starts. It falls back to the bundled games only, and a new scan restores the custom ones.

## The Helper does not answer

**Problem.** You type in the Helper and the answer is a message like one of these:

- "Something went wrong while asking, so nothing was changed. You can try again, or switch to the built-in guide."
- "Claude Code took too long to answer." / "Codex took too long to answer." / "OpenRouter took too long to answer."
- "OpenRouter could not be reached. Check your internet connection."
- "(Name) is switched off in Settings."
- "That request is too large to send." / "That request could not be sent."
- "(Name) did not give an answer." / "Claude Code gave an answer that could not be read."
- "(Name) said: (text)" followed by what the program reported.

**What it means.** The built-in guide runs on your computer and always answers. The messages above come from the optional AI helpers, which depend on a program or a service outside this app.

**What to do.**

1. Try once more. A slow answer can be a one-off.
2. Switch the **Who answers** menu in the Helper back to **Built-in guide**. It needs nothing and costs nothing.
3. Open **Settings** and check that the helper is switched on under **Optional AI helpers**.
4. Check your internet connection if you use OpenRouter.
5. Try a shorter message if the request was too large.
6. Check the sign-in and allowance messages in the next section.

## An AI helper is "not set up"

**Problem.** In the Helper's **Who answers** menu, a helper shows "(not set up)" and cannot be picked, with a note under the title. Or an answer says a helper is not ready.

**What it means.** The app only offers a helper that is switched on in Settings **and** actually ready. The notes are:

- "Not found on this computer. Install Claude Code and sign in to use it."
- "Not found on this computer. Install Codex and sign in to use it."
- "Needs your own OpenRouter key. Each question costs a small amount of money, charged to your OpenRouter account."
- "This computer cannot keep a key safely, so OpenRouter cannot be used here."
- "Claude Code was not found on this computer." / "Codex was not found on this computer."
- "No OpenRouter key has been saved. Add one in Settings."

Other messages about your account that the helpers can show:

- "Claude Code is not signed in on this computer. Open a terminal, run "claude", sign in, and try again." (Codex: run "codex login".)
- "(Name) says you have used up your allowance for now. Try again later."
- "OpenRouter did not accept the saved key. Check it in Settings."
- "OpenRouter says the account is out of credit."
- "OpenRouter says there are too many requests right now. Try again in a moment."
- "OpenRouter answered with an error (number)."
- "This computer cannot keep a secret safely, so the key was not saved."

**What to do.** For Claude Code or Codex, install the program, run it once in a terminal and sign in, then reopen Settings. For OpenRouter, paste your own key in **OpenRouter key** and press **Save key**. If your system cannot store a key safely, the app will not save it. Use Claude Code, Codex or the built-in guide instead. No helper is needed to use the editor. See [The Helper](helper.md).

## A file will not open

**Problem.** Opening a file shows a message, or the editor says **This file can't be edited yet**.

**What it means and what to do.**

- "Only .yaml and .yml files can be opened." The file has a different ending. Rename it, or pick a `.yaml` or `.yml` file.
- "That is not a file." You picked a folder or something else.
- "That file is too large to be a player YAML." Player files are limited to 2 MB. A real player YAML is far smaller.
- "That file could not be found." It was moved or deleted after the app listed it. Open it from where it is now.
- "Permission was denied for that file." Your account is not allowed to read it. Move a copy somewhere you can read.
- "That file is in use by another program." Close the program that has it open and try again.
- "The file operation failed." Something else went wrong. Try copying the file to your Documents folder and opening that copy.
- **This file can't be edited yet.** The text is not valid YAML. The app lists each problem with a line number and says: "Nothing has been changed. Fix the problems below in a text editor, then open the file again."
- **This YAML does not say which game it is for.** The file has no `game:` line.
- **"(name)" is not in the game list.** The game name is misspelled, or it is a custom world you have not scanned yet. Fix the name, or scan the custom worlds first.

More about opening, damaged files and files with several players is in [Files and saving](files-and-saving.md).

## A file will not save

**Problem.** Saving shows a message instead of "Saved."

**What it means and what to do.**

- "Permission was denied for that file." / "That file is in use by another program." Choose another folder with **Save as**, or close the program that has the file open.
- "The file could not be verified after writing, so the original was left untouched." The new file did not read back the same. Your old file is safe. Try saving again, or to another folder.
- "Could not choose a name for the backup file." The app could not make a backup, so it did not save over your file. Try a different folder.
- "The game option data (schema.json) could not be read." The app's own data file is damaged or missing. Reinstall the app.

If the app cannot look at an existing file, it stops. It does not save over a file it could not examine. Backups are kept in the app's own data folder. See [Files and saving](files-and-saving.md#backups-and-safe-saving).

## The window is too small

**Problem.** Parts of the app are cut off or hard to reach, or buttons have vanished.

**What it means.** The main window is built to be at least 900 by 600 pixels. It will not shrink below that. On a small screen or with a large Windows display scale, there may not be room for everything.

**What to do.**

- Make the window larger, or maximize it.
- Lower your display scaling in your computer's display settings, if it is set very high.
- Use the **Pop out** button in the Helper to move the chat to its own window. That window can be smaller (at least 340 by 420 pixels), and it gives the editor more room.

## Still stuck

- Read the guide for the part of the app you are using: [Getting started](getting-started.md), [Editing options](editing-options.md), [Checking your work](checking-your-work.md), [Files and saving](files-and-saving.md), [Custom worlds](custom-worlds.md), [The Helper](helper.md).
- Look at [Settings and files](../reference/settings-and-files.md) to see where your settings and backups are kept.
- Look at the [FAQ](faq.md).
- This is an independent tool. For questions about Archipelago itself, ask the Archipelago community.

## Related guides

- [Settings and appearance](settings-and-appearance.md)
- [Archipelago's own settings (host.yaml)](archipelago-settings-host-yaml.md)
- [Ideas and shortcuts](ideas-and-shortcuts.md)
- [FAQ](faq.md)
