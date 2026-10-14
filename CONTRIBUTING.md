# Contributing to Archipelago YAML Editor

How to propose a change to Archipelago YAML Editor, what must pass first, and how to extend the difficulty and recommendation data.

Contents:

- [Principles](#principles)
- [Setup](#setup)
- [What must pass before a pull request](#what-must-pass-before-a-pull-request)
- [Code style](#code-style)
- [A good issue](#a-good-issue)
- [A good pull request](#a-good-pull-request)
- [Adding a game's difficulty profile](#adding-a-games-difficulty-profile)
- [Feel profiles for the recommender](#feel-profiles-for-the-recommender)
- [Conduct and security](#conduct-and-security)

## Principles

These decide whether a change fits.

1. **Everything beyond the basics stays optional.** No account, login or key is ever required. Nothing may stop working because an Archipelago folder, a Python, an AI helper or a network connection is missing; the feature that needs it turns itself off and says so in plain words.
2. **Nothing is sent anywhere unless the person switches a helper on.** The app makes no network requests of its own. The optional helpers (Claude Code, Codex, OpenRouter) are each off until turned on in Settings, and each says what it costs.
3. **Verify against Archipelago's real option classes.** Do not assume how an option behaves. Check it against the Archipelago source (the schema extractor and the check engine use Archipelago's own code) and, where it matters, against a real generation. Data that is a draft or a guess must be labelled that way on screen.
4. **Messages are in plain language.** Anything shown to a person says what happened and what to do, with no stack traces, internal names or jargon.
5. **Every new screen gets the layout and accessibility checks.** A screen that is not covered by the end-to-end layout and accessibility audit is not finished. See [docs/development/testing.md](docs/development/testing.md).
6. **The window stays untrusted.** New abilities go through the typed IPC with sender and input checks, and the window never supplies file paths. See [docs/development/architecture.md](docs/development/architecture.md).

## Setup

Follow [docs/development/building-and-running.md](docs/development/building-and-running.md). In short: Node 22 or newer, `npm install`, `npm run dev`. An Archipelago source clone with its Python is optional but needed for anything that touches check counts, the generator, custom worlds or the Python tests.

## What must pass before a pull request

Run these from the project folder:

```bash
npm run typecheck
npm test
```

If you changed anything a person can see, also run the end-to-end suite (it needs a build, and `npm run e2e` does that for you):

```bash
npm run e2e
```

Also:

- If you changed `engine/`, `extractor/` or the schema, run the Python tests (see [building-and-running.md](docs/development/building-and-running.md#python-tests)).
- If you added or changed a screen, it is registered in `tests/e2e/everyScreen.spec.ts` so it is checked for overlapping or clipped text, unnamed controls, low contrast and invisible keyboard focus, in light and dark.
- Tests that skip themselves without an Archipelago clone are not a pass. If your change touches them, run them with a clone present.
- Continuous integration runs `npm run typecheck`, `npm test`, `npm run cli:build` and `npm run bundle`. It does not run the end-to-end tests, so you run those.
- Update the documentation in `docs/` where behaviour changed, and add a line to `CHANGELOG.md` for changes people will notice.

## Code style

- **TypeScript in strict mode.** `tsconfig.json` sets `strict` and `noUncheckedIndexedAccess`. No `any` to get around the type checker.
- **Match the surrounding code.** There is no linter or formatter script in the repository, so follow the file you are editing: its naming, its import order, its quotes and spacing, its comment style. Keep comments in plain sentences that say why, not what.
- **One path for changes to a YAML.** Anything that changes a document produces `Edit` operations (`src/model/edits.ts`) so that preview, undo and the helper work the same everywhere.
- **Pure logic goes outside the renderer.** Put rules and calculations in plain modules such as `src/validate`, `src/difficulty` or `src/randomize` with unit tests next to them, and keep React components thin.
- **Tests with the change.** Put a `*.test.ts` file next to new logic. For a bug fix, add a test that fails without the fix.
- **Python** (`engine/`, `extractor/`): match the existing style and add a `unittest` test next to the others in `engine/tests` or `extractor/tests`.

## A good issue

Use the templates on GitHub. A good bug report has:

- What you did, what you expected and what you saw, with a screenshot if it helps.
- Numbered steps starting from the start screen, if you can.
- The app version (it is in the installer file name) and how you run it (installer, portable exe or from source).
- The Archipelago version and the game or custom world involved, if it matters.
- A small YAML that shows the problem, with anything private removed.

Never paste API keys, tokens or passwords. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in an issue.

A good feature request says what you are trying to do, not only the control you want, and how it could stay optional.

## A good pull request

- Small and about one thing. Separate a refactor from a behaviour change.
- The description says what changes, why, and how a reviewer can try it. For a screen change, include a screenshot in light and dark.
- The checklist in the pull request template is honest: type check and tests pass, end-to-end tests pass if screens changed, nothing became required, messages are plain, docs updated.
- New data (difficulty or feel profiles) says where its numbers come from.

## Adding a game's difficulty profile

The difficulty gauge scores a game from 0 (trivial) to 10 (brutal) by adding up how much each option's current value shifts a base score. A profile is plain JSON; the code is in `src/difficulty/`. Read these before you start:

- `src/difficulty/types.ts`: the profile format and the scale.
- `src/difficulty/profile.ts`: `validateProfile`, which lists everything wrong with a profile in plain words.
- `src/difficulty/score.ts`, `estimate.ts` and `registry.ts`: how a profile is scored, how a rough estimate is made for games that have no profile, and how the two are chosen.
- `data/difficulty/apquest.json` is the smallest example; `data/difficulty/a-link-to-the-past.json` is a larger one.

A profile file has these fields:

| Field | Meaning |
|---|---|
| `format` | Must be `1`. |
| `game` | The game name exactly as in `data/schema.json`. |
| `apVersion` | The Archipelago version it was written against, such as `"0.6.7"`. It must equal the schema's version, and a test checks that. |
| `status` | `drafted` (written from the option metadata), `reviewed` (checked by someone who plays the game) or `estimated`. Shipped profiles must not be `estimated`. |
| `base` | The score with every option at its default, 0 to 10. |
| `options` | One entry per option that matters. |

Each option entry has a one-sentence `why` (shown in "Why this number?") and either `values` or `curve`:

- `values`: a shift for each value, keyed as written in the YAML (`"true"` and `"false"` for switches, the choice key for choices, a special name for named ranges). Shifts are relative to the default, which always adds 0. A value that is not listed shifts by 0.
- `curve`: for ranges and named ranges, a list of `[value, shift]` points with rising values. Between points the shift is a straight line, and outside them it holds the end point.
- No single shift may be larger than 5 in either direction, curve values must lie inside the option's range, and an option must exist in the game.

To add a profile:

1. Create `data/difficulty/<game-slug>.json`, named in the same style as the existing files. It is bundled automatically (`src/difficulty/shipped.ts` loads `data/difficulty/*.json`).
2. Base your shifts on what the option really does in the Archipelago world (read its option class and description), and write each `why` so a player understands the effect. Mark it `drafted` unless a player of the game has reviewed it; the app labels drafts as drafts.
3. Check it with `validateProfile` (the real-data test does this for every shipped profile) and make sure the default settings give exactly `base`.
4. Update `src/difficulty/profiles.real.test.ts`: it lists the shipped profiles by name and counts the rated games, so those expectations change when you add one.
5. Run `npm test` with `data/schema.json` present, then the difficulty end-to-end specs if you changed anything on screen.

Games without a profile still get a rough rule-based estimate, or "Not rated", and that is fine. A guess is better left out than shipped as a fact.

## Feel profiles for the recommender

The Games to mix screen scores pairs of games from three data sources, all bundled with the app and all optional (a game missing from one is shown as guessed rather than hidden):

- `data/feel-profiles.json`: what each game is like. These are drafted judgements, not measurements, and the app says so.
- `data/world-features.json`: measured facts (checks, items, how much is open at the start, whether a ROM is needed, emulator systems), generated by `scripts/scan-worlds.ps1`.
- The difficulty gauge's score at default options.

The code is in `src/recommend/`: `types.ts` (the shapes), `games.ts` (reads the files and builds the game list), `score.ts` (how a pair is scored and how the mood and sliders weigh the parts), `select.ts` and `state.ts`.

A feel profile has: `genre`, `pace` (1 relaxed to 5 frantic), `length` (1 under an hour to 5 twenty hours or more), up to three `tones`, `era` (`classic` up to 1995, `mid` 1996 to 2007, or `modern` after), `families` (franchise or maker groups; games sharing one count as the same series) and `activities`. A profile with an invalid `pace`, `length` or `era` is dropped on load.

Do not edit `data/feel-profiles.json` by hand. It is generated from the table in `scripts/make-feel-profiles.py`:

1. Edit the game's row in the table at the top of the script (the field order is in the comment above the table).
2. Run `python scripts/make-feel-profiles.py`. It refuses to write if the table and `data/schema.json` disagree, so a newly bundled game needs a row and a removed game needs its row taken out.
3. Run `npm test`, which includes the recommender tests.

When you change a profile, say in the pull request what you used to decide, since these are judgement calls.

## Conduct and security

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md).
