import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { YamlDocument } from '../model/document';
import { formatScore } from '../difficulty/labels';
import { rateGame } from '../difficulty/registry';
import { shippedProfiles } from '../difficulty/shipped';
import { buildStarterYamls } from '../roulette/yamls';
import { THEME_CHOICES, type ThemeChoice } from '../shared/settings';
import type { HelperSnapshot } from '../shared/popout';
import { partFileNames, splitDocuments, type DocPart } from '../model/multiDoc';
import type { RecentFile } from '../shared/api';
import { MultiDocScreen } from './components/MultiDocScreen';
import { PresetsPanel } from './components/PresetsPanel';
import { buildGameInfos } from '../recommend/games';
import { shippedFacts, shippedFeel } from '../recommend/shipped';
import { EditError, type Edit } from '../model/edits';
import { isWeightedValue, planRandomizeAll, type DifficultyBand } from '../randomize/plan';
import { randomizableOptions } from '../randomize/roll';
import { parseSchemaFile, SchemaError } from '../schema/load';
import type { SchemaFile } from '../schema/types';
import { DocumentHeader } from './components/DocumentHeader';
import { GroupNav } from './components/GroupNav';
import { groupId, OptionGroups } from './components/OptionGroups';
import { ProblemPanel } from './components/ProblemPanel';
import { AssistantPanel } from './components/AssistantPanel';
import { RawEditor } from './components/RawEditor';
import { PlandoPanel } from './components/PlandoPanel';
import { TriggersPanel } from './components/TriggersPanel';
import { SeedPanel } from './components/SeedPanel';
import { ProblemsBar } from './components/ProblemsBar';
import { RandomizePanel, type RandomizeOutcome } from './components/RandomizePanel';
import { RecommenderScreen } from './components/RecommenderScreen';
import { RouletteScreen } from './components/RouletteScreen';
import { SeedMeter } from './components/SeedMeter';
import type { AimControl } from './components/DifficultyGauge';
import { nudgeDifficulty } from '../assistant/nudge';
import { SettingsScreen } from './components/SettingsScreen';
import { WelcomeCard } from './components/WelcomeCard';
import { StartScreen } from './components/StartScreen';
import { Toolbar } from './components/Toolbar';
import { YamlPreview } from './components/YamlPreview';
import { CheckCounter } from './state/checkCounter';
import { EditorSession } from './state/session';
import { simpleGroups } from './state/options';
import { countKey, engineOptionsFor } from './state/seedOptions';
import { useSessionVersion } from './state/useSessionVersion';
import { startersFor, type GuideContext } from '../assistant/guide';
import { buildPrompt, parseModelReply } from '../assistant/model';
import { guideReply } from '../assistant/guide';
import type { HelperId, HelperStatus } from '../shared/api';
import { GUIDE_CHOICE, GUIDE_ID, useHelper, type AskHelper } from './state/helper';
import type { HelperChoice } from './components/AssistantPanel';
import { validateDocument } from '../validate/validate';
import type { Fix, Issue } from '../validate/types';

type SchemaState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; schema: SchemaFile };

const NO_LOCKS: ReadonlySet<string> = new Set();

function fileNameOf(path: string | null): string {
  if (path === null) return 'Untitled';
  return path.split(/[\\/]/).pop() ?? path;
}

function suggestedFileName(doc: YamlDocument, game: string | null): string {
  const name = (doc.getMeta('name') ?? '').replace(/\{[^}]*\}/g, '').trim();
  return `${name || game || 'player'}.yaml`;
}

const TEXT_INPUT_TYPES = ['text', 'search', 'number', 'email', 'url', 'tel', 'password'];

/** Text boxes keep their own undo; sliders, switches and dropdowns do not. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.includes(target.type);
}

export default function App() {
  const [schemaState, setSchemaState] = useState<SchemaState>({ status: 'loading' });
  /** Bumped when the games available changed (custom worlds scanned or forgotten), to read the schema again. */
  const [schemaTick, setSchemaTick] = useState(0);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(true);
  const [sideTab, setSideTab] = useState<'yaml' | 'helper' | 'raw' | 'seed' | 'presets' | 'triggers' | 'plando'>('yaml');
  /** Files opened lately (shown on the start screen), and a multi-player file waiting for the person to choose. */
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [importing, setImporting] = useState<{ path: string; parts: DocPart[]; message: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roulette, setRoulette] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The chosen look (computer's setting, light or dark). The window restyles itself; this only labels the toolbar button. */
  const [theme, setTheme] = useState<ThemeChoice>('system');
  /** The first-run card: open until it has been closed once, and again whenever Settings asks. */
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const welcomeChecked = useRef(false);
  const closeWelcome = () => {
    setWelcomeOpen(false);
    void window.api.saveSettings({ welcome: { seen: true } });
  };
  useEffect(() => {
    let cancelled = false;
    void window.api.getSettings().then((reply) => {
      if (cancelled || !reply.ok) return;
      setTheme(reply.value.settings.appearance.theme);
      if (!welcomeChecked.current) {
        welcomeChecked.current = true;
        if (!reply.value.settings.welcome.seen) setWelcomeOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);
  const cycleTheme = () => {
    const next = THEME_CHOICES[(THEME_CHOICES.indexOf(theme) + 1) % THEME_CHOICES.length]!;
    setTheme(next);
    void window.api.saveSettings({ appearance: { theme: next } });
  };
  const [mixOpen, setMixOpen] = useState(false);
  /** The recommender counts one launch per app run, the first time it is opened. */
  const mixLaunchCounted = useRef(false);
  const [mixCountsLaunch, setMixCountsLaunch] = useState(false);
  const [randomizeOpen, setRandomizeOpen] = useState(false);
  const [locks, setLocks] = useState<Record<string, ReadonlySet<string>>>({});
  useSessionVersion(session);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await window.api.loadSchema();
      if (cancelled) return;
      if (!result.ok) {
        setSchemaState({ status: 'error', message: result.message });
        return;
      }
      try {
        setSchemaState({ status: 'ready', schema: parseSchemaFile(result.value) });
      } catch (error) {
        const detail = error instanceof SchemaError ? ` (${error.message})` : '';
        setSchemaState({ status: 'error', message: `The game option data is damaged${detail}.` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schemaTick]);

  const schema = schemaState.status === 'ready' ? schemaState.schema : null;
  const gameInfos = useMemo(() => (schema === null ? [] : buildGameInfos(schema, shippedFeel, shippedFacts, shippedProfiles)), [schema]);
  const doc = session?.doc ?? null;
  const games = doc?.games() ?? [];
  const activeGame = selectedGame !== null && games.includes(selectedGame) ? selectedGame : (games[0] ?? null);
  const gameSchema = schema !== null && activeGame !== null ? schema.games[activeGame] : undefined;
  const groups = useMemo(() => (gameSchema ? simpleGroups(gameSchema, query) : []), [gameSchema, query]);
  const allGameNames = useMemo(() => (schema === null ? [] : Object.values(schema.games).filter((g) => !g.hidden).map((g) => g.name).sort((a, b) => a.localeCompare(b))), [schema]);
  const gameNames = useMemo(
    () => (gameSchema ? { items: gameSchema.items, itemGroups: gameSchema.itemGroups, locations: gameSchema.locations, locationGroups: gameSchema.locationGroups } : undefined),
    [gameSchema],
  );
  const optionCount = groups.reduce((total, group) => total + group.options.length, 0);

  // Live check count: asks the seed engine (after a pause in typing) whenever this game's option values change.
  const counter = useMemo(() => new CheckCounter({ count: (request) => window.api.countChecks(request) }), []);
  const counterState = useSyncExternalStore(
    useCallback((listener: () => void) => counter.subscribe(listener), [counter]),
    () => counter.state,
  );
  const engineOptions =
    doc !== null && doc.isValid && gameSchema !== undefined && activeGame !== null ? engineOptionsFor(doc, activeGame, gameSchema) : null;
  const engineKey = engineOptions !== null && activeGame !== null ? countKey(activeGame, engineOptions) : null;
  useEffect(() => {
    if (engineOptions !== null && activeGame !== null) counter.request(activeGame, engineOptions);
    // engineKey changes exactly when the game or its option values change
  }, [counter, engineKey]);

  // Difficulty estimate: recalculated whenever this game's option values change (cheap, no engine needed).
  const rating = useMemo(
    () =>
      schema !== null && gameSchema !== undefined && engineOptions !== null
        ? rateGame(gameSchema, schema.apVersion, engineOptions, shippedProfiles)
        : null,
    // engineKey changes exactly when the game or its option values change
    [schema, gameSchema, engineKey],
  );

  // Problems: read the YAML the way Archipelago will. Cheap, needs no engine, and runs on every change.
  const sessionText = session?.text ?? '';
  const ruleIssues = useMemo(
    () => (schema !== null && doc !== null && doc.isValid ? validateDocument(doc, schema) : []),
    // sessionText changes exactly when the document does
    [schema, sessionText],
  );
  // The check engine can also say a game refused these settings; that is shown beside the rules' findings.
  const engineMessage = counterState.status === 'error' && counterState.message.startsWith('world_error') ? counterState.message : '';
  const issues = useMemo((): Issue[] => {
    if (engineMessage === '') return ruleIssues;
    const refusal: Issue = {
      id: 'WORLD_REFUSES',
      severity: 'error',
      code: 'WORLD_REFUSES',
      game: activeGame,
      option: null,
      message: `The game itself refused these settings: ${engineMessage.replace(/^world_error:\s*/, '')}`,
      fixes: [],
      source: 'engine',
    };
    return [...ruleIssues, refusal];
  }, [ruleIssues, engineMessage, activeGame]);
  const issuesByOption = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (issue.option === null || issue.game !== activeGame) continue;
      map.set(issue.option, [...(map.get(issue.option) ?? []), issue]);
    }
    return map;
  }, [issues, activeGame]);

  const applyFix = (fix: Fix) => {
    applyEdits(fix.edits);
  };
  const applyFixes = (fixes: Fix[]) => {
    applyEdits(fixes.flatMap((fix) => fix.edits));
  };
  const showIssue = (issue: { game: string | null; option: string | null }) => {
    if (issue.game !== null && issue.game !== activeGame && games.includes(issue.game)) setSelectedGame(issue.game);
    setQuery('');
    const group = groups.find((g) => g.options.some((o) => o.key === issue.option));
    if (group !== undefined) setOpenGroups((previous) => ({ ...previous, [group.name]: true }));
    // The group may still be opening, so look again for a moment before giving up.
    let tries = 0;
    const scroll = () => {
      const target = document.querySelector(`article[data-key="${CSS.escape(issue.option ?? '')}"]`);
      if (target !== null) target.scrollIntoView({ block: 'center' });
      else if ((tries += 1) < 20) window.setTimeout(scroll, 50);
    };
    window.setTimeout(scroll, 50);
  };

  // Randomize: which options may be re-rolled, which are locked, and the two actions.
  const randomizable = useMemo(() => (gameSchema ? randomizableOptions(gameSchema) : []), [gameSchema]);
  const lockedKeys: ReadonlySet<string> = (activeGame !== null ? locks[activeGame] : undefined) ?? NO_LOCKS;
  const lockedCount = randomizable.filter((o) => lockedKeys.has(o.key)).length;
  const weightedCount = randomizable.filter(
    (o) => !lockedKeys.has(o.key) && doc !== null && activeGame !== null && isWeightedValue(doc.get(activeGame, o.key)),
  ).length;

  const toggleLock = useCallback(
    (key: string) => {
      if (activeGame === null) return;
      setLocks((previous) => {
        const next = new Set(previous[activeGame]);
        if (!next.delete(key)) next.add(key);
        return { ...previous, [activeGame]: next };
      });
    },
    [activeGame],
  );

  const lockSetOptions = () => {
    if (doc === null || activeGame === null) return;
    setLocks((previous) => {
      const next = new Set(previous[activeGame]);
      for (const option of randomizable) {
        const value = doc.get(activeGame, option.key);
        if (value !== undefined && value !== null) next.add(option.key); // an empty "key:" line is not something the person set
      }
      return { ...previous, [activeGame]: next };
    });
  };

  const randomizeEverything = (band: DifficultyBand | null): RandomizeOutcome => {
    if (schema === null || gameSchema === undefined || engineOptions === null) {
      return { ok: false, message: 'Fix the problems in this file first, then try again.' };
    }
    const plan = planRandomizeAll({
      game: gameSchema,
      apVersion: schema.apVersion,
      profiles: shippedProfiles,
      current: engineOptions,
      locked: lockedKeys,
      random: Math.random,
      band,
    });
    if (!plan.ok) return { ok: false, message: plan.message };
    if (!applyEdits(plan.edits)) return { ok: false, message: 'The change could not be made.' };
    const where = plan.score === null ? '' : `; the difficulty is now about ${formatScore(plan.score)}`;
    return { ok: true, message: `Randomized ${plan.rolled} ${plan.rolled === 1 ? 'option' : 'options'}${where}.` };
  };

  const isOpen = (name: string): boolean => {
    if (query.trim() !== '') return true;
    const group = groups.find((g) => g.name === name);
    return openGroups[name] ?? !(group?.collapsed ?? false);
  };

  const applyEdits = useCallback(
    (edits: Edit[]): boolean => {
      if (session === null) return false;
      try {
        session.apply(edits);
        setNotice(null);
        return true;
      } catch (error) {
        setNotice(error instanceof EditError ? error.message : 'That change could not be made.');
        return false;
      }
    },
    [session],
  );

  // "Aim for a difficulty": find a few option changes that land near a target, show them, apply on request. Options you locked are left alone.
  const aim = useMemo<AimControl | undefined>(() => {
    if (schema === null || gameSchema === undefined || engineOptions === null || activeGame === null || rating === null || rating.score === null) return undefined;
    const score = rating.score;
    return {
      suggest: (target) => {
        if (Math.abs(target - score) < 0.25) return { ok: false, message: 'That is about where it is now.' };
        return nudgeDifficulty({
          game: gameSchema,
          apVersion: schema.apVersion,
          profiles: shippedProfiles,
          current: engineOptions,
          direction: target > score ? 'harder' : 'easier',
          amount: Math.abs(target - score),
          locked: locks[activeGame] ?? NO_LOCKS,
        });
      },
      apply: (edits) => {
        applyEdits(edits);
      },
    };
    // engineKey changes exactly when the game or its option values change
  }, [schema, gameSchema, engineKey, rating, locks, activeGame, applyEdits]);

  //The helper chat. It may read the open YAML and propose changes; applying one is a normal edit (one undo step).
  const helperContext = (): GuideContext | null =>
    schema !== null && doc !== null && doc.isValid && gameSchema !== undefined && activeGame !== null
      ? {
          schema,
          game: gameSchema,
          doc,
          issues,
          rating,
          profiles: shippedProfiles,
          checks: counterState.status === 'ready' ? counterState.result.checks : null,
          locked: lockedKeys,
          random: Math.random,
        }
      : null;
  // Optional AI helpers: which are switched on and ready. The built-in guide is always there.
  const [helperStatuses, setHelperStatuses] = useState<HelperStatus[]>([]);
  const refreshHelpers = useCallback(() => {
    void window.api.helperStatus().then((result) => {
      if (result.ok) setHelperStatuses(result.value);
    });
  }, []);
  useEffect(() => refreshHelpers(), [refreshHelpers]);
  const askAi: AskHelper = async (id, message, history, ctx) => {
    const result = await window.api.askHelper({ helperId: id as HelperId, prompt: buildPrompt(message, history, ctx) });
    if (!result.ok) {
      const fallback = guideReply(message, ctx);
      return { ...fallback, text: `${result.message} Here is what the built-in guide makes of it instead: ${fallback.text}` };
    }
    return parseModelReply(result.value, ctx, id);
  };
  const helper = useHelper({
    context: helperContext,
    apply: applyEdits,
    point: (pointer) => showIssue({ game: pointer.game, option: pointer.option }),
    ask: askAi,
  });
  const helperChoices: HelperChoice[] = [
    GUIDE_CHOICE,
    ...helperStatuses.filter((status) => status.enabled).map((status): HelperChoice => ({ id: status.id, name: status.name, unavailable: status.ready ? null : status.note })),
  ];
  // A helper that was switched off in Settings can no longer be the one answering.
  useEffect(() => {
    if (helper.helperId !== GUIDE_ID && helperStatuses.length > 0 && !helperStatuses.some((status) => status.id === helper.helperId && status.enabled)) helper.setHelperId(GUIDE_ID);
  }, [helperStatuses, helper.helperId]);
  const helperNote =
    helper.helperId === GUIDE_ID || !helperChoices.some((choice) => choice.id === helper.helperId)
      ? 'The built-in guide runs on this computer and sends nothing anywhere. It matches words, so be direct.'
      : helper.helperId === 'openRouter'
        ? 'Your message and this YAML go to OpenRouter, using your own key. Each question costs a small amount of money. Suggestion buttons are answered by the free built-in guide.'
        : `Your message and this YAML go to ${helperChoices.find((choice) => choice.id === helper.helperId)?.name ?? 'the helper'}, using your own login and plan allowance. Suggestion buttons are answered by the free built-in guide.`;

  const confirmDiscard = (): boolean =>
    session === null || !session.dirty || window.confirm('You have unsaved changes. Discard them?');

  const begin = (next: EditorSession) => {
    setLocks({});
    setRandomizeOpen(false);
    setSession(next);
    setSelectedGame(null);
    setQuery('');
    setOpenGroups({});
    setNotice(null);
  };

  const startNew = (game: string) => begin(new EditorSession(YamlDocument.empty(game)));

  const openRouletteYaml = (text: string) => {
    setRoulette(false);
    begin(new EditorSession(YamlDocument.parse(text)));
  };

  const saveRouletteFiles = async (files: { fileName: string; text: string }[]): Promise<{ ok: boolean; message: string }> => {
    const result = await window.api.saveYamlFolder(files);
    if (!result.ok) return { ok: false, message: result.message };
    if (result.value === null) return { ok: true, message: 'Nothing was saved.' };
    const count = result.value.written.length;
    return { ok: true, message: `Saved ${count} ${count === 1 ? 'file' : 'files'} to ${result.value.folder}.` };
  };

  const saveStarterFiles = async (names: string[]): Promise<string> => {
    const reply = await saveRouletteFiles(buildStarterYamls(names).map(({ fileName, text }) => ({ fileName, text })));
    return reply.message;
  };

  const useMixedGames = (mixed: string[]) => {
    setMixOpen(false);
    begin(new EditorSession(YamlDocument.emptyMulti(mixed, 'Player')));
  };

  const openMix = () => {
    setMixCountsLaunch(!mixLaunchCounted.current);
    mixLaunchCounted.current = true;
    setMixOpen(true);
  };

  const backToStart = () => {
    if (!confirmDiscard()) return;
    setSession(null);
    setRoulette(false);
    setMixOpen(false);
    setNotice(null);
  };

  /** A file was read: one player opens for editing; several players (---) go to the chooser first. */
  const handleOpened = (opened: { path: string; text: string }) => {
    if (!confirmDiscard()) return;
    const parts = splitDocuments(opened.text);
    if (parts !== null) setImporting({ path: opened.path, parts, message: null });
    else begin(new EditorSession(YamlDocument.parse(opened.text), opened.path));
  };

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.api.openYaml();
      if (!result.ok) setNotice(result.message);
      else if (result.value !== null) handleOpened(result.value);
    } finally {
      setBusy(false);
    }
  };

  const openRecent = async (path: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.api.openRecent(path);
      if (!result.ok) setNotice(result.message);
      else handleOpened(result.value);
    } finally {
      setBusy(false);
      void refreshRecent();
    }
  };

  const refreshRecent = async () => {
    const reply = await window.api.recentFiles();
    if (reply.ok) setRecent(reply.value);
  };

  const clearRecent = async () => {
    await window.api.clearRecent();
    await refreshRecent();
  };

  useEffect(() => {
    if (session === null) void refreshRecent();
  }, [session === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const editImported = (index: number) => {
    const part = importing?.parts[index];
    if (part === undefined) return;
    setImporting(null);
    begin(new EditorSession(YamlDocument.parse(part.text)));
  };

  const saveImportedEach = async (): Promise<string> => {
    if (importing === null) return '';
    const names = partFileNames(importing.parts);
    const reply = await saveRouletteFiles(importing.parts.map((part, index) => ({ fileName: names[index]!, text: part.text })));
    setImporting((current) => (current === null ? null : { ...current, message: reply.message }));
    return reply.message;
  };

  const save = async (chooseLocation: boolean) => {
    if (session === null || doc === null || busy) return;
    setBusy(true);
    try {
      const text = session.text;
      const result = await window.api.saveYaml({
        path: chooseLocation ? null : session.filePath,
        text,
        suggestedName: suggestedFileName(doc, activeGame),
      });
      if (!result.ok) setNotice(result.message);
      else if (result.value !== null) {
        session.markSaved(result.value.path, text);
        setNotice(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const jumpTo = (name: string) => {
    setOpenGroups((previous) => ({ ...previous, [name]: true }));
    const index = groups.findIndex((g) => g.name === name);
    window.setTimeout(() => document.getElementById(groupId(name, index))?.scrollIntoView({ block: 'start' }), 0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur(); // commit a typed-but-unfinished text box first
        void save(event.shiftKey);
      } else if (key === 'o') {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        void open();
      } else if (key === 'z' && !isTypingTarget(event.target) && session !== null) {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
      } else if (key === 'y' && !isTypingTarget(event.target) && session !== null) {
        event.preventDefault();
        session.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (session?.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session]);

  const fileName = fileNameOf(session?.filePath ?? null);
  useEffect(() => {
    document.title = `${session?.dirty ? '• ' : ''}${session ? fileName : 'Yammel'}`;
  });

  // The helper can be in its own window. This window keeps the conversation and the YAML: it gives the pop-out a copy whenever
  // something changes, and does whatever the pop-out asks for (send a message, apply a suggestion, point at an option).
  // (These hooks sit above the early return below so the order of hooks never changes.)
  const helperCtxNow = helperContext();
  const helperStarters = helperCtxNow === null ? [] : startersFor(helperCtxNow);
  const [helperOpen, setHelperOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void window.api.isHelperWindowOpen().then((reply) => {
      if (!cancelled && reply.ok) setHelperOpen(reply.value);
    });
    const stop = window.api.onHelperWindow(setHelperOpen);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  const helperSnapshot: HelperSnapshot = {
    entries: helper.entries,
    starters: helperStarters,
    busy: helper.busy,
    helpers: helperChoices,
    helperId: helper.helperId,
    note: helperNote,
    settled: [...helper.settled],
  };
  const helperSnapshotText = JSON.stringify(helperSnapshot);
  useEffect(() => {
    if (helperOpen) void window.api.publishHelper(JSON.parse(helperSnapshotText) as HelperSnapshot);
  }, [helperOpen, helperSnapshotText]);
  const helperNow = useRef({ helper, helperChoices });
  helperNow.current = { helper, helperChoices };
  useEffect(
    () =>
      window.api.onHelperAction((action) => {
        const { helper: h, helperChoices: choices } = helperNow.current;
        const proposalFor = (id: string) => h.entries.flatMap((entry) => entry.reply?.proposals ?? []).find((proposal) => proposal.id === id);
        switch (action.type) {
          case 'send':
            void h.send(action.text, action.viaChip);
            break;
          case 'helper':
            if (choices.some((choice) => choice.id === action.id && choice.unavailable === null)) h.setHelperId(action.id);
            break;
          case 'apply': {
            const proposal = proposalFor(action.proposalId);
            if (proposal !== undefined && !h.settled.has(proposal.id)) h.apply(proposal);
            break;
          }
          case 'skip': {
            const proposal = proposalFor(action.proposalId);
            if (proposal !== undefined && !h.settled.has(proposal.id)) h.skip(proposal);
            break;
          }
          case 'point':
            h.point({ game: action.game, option: action.option, label: '' });
            break;
          case 'clear':
            h.clear();
            break;
        }
      }),
    [],
  );

  if (schemaState.status !== 'ready') {
    return (
      <div className="app">
        <main className="start">
          {schemaState.status === 'loading' ? (
            <p className="status" role="status">
              Loading game data&hellip;
            </p>
          ) : (
            <ProblemPanel title="The game data could not be loaded" message={schemaState.message} />
          )}
        </main>
      </div>
    );
  }

  let problem: { title: string; message: string; details?: string[] } | null = null;
  if (doc !== null && !doc.isValid) {
    problem = {
      title: "This file can't be edited yet",
      message: 'Nothing has been changed. Fix the problems below in a text editor, then open the file again.',
      details: doc.issues.map((issue) => `Line ${issue.line}: ${issue.message}`),
    };
  } else if (doc !== null && activeGame === null) {
    problem = {
      title: 'This YAML does not say which game it is for',
      message: 'It needs a "game:" line. The file has not been changed.',
    };
  } else if (doc !== null && gameSchema === undefined) {
    problem = {
      title: `"${activeGame}" is not in the game list`,
      message: 'Check the spelling of the game name. The file has not been changed.',
    };
  }

  const guideCtx = helperContext();
  const preview =
    session !== null && previewOpen ? (
      <aside className="side">
        <div className="side__tabs" role="tablist" aria-label="Side panel">
          <button type="button" role="tab" aria-selected={sideTab === 'yaml'} className="side__tab" onClick={() => setSideTab('yaml')}>
            YAML
          </button>
          <button type="button" role="tab" aria-selected={sideTab === 'helper'} className="side__tab" onClick={() => setSideTab('helper')}>
            Helper
          </button>
          <button type="button" role="tab" aria-selected={sideTab === 'raw'} className="side__tab" onClick={() => setSideTab('raw')}>
            Raw
          </button>
          <button type="button" role="tab" aria-selected={sideTab === 'triggers'} className="side__tab" onClick={() => setSideTab('triggers')}>
            Triggers
          </button>
          <button type="button" role="tab" aria-selected={sideTab === 'plando'} className="side__tab" onClick={() => setSideTab('plando')}>
            Plando
          </button>
          <button type="button" role="tab" aria-selected={sideTab === 'presets'} className="side__tab" onClick={() => setSideTab('presets')}>
            Presets
          </button>
          <button type="button" role="tab" aria-selected={sideTab === 'seed'} className="side__tab" onClick={() => setSideTab('seed')}>
            Seed
          </button>
        </div>
        <div className="side__pane" hidden={sideTab !== 'presets'}>
          <PresetsPanel
            api={window.api}
            game={gameSchema}
            doc={doc}
            onApply={(edits) => {
              if (!applyEdits(edits)) throw new Error('That preset could not be applied.');
            }}
          />
        </div>
        <div className="side__pane" hidden={sideTab !== 'yaml'}>
          <YamlPreview text={session.text} issues={doc?.issues ?? []} onClose={() => setPreviewOpen(false)} onNotice={setNotice} />
        </div>
        <div className="side__pane" hidden={sideTab !== 'raw'}>
          <RawEditor text={session.text} onApply={(text) => (applyEdits([{ op: 'replaceText', text }]) ? null : 'That text could not be applied.')} />
        </div>
        <div className="side__pane" hidden={sideTab !== 'triggers'}>
          <TriggersPanel
            doc={doc}
            gameName={activeGame}
            game={gameSchema}
            issues={issues}
            onApply={(edits) => {
              applyEdits(edits);
            }}
          />
        </div>
        <div className="side__pane" hidden={sideTab !== 'plando'}>
          <PlandoPanel
            api={window.api}
            doc={doc}
            gameName={activeGame}
            game={gameSchema}
            issues={issues}
            onApply={(edits) => {
              applyEdits(edits);
            }}
          />
        </div>
        <div className="side__pane" hidden={sideTab !== 'seed'}>
          <SeedPanel
            api={window.api}
            yaml={{ name: suggestedFileName(session.doc, activeGame), text: session.text }}
            errorCount={issues.filter((issue) => issue.severity === 'error').length}
            onSettings={() => setSettingsOpen(true)}
            customGame={gameSchema?.customFile !== undefined}
          />
        </div>
        <div className="side__pane" hidden={sideTab !== 'helper'}>
          {helperOpen ? (
            <section className="chat" aria-label="Helper">
              <h2 className="chat__title">Helper</h2>
              <p className="chat__note">The helper is open in its own window, so it can sit beside the editor. Changes it makes land in this YAML, and undo works here as usual.</p>
              <p className="chat__chips">
                <button type="button" className="button button--small" onClick={() => void window.api.openHelperWindow()}>
                  Show that window
                </button>
                <button type="button" className="button button--small" onClick={() => void window.api.closeHelperWindow()}>
                  Bring it back here
                </button>
              </p>
            </section>
          ) : (
            <AssistantPanel
              entries={helper.entries}
              starters={helperStarters}
              busy={helper.busy}
              helpers={helperChoices}
              helperId={helper.helperId}
              note={helperNote}
              settled={helper.settled}
              onHelper={helper.setHelperId}
              onSend={(text, viaChip) => void helper.send(text, viaChip)}
              onApply={helper.apply}
              onSkip={helper.skip}
              onPointer={helper.point}
              onClear={helper.clear}
              onPopOut={() => void window.api.openHelperWindow()}
            />
          )}
        </div>
      </aside>
    ) : null;

  return (
    <div className="app">
      <Toolbar
        theme={theme}
        onTheme={cycleTheme}
        hasDocument={session !== null}
        dirty={session?.dirty ?? false}
        fileName={fileName}
        canUndo={session?.canUndo ?? false}
        canRedo={session?.canRedo ?? false}
        previewOpen={previewOpen}
        busy={busy}
        onNew={backToStart}
        onOpen={() => void open()}
        onSave={() => void save(false)}
        onSaveAs={() => void save(true)}
        onUndo={() => session?.undo()}
        onRedo={() => session?.redo()}
        onTogglePreview={() => setPreviewOpen((value) => !value)}
        onHelper={() => {
          if (helperOpen) {
            void window.api.openHelperWindow(); // already in its own window: bring that one forward
            return;
          }
          setSideTab('helper');
          setPreviewOpen(true);
        }}
        onSettings={() => setSettingsOpen(true)}
      />
      {notice !== null && (
        <div className="banner" role="alert">
          <span className="banner__text">{notice}</span>
          <button type="button" className="button button--small" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {welcomeOpen && <WelcomeCard onClose={closeWelcome} />}

      {settingsOpen ? (
        <SettingsScreen
          api={window.api}
          onBack={() => setSettingsOpen(false)}
          onChanged={() => counter.reset()}
          onHelpersChanged={refreshHelpers}
          onSchemaChanged={() => setSchemaTick((value) => value + 1)}
          onStartGame={(game) => {
            setSettingsOpen(false);
            startNew(game);
          }}
          onSaveStarters={saveStarterFiles}
          onShowWelcome={() => {
            setSettingsOpen(false);
            setWelcomeOpen(true);
          }}
        />
      ) : importing !== null ? (
        <MultiDocScreen
          fileName={fileNameOf(importing.path)}
          parts={importing.parts}
          message={importing.message}
          onEdit={editImported}
          onSaveEach={saveImportedEach}
          onCancel={() => setImporting(null)}
        />
      ) : session === null || doc === null ? (
        mixOpen ? (
          <RecommenderScreen
            api={window.api}
            games={gameInfos}
            countLaunch={mixCountsLaunch}
            onBack={() => setMixOpen(false)}
            onUse={useMixedGames}
          />
        ) : roulette ? (
          <RouletteScreen
            schema={schema!}
            onBack={() => setRoulette(false)}
            onOpenYaml={openRouletteYaml}
            onSaveAll={saveRouletteFiles}
          />
        ) : (
          <StartScreen schema={schema!} onStart={startNew} onOpen={() => void open()} onRoulette={() => setRoulette(true)} onMix={openMix} onCustomWorlds={() => setSettingsOpen(true)} recent={recent} onOpenRecent={(path) => void openRecent(path)} onClearRecent={() => void clearRecent()} />
        )
      ) : problem !== null ? (
        <div className={`content content--plain${previewOpen ? '' : ' content--no-preview'}`}>
          <main className="editor">
            <div className="editor__list">
              <ProblemPanel title={problem.title} message={problem.message} details={problem.details} />
            </div>
          </main>
          {preview}
        </div>
      ) : (
        <div className={`content${previewOpen ? '' : ' content--no-preview'}`}>
          <GroupNav groups={groups} onJump={jumpTo} />
          <main className="editor">
            <div className="editor__top">
              <DocumentHeader
                doc={doc}
                games={games}
                selectedGame={activeGame ?? ''}
                onSelectGame={setSelectedGame}
                onEdit={applyEdits}
                allGames={allGameNames}
              />
              <SeedMeter state={counterState} rating={rating} onSetup={() => setSettingsOpen(true)} aim={aim} />
              <ProblemsBar issues={issues} onFix={applyFix} onFixAll={applyFixes} onShow={showIssue} />
              <div className="searchbar">
                <input
                  type="search"
                  className="input"
                  aria-label="Search options"
                  placeholder={`Search options in ${activeGame ?? 'this game'}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="button"
                  aria-expanded={randomizeOpen}
                  aria-controls={randomizeOpen ? 'randomize-panel' : undefined}
                  onClick={() => setRandomizeOpen((value) => !value)}
                >
                  Randomize…
                </button>
                <span className="searchbar__count" aria-live="polite">
                  {optionCount} {optionCount === 1 ? 'option' : 'options'}
                </span>
              </div>
            </div>
            <div className="editor__list">
              {randomizeOpen && (
                <RandomizePanel
                  key={activeGame ?? ''}
                  id="randomize-panel"
                  randomizable={randomizable.length}
                  locked={lockedCount}
                  weighted={weightedCount}
                  rating={rating}
                  onRandomize={randomizeEverything}
                  onLockSet={lockSetOptions}
                  onClearLocks={() => activeGame !== null && setLocks((previous) => ({ ...previous, [activeGame]: NO_LOCKS }))}
                />
              )}
              {groups.length === 0 ? (
                <p className="empty">No options match &ldquo;{query}&rdquo;.</p>
              ) : (
                <OptionGroups
                  game={activeGame ?? ''}
                  doc={doc}
                  groups={groups}
                  isOpen={isOpen}
                  onToggle={(name) => setOpenGroups((previous) => ({ ...previous, [name]: !isOpen(name) }))}
                  onEdit={applyEdits}
                  locked={lockedKeys}
                  onToggleLock={toggleLock}
                  issues={issuesByOption}
                  names={gameNames}
                />
              )}
            </div>
          </main>
          {preview}
        </div>
      )}
    </div>
  );
}
