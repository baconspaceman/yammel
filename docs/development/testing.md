# Testing

The test layers of Archipelago YAML Editor, how to run each one, and the traps that cost time.

Contents:

- [The layers at a glance](#the-layers-at-a-glance)
- [Vitest unit tests](#vitest-unit-tests)
- [Playwright end-to-end tests](#playwright-end-to-end-tests)
- [Which end-to-end tests need Archipelago](#which-end-to-end-tests-need-archipelago)
- [The layout checker](#the-layout-checker)
- [The accessibility audit](#the-accessibility-audit)
- [Python tests](#python-tests)
- [Traps](#traps)

## The layers at a glance

| Layer | Where | Command | Needs an Archipelago source folder? |
|---|---|---|---|
| Type check | whole project | `npm run typecheck` | No |
| Unit tests (Vitest) | `src/**/*.test.ts` and `.tsx` | `npm test` | Only for the "real" tests, which skip themselves without it |
| End-to-end tests (Playwright, against the built app) | `tests/e2e/*.spec.ts` | `npm run e2e` | Only for a few specs |
| Layout checker | `tests/e2e/layoutCheck.ts` | used by the end-to-end specs | No |
| Accessibility audit | `tests/e2e/a11yCheck.ts` | used by the end-to-end specs | No |
| Python tests | `extractor/tests`, `engine/tests` | `python -m unittest` (see below) | Yes |

Continuous integration (`.github/workflows/ci.yml`) runs the type check, the unit tests, `npm run cli:build` and `npm run bundle`. It does not run the end-to-end tests, so run them yourself when you change a screen.

## Vitest unit tests

- **Where they live.** Next to the code they test, named `<file>.test.ts` or `<file>.test.tsx`. `vitest.config.ts` includes `src/**/*.test.{ts,tsx}` and sets `src/test-setup.ts`, which removes whatever each component test rendered. Component tests (`.tsx`) run in jsdom, set per file, using React Testing Library and `user-event`.
- **Run everything:** `npm test` (that is `vitest run`).
- **Run one file:** `npx vitest run src/model/document.test.ts`. A name filter also works: `npx vitest run -t "part of a test name"`.
- **Fixtures.** `tests/fixtures` holds a small schema (`mini-schema.json`, `mini-schema-named.json`), sample player YAMLs (`tests/fixtures/player-yamls`), a sample `host.yaml`, fake programs for the engine, generator and helper CLIs (`fake-engine.mjs`, `fake-generate.mjs`, `fake-cli.mjs`) and `make-tiny-apworld.py`.
- **"Real" tests.** Files named `*.real.test.ts`, and `src/schema/real-schema.test.ts`, check the shipped data against the real `data/schema.json` (and some need an Archipelago clone). They use `describe.skipIf` or `describe.skip` conditions, so they skip themselves when the file or clone is missing. A skipped test is not a pass: if you changed anything these cover, make sure they actually ran.
- **Engine and detection tests.** `src/main/engine.test.ts` and `src/main/detect.test.ts` cover finding the source folder and starting the engine; the former can use a real clone when `ARCHIPELAGO_AP_ROOT` is set or the sibling `archipelago-dev/Archipelago` folder exists.

## Playwright end-to-end tests

These start the real, built Electron app, so build first.

```bash
npm run bundle                 # builds main, preload and renderer into out/
npx playwright test            # all specs, or:
npx playwright test tests/e2e/smoke.spec.ts   # one spec
npx playwright test -g "part of a test title" # by title
```

`npm run e2e` does the build and the whole run in one step (`electron-vite build && playwright test`). If you changed source code and run `npx playwright test` without bundling, you are testing the old build.

How the harness works (`tests/e2e/helpers.ts` and `fixtures.ts`):

- `playwright.config.ts` uses `testDir: tests/e2e`, one worker, no retries and a 60 second default timeout (individual tests raise it with `test.setTimeout`).
- Every test gets its own freshly launched app with a throwaway user-data folder (`--user-data-dir`), so tests never touch real settings, presets or backups. The app is always closed afterwards.
- Specs can change the environment with `test.use({ extraEnv: {...} })` and the schema with `test.use({ schema })`. Many specs point `ARCHIPELAGO_AP_ROOT` at a folder that does not exist, so they behave like a machine with nothing set up. `tests/e2e/helpers.ts` has helpers to answer the Open and Save dialogs (`answerOpenDialog`, `answerSaveDialog`), resize the window (`setWindowSize`), set the zoom (`setZoom`) and count stray Python processes (`seedEngineProcessCount`, `generatorProcessCount`).
- `tests/e2e/packaged.spec.ts` runs the unpacked installer build (`dist/win-unpacked`) and skips itself when it is not there. Build it with `npm run dist:dir`.
- `playwright.portfolio.config.ts` and `tests/portfolio` make the screenshots for the `portfolio/` folder. They are not part of the normal run.

## Which end-to-end tests need Archipelago

Needing a real Archipelago source folder (the sibling `../archipelago-dev/Archipelago` with its `.venv`, or `ARCHIPELAGO_AP_ROOT`; see [building-and-running.md](building-and-running.md)):

- `tests/e2e/seedmeter.spec.ts`: the live check count with the real engine. The first count loads every world and can take a couple of minutes. The "engine is started on demand and stopped when idle" test also lives here.
- `tests/e2e/seed.spec.ts`: runs the real Archipelago generator. Seeds go to a throwaway folder (`ARCHIPELAGO_YAML_SEEDS`).
- `tests/e2e/customWorlds.spec.ts`: scans a throwaway folder holding one tiny real world and one broken one with the real loader; it builds the tiny world with `tests/fixtures/make-tiny-apworld.py`, run by the clone's Python.
- `tests/e2e/settings.spec.ts`: most of it runs without Archipelago; the test "choosing the Archipelago folder turns the check count on" skips itself when the clone is missing.
- `tests/e2e/packaged.spec.ts`: needs the unpacked build; the engine part runs only if the clone exists.

Everything else runs with no Archipelago folder. Some specs use the real `data/schema.json` (for example the layout and performance specs deliberately use the biggest real games); others use `tests/fixtures/mini-schema.json` through `MINI_SCHEMA`.

Only `settings.spec.ts` and `packaged.spec.ts` contain an explicit skip for a missing clone or build. Run the seed, custom world and check count specs only on a machine that has the clone.

## The layout checker

`tests/e2e/layoutCheck.ts` exports `checkLayout(page)` and `checkEverything(page)`.

- `checkLayout` measures every visible piece of text and reports plain-language problems: two pieces of text drawn on top of each other, text wider than its box that is not meant to scroll or end in an ellipsis, text drawn outside the window, and the whole page scrolling sideways. Text hidden by a scrolling or clipping ancestor is not counted. The report also says how many text boxes it measured, so a test can prove it looked at something.
- `checkEverything` runs `checkLayout` at every scroll position of every scrollable area, so text that is only visible after scrolling is measured too.
- `tests/e2e/layoutCheck.spec.ts` tests the checker itself, `tests/e2e/layout.spec.ts` runs it on stress-test games at several window sizes in light and dark, and most feature specs call `checkEverything` on their own screens (usually at a small window size and at 200 percent zoom).

Every new screen, panel or dialog must be covered by it.

## The accessibility audit

`tests/e2e/a11yCheck.ts` exports two functions, both returning plain sentences (an empty list is a pass):

- `auditAccessibility(page)`: controls with no name, pictures with no text, repeated ids, text that is hard to read against its background, and keyboard focus that cannot be seen.
- `auditKeyboard(page, stops)`: presses Tab with the real keyboard and checks that each stop shows a focus ring and that focus keeps moving to new controls.

`tests/e2e/a11yAudit.spec.ts` plants known problems and checks each one is reported, and that a clean screen reports none, so the audit cannot silently stop working.

`tests/e2e/everyScreen.spec.ts` is where a new screen is registered. It holds a `SCREENS` list (start screen, editor with problems, the YAML, Helper, Raw, Presets and Seed tabs, the Randomize panel, and the other panels and settings screens); for each entry it navigates to the screen and, in light and dark, at 900 by 600 and 1280 by 720, runs `checkEverything` and `auditAccessibility`, and finally `auditKeyboard`. To cover a new screen, add an entry with a `go` function that gets to it.

## Python tests

The Python tests need the Archipelago source folder and its Python, and are described in [building-and-running.md](building-and-running.md#python-tests). They cover the schema extractor (`extractor/tests/test_schema_extract.py`), custom world loading (`extractor/tests/test_custom_worlds.py`) and the seed engine protocol (`engine/tests/test_seed_engine.py`). They look for Archipelago through the `AP_ROOT` environment variable, then the sibling `archipelago-dev/Archipelago` folder.

## Traps

- **Playwright forces light mode.** Playwright pretends the computer is in light mode. Tests about the app's own look (the Appearance setting, "same as my computer") must call `page.emulateMedia({ colorScheme: null })` first so the page follows the real setting; see `tests/e2e/plan15.spec.ts`. Tests that check both looks do the opposite: they call `page.emulateMedia({ colorScheme: 'light' })` and `'dark'` on purpose.
- **Controlled checkboxes and radios need `click`, not `check`.** The app's checkboxes and radios are controlled by React. Playwright's `check()` clicks and then insists the state changed; with a controlled input that can fail or flake, so use `click()` and assert the state afterwards (`toBeChecked()`).
- **Do not run other heavy work during the full end-to-end run.** The suite uses one worker, real timeouts (the first real check count can take up to two minutes) and measures layout, so builds, other test runs, games or an Archipelago generation on the same machine can cause timeouts that look like failures.
- **A cut-short run can leave a stray `seed_engine` Python process.** If you stop a run partway (or it is killed), the app may not get to stop its check engine. The next full run then fails the test "no Python process until a count is needed, one while counting, none again after a quiet spell", because it counts `python` processes whose command line contains `seed_engine.py` and expects the number to return to what it was before. Find and end the leftover process (on Windows, look for a `python` process running `seed_engine.py` in Task Manager or with `Get-CimInstance Win32_Process`) and run again.
- **Rebuild before you test.** The end-to-end tests run the contents of `out/`, not your source. Run `npm run bundle` after every source change.
- **Skipped is not passed.** The tests that need a clone or `data/schema.json` skip silently when it is missing. Check the summary line for skipped counts when your change touches the engine, the schema or the difficulty data.
