# FAQ

Short answers to the questions people ask most about the Yammel.

Contents:

1. [The basics](#the-basics)
2. [Privacy and your files](#privacy-and-your-files)
3. [Games and custom worlds](#games-and-custom-worlds)
4. [Archipelago and the optional extras](#archipelago-and-the-optional-extras)
5. [Helpers and ideas](#helpers-and-ideas)

## The basics

### What is it?

It is a desktop app that helps you make player files (YAMLs) for Archipelago, the multiworld game randomizer, without editing text by hand. You pick a game, change its options, and watch the YAML update as you go. See [Getting started](getting-started.md).

### Is it free?

Yes. It is open source under the MIT license, with no price and no subscription. A few optional AI helpers use your own accounts, and those can cost money at their end. That is explained below.

### Does it need an account, a login or a key?

No. Nothing is required. Editing, the live YAML preview, the problem checker, the difficulty gauge, Randomize, Game roulette, presets and saving all work with nothing set up. The optional extras can be left off for good. See [Settings and appearance](settings-and-appearance.md#everything-is-optional).

### Is it part of Archipelago? Is it affiliated with it?

No. It is an independent tool, not affiliated with or endorsed by the Archipelago project. It works with Archipelago's own files and code, and it makes ordinary YAML files that Archipelago reads. If you have a question about Archipelago itself, ask the Archipelago community.

### Is it Windows only?

These guides are written for Windows, and a few messages mention Windows by name. They do not cover other systems, so they make no promise about how the app behaves elsewhere.

### What can I do without installing Archipelago?

Quite a lot. You can edit every option for every bundled game, use the live YAML preview, run the problem checker, see the difficulty gauge, Randomize, spin Game roulette, use presets and save. The game option data ships inside the app, so there is nothing to download. Archipelago is only needed for the live check count, Make a seed, custom world scans and the host.yaml editor. See [Checking your work](checking-your-work.md).

## Privacy and your files

### Does it send my YAML anywhere?

Not by itself. Editing, checking and saving all happen on your computer. Your YAML only leaves your computer if you switch on one of the optional AI helpers (Claude Code, Codex or OpenRouter) and then type a question in the Helper. Then your current YAML and descriptions of the game's options are sent to that helper. The app asks you to confirm each time you switch one on. The built-in guide never sends anything. See [The Helper](helper.md).

### Where are my files kept?

Your YAML files are wherever you save them. A new YAML starts the save window in your Documents folder. Seeds you make go in your Documents folder too, in a folder named **Yammel**, with a **Seeds** folder inside it. Each seed gets its own folder named with the date and time.

### Where are my settings and backups?

In the app's own data folder, which your operating system sets aside for the app. It holds your settings, recent files, presets, the Games to mix memory, the saved results of a custom worlds scan, and your backups. See [Settings and files](../reference/settings-and-files.md).

### Does it back up my files?

Yes. Before the app saves over a file that already exists, it copies the old version into a backups folder of its own. The backup is named with your file name, the date and time, and `.bak`. The app also writes the new file to a temporary file, checks it, and only then replaces yours. See [Files and saving](files-and-saving.md#backups-and-safe-saving).

### Can it lose my work?

If you have unsaved changes and try to open another file, the app asks first: "You have unsaved changes. Discard them?" Press **Cancel** and save. Saving always makes a backup first, and a failed save leaves your original untouched.

### How is my OpenRouter key kept?

If you choose to use OpenRouter, the key is stored in a separate file, encrypted by your operating system, and the app never reads it back into the window. If your system cannot keep it safely, the app refuses to save it. Settings never holds a password or a key. See [Settings and appearance](settings-and-appearance.md#where-settings-are-kept).

## Games and custom worlds

### Which games does it support?

All 80 games bundled with Archipelago 0.6.7, with every option of every game. The data ships inside the app. See [Editing options](editing-options.md).

### Can I add my own games?

Yes, with custom worlds. If you have `.apworld` files for extra games, point the app at the folder and scan it. The games then appear in the game list with a **custom** tag. A custom game never replaces a bundled game with the same name. See [Custom worlds](custom-worlds.md).

### What is a custom world scan?

It is how the app learns about games that are not bundled. It runs Archipelago's own world loader over your folder of `.apworld` files, one at a time, and saves what it found. The result is kept, so it does not scan again every time you start the app. Press **Scan again** when you add or change files. A file that cannot be loaded is listed with a plain reason, and the others still work. If a file will not load, see [Troubleshooting](troubleshooting.md#a-custom-worlds-scan-lists-files-that-could-not-be-added).

### Is scanning custom worlds safe?

The app only reads the folder and never changes it. But loading a world runs that world's own code, exactly as the Archipelago launcher would. Only scan a folder you trust.

### Why does a custom game say it is unknown when I check or make a seed?

The live check count and Make a seed use Archipelago itself, and Archipelago only knows a custom game if its `.apworld` file is also in Archipelago's own `custom_worlds` folder. Copy it there. See [Custom worlds](custom-worlds.md#limits-and-safety).

## Archipelago and the optional extras

### Why does it ask for an Archipelago source folder?

Only for the live check count and for scanning custom worlds, because those run Archipelago's own world-building code. That needs the Archipelago source and a Python with its requirements installed. The installed Archipelago, the one with the launcher, is not a source folder. If you never set one up, the app works as normal and the count says **Unavailable**. See [Settings and appearance](settings-and-appearance.md#check-counts).

### What does the check count do?

It shows how many checks your YAML would create, live, as you change options. It sits next to the difficulty gauge. It asks Archipelago itself, so the number matches what Archipelago would use. Random and weighted options are counted at their defaults, and the bar says so. See [Checking your work](checking-your-work.md).

### Does it change my Archipelago install?

Not on its own. It reads Archipelago folders and never changes them while you edit, check or scan. The exceptions are things you ask for. The host.yaml editor changes Archipelago's `host.yaml` only when you press save, after a review step, and it makes a backup first. Make a seed writes seeds to your Documents folder, not into Archipelago.

### What is the host.yaml editor?

It lets you edit Archipelago's own settings file as a form instead of as text. It shows a review of your changes before saving, makes a backup, and refuses to save if the file was changed by something else in the meantime. See [Archipelago's own settings (host.yaml)](archipelago-settings-host-yaml.md).

### Can it make a seed?

Yes, if Archipelago is set up. The **Seed** tab can check that Archipelago accepts your YAML (**Check it**, which writes nothing) or write a real seed (**Make the seed**). It uses Archipelago's own generator. If Archipelago refuses the YAML, the tab lists the reasons in plain lines. See [Checking your work](checking-your-work.md#the-seed-tab).

## Helpers and ideas

### What is the Helper?

A chat that answers with changes you can apply or skip. The built-in guide is on by default, runs on your computer, and costs nothing. It answers from the open YAML and the game's option descriptions. Claude Code, Codex and OpenRouter are optional and off until you switch them on. See [The Helper](helper.md).

### Who pays for the AI helpers?

You do, if you use them. Claude Code and Codex use your own sign-in and your own allowance with those services. OpenRouter charges a small amount for each question to your own OpenRouter account. The app never adds a key of its own. The built-in guide is free. If a helper is not ready, the Helper says it is "not set up". See [Troubleshooting](troubleshooting.md#an-ai-helper-is-not-set-up).

### Can I make a YAML without knowing what I want?

Yes. **Randomize** rolls new values for one option or for all of them. **Game roulette** picks a game for you. **Games to mix** suggests pairs of games that go well together. **Presets** save and reuse a set of choices. See [Ideas and shortcuts](ideas-and-shortcuts.md).

## Related guides

- [Getting started](getting-started.md)
- [Troubleshooting](troubleshooting.md)
- [Settings and appearance](settings-and-appearance.md)
