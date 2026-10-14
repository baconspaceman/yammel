# Security policy

How to report a vulnerability in Yammel privately, what is in scope, and how the app is built to keep its risks small.

Contents:

- [Reporting a vulnerability](#reporting-a-vulnerability)
- [What is in scope](#what-is-in-scope)
- [What is out of scope](#what-is-out-of-scope)
- [The security model in plain words](#the-security-model-in-plain-words)
- [What the app never does](#what-the-app-never-does)
- [Supported versions](#supported-versions)

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue, discussion or pull request for a vulnerability.

1. Open the repository on GitHub, go to the **Security** tab and choose **Report a vulnerability** (GitHub's private vulnerability reporting). The direct link is `https://github.com/baconspaceman/yammel/security/advisories/new`.
2. Say what the problem is, which version you tested (the installer file name shows it), how to reproduce it, and what you think an attacker could do with it. A small example file or a short list of steps is enough.
3. Do not include real API keys, passwords or private files. If you need to show where a secret leaks, use a fake one.

This is a small volunteer project. You can expect an acknowledgement, a conversation in the private advisory, and a fix and credit (if you want credit) when the report is confirmed. No fixed response time is promised.

Please give us a reasonable chance to fix the problem before you share details publicly.

## What is in scope

Problems in this repository's own code and data, for example:

- The window (the renderer) doing something it should not: reading or writing a file it was not given, starting a program, or reaching beyond the fixed list of calls in `src/shared/api.ts`.
- A way around the checks in the main process: the sender check, pick-only paths, input validation, or the size limits.
- A save or host.yaml write that can escape the file the person chose, lose data without a backup, or overwrite a file that changed in the meantime.
- Leaking or mishandling a secret: the saved OpenRouter key being sent to the window, written to the settings file or logged; or an API key from the environment reaching a helper program.
- Running a program with a shell, or building a command line from untrusted text.
- A crafted YAML, schema, preset, recommender file or custom world result that can crash the app, run code, or make it do something other than show and edit text.
- The `apyaml` command line tool and MCP server doing something outside their described commands.
- Dependencies we ship in the app with a known vulnerability that is reachable here.

## What is out of scope

- Anything that needs you to already have control of the person's computer or user account, or to change the app's files on disk.
- The code of a custom `.apworld` the person chose to scan. Scanning loads that world with Archipelago's own loader, which runs the world's own code, exactly as the Archipelago launcher would. Only scan folders you trust. A scan that does something unexpected to the app itself (rather than the world doing what its own code says) is in scope.
- Vulnerabilities in Archipelago itself, Python, Claude Code, Codex, OpenRouter or Electron. Report those to their own projects. If this app uses them in an unsafe way, that part is in scope.
- Denial of service by giving the app a very large input it already warns about or limits, unless a limit is missing or can be bypassed.
- Social-engineering, spam and reports from automated scanners with no demonstrated impact.

## The security model in plain words

The window you see is treated as the least trusted part of the app, because it shows text from files and, if you turn a helper on, answers from AI programs.

- **The window can only ask for a short, fixed list of things.** Open, save, count checks, scan custom worlds, read and write host.yaml, and so on. There is no general "run this" or "read that path" call. The list is in `src/shared/api.ts`.
- **The window never chooses file paths.** Files, folders and programs are chosen in dialogs that the main part of the app shows. The app remembers what you picked and only accepts those paths afterwards. The Python program must be named `python` or `python.exe`.
- **Requests are checked.** The main process checks which window sent a request, and checks the contents and size of every request before using it.
- **No shell.** Programs are started directly with a list of arguments, never through a shell, so text in a YAML or a file name cannot become a command.
- **A cleaned environment.** Programs the app starts get the environment with variables that carry API keys or switch accounts removed (for example `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`), so a helper can only use the login you already have.
- **Sandboxed windows.** Both windows run with `contextIsolation` on, `nodeIntegration` off and the Electron sandbox on. They cannot open new windows or navigate away from the app's own page, and every permission request (camera, notifications and similar) is refused. A Content Security Policy blocks remote scripts and requests to other hosts.
- **Safe writes.** Saving a YAML makes a backup of the old file first and never leaves a half-written file. host.yaml changes show exactly which lines change, make a backup first, keep the file's comments and line endings, and are refused if the file changed since you opened it.
- **Secrets stay secret.** If you save an OpenRouter key, it is encrypted with the operating system's own store and never sent back to the window. The settings file holds folder paths and on and off switches, never keys or passwords. Nothing needs a key to work.
- **Archipelago folders are read, not changed.** The app reads an Archipelago source folder to count checks and read options. Making a seed writes into a new folder in your Documents, not into Archipelago's folders.

Details for developers are in [docs/development/architecture.md](docs/development/architecture.md).

## What the app never does

- It never requires an account, a login or an API key.
- It never sends your YAMLs, settings, paths or usage anywhere on its own. The only network request in the code is the OpenRouter helper, and only when you switch it on and give it your own key. Claude Code and Codex, if you switch them on, run on your computer under your own login.
- It never collects analytics or crash reports.
- It never changes your Archipelago installation or source folder (host.yaml is changed only when you review and save it in the host settings screen).
- It never writes a file to a path you did not choose, other than its own settings, backups and saved scan results in its own data folder, and seeds you ask it to make.
- It never stores a key or password in plain text.
- It never starts a program through a shell.

If you find that any statement above is untrue, please report it.

## Supported versions

Only the latest release receives security fixes.
