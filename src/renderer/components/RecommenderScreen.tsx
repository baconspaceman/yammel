import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { partnersFor, pickCards } from '../../recommend/select';
import { scoreAllPairs, type ScoreOptions } from '../../recommend/score';
import {
  beginLaunch,
  clearHistory,
  dismissPair,
  EMPTY_STATE,
  recordShown,
  resetWeights,
  setMood,
  setPick,
  setPinned,
  setThumb,
  setWeight,
  type RecommenderState,
} from '../../recommend/state';
import { PART_KEYS, PART_LABELS, WEIGHT_MAX, type GameInfo, type Mood, type PairScore, type PartKey, type Source } from '../../recommend/types';
import { seededRandom, type Random } from '../../roulette/random';
import type { EditorApi } from '../../shared/api';

export type RecommenderApi = Pick<EditorApi, 'loadRecommender' | 'saveRecommender'>;

export interface RecommenderScreenProps {
  api: RecommenderApi;
  games: readonly GameInfo[];
  /** True the first time this screen opens in an app run: it counts as a new launch for the "not again for 5 launches" memory. */
  countLaunch: boolean;
  onBack(): void;
  /** Start a new YAML that mixes these games. */
  onUse(games: [string, string]): void;
  /** Random source for "give me ten more" and replacements (tests pass a seeded one). */
  random?: Random;
}

const MOODS: { value: Mood; label: string }[] = [
  { value: 'similar', label: 'Similar vibes' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'opposites', label: 'Opposites attract' },
];

const SOURCE_LABEL: Record<Source, string> = { scanned: 'Scanned', drafted: 'Drafted', guessed: 'Guessed' };
const KIND_LABEL: Record<PairScore['kind'], string> = { similar: 'Alike', contrast: 'Different', practical: 'Easy to run together' };
const PARTNER_LIMIT = 30;

function scoreOptions(state: RecommenderState): ScoreOptions {
  return {
    mood: state.mood,
    weights: state.weights,
    picks: new Set(state.picks),
    favourites: new Set(state.favourites),
    dislikes: new Set(state.dislikes),
  };
}

function Bar({ label, value, source }: { label: string; value: number; source: Source }) {
  const percent = Math.round(value * 100);
  return (
    <li className="rec__part">
      <span className="rec__partname">
        {label} <span className="rec__source">{SOURCE_LABEL[source]}</span>
      </span>
      <span className="rec__bar" role="img" aria-label={`${label}: ${percent} out of 100`}>
        <span className="rec__barfill" style={{ width: `${percent}%` }} />
      </span>
    </li>
  );
}

export function RecommenderScreen({ api, games, countLaunch, onBack, onUse, random }: RecommenderScreenProps) {
  const [state, setState] = useState<RecommenderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The opening ten (as pair keys), drawn once per launch and again only when the person changes mood or sliders. */
  const [tenKeys, setTenKeys] = useState<{ keys: string[]; reshuffled: boolean } | null>(null);
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [drawVersion, setDrawVersion] = useState(0);
  const [focusGame, setFocusGame] = useState('');
  const [tuneOpen, setTuneOpen] = useState(false);
  const randomRef = useRef<Random>(random ?? Math.random);
  randomRef.current = random ?? randomRef.current;

  const persist = useCallback(
    (next: RecommenderState) => {
      setState(next);
      void api.saveRecommender(next).then((result) => {
        if (!result.ok) setError(result.message);
      });
    },
    [api],
  );

  // Load what was remembered, and count this as a new launch the first time it opens in an app run.
  useEffect(() => {
    let cancelled = false;
    void api.loadRecommender().then((result) => {
      if (cancelled) return;
      if (!result.ok) setError(result.message);
      const base = result.ok ? result.value : EMPTY_STATE;
      const loaded = countLaunch ? beginLaunch(base) : base;
      setState(loaded);
      if (countLaunch) void api.saveRecommender(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [api, countLaunch]);

  const pairs = useMemo(
    () => (state === null ? [] : scoreAllPairs(games, scoreOptions(state))),
    // thumbs change the weights, which rescores every card on screen; that is wanted
    [games, state?.mood, state?.weights, state?.picks, state?.favourites, state?.dislikes, state === null],
  );
  const byKey = useMemo(() => new Map(pairs.map((pair) => [pair.key, pair])), [pairs]);

  // Draw the ten. This runs when the screen opens and when mood or sliders are changed on purpose, never because of a thumb.
  const loaded = state !== null;
  useEffect(() => {
    if (state === null) return;
    const result = pickCards({ pairs, state, random: seededRandom(state.launches * 7919 + 13 + drawVersion) });
    setTenKeys({ keys: result.pairs.map((pair) => pair.key), reshuffled: result.reshuffled });
    setExtraKeys([]);
    persist(recordShown(state, result.pairs));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately not re-run when pairs or state change
  }, [loaded, state?.launches, drawVersion]);

  /** A change that should be followed by a fresh draw (mood, sliders, reset, clearing history). */
  const redraw = (next: RecommenderState) => {
    persist(next);
    setDrawVersion((value) => value + 1);
  };

  const dismissed = new Set(state?.dismissed ?? []);
  const keysOnScreen = [...(tenKeys?.keys ?? []), ...extraKeys];
  const focused = focusGame !== '' && state !== null ? partnersFor(focusGame, pairs, state).slice(0, PARTNER_LIMIT) : null;
  const shown: PairScore[] =
    focused ?? keysOnScreen.filter((key) => !dismissed.has(key)).flatMap((key) => {
      const pair = byKey.get(key);
      return pair === undefined ? [] : [pair];
    });

  const draw = (count: number) => {
    if (state === null) return;
    const thisLaunch = Object.entries(state.shown).filter(([, launch]) => launch === state.launches).map(([key]) => key);
    const result = pickCards({ pairs, state, random: randomRef.current, count, avoid: new Set([...keysOnScreen, ...thisLaunch]) });
    setExtraKeys((previous) => [...previous, ...result.pairs.map((pair) => pair.key)]);
    setTenKeys((previous) => (previous === null ? previous : { ...previous, reshuffled: previous.reshuffled || result.reshuffled }));
    persist(recordShown(state, result.pairs));
  };

  /** Dismissing a card fills its place with a new one, so the list stays at ten. */
  const dismiss = (pair: PairScore) => {
    if (state === null) return;
    const next = dismissPair(state, pair.key);
    const thisLaunch = Object.entries(next.shown).filter(([, launch]) => launch === next.launches).map(([key]) => key);
    const result = pickCards({ pairs, state: next, random: randomRef.current, count: 1, avoid: new Set([...keysOnScreen, ...thisLaunch]) });
    setExtraKeys((previous) => [...previous, ...result.pairs.map((p) => p.key)]);
    persist(recordShown(next, result.pairs));
  };

  if (state === null) {
    return (
      <main className="start">
        <div className="start__panel">
          <p className="status" role="status">
            Loading&hellip;
          </p>
        </div>
      </main>
    );
  }

  const nudgeList = state.nudges.filter((entry) => entry.delta !== 0);
  const reshuffled = focused === null && (tenKeys?.reshuffled ?? false);

  return (
    <main className="start rec">
      <div className="start__panel">
        <h1 className="start__title">Games to mix</h1>
        <p className="start__lead">
          Ideas for two games to play together in one YAML. You do not have to tell it anything: ten new ones show up each time you start the app.
        </p>
        <p>
          <button type="button" className="button" onClick={onBack}>
            Back
          </button>
        </p>

        {error !== null && (
          <p className="settings__error" role="alert">
            {error}
          </p>
        )}

        <fieldset className="roulette__controls">
          <legend>What kind of pairing?</legend>
          {MOODS.map((mood) => (
            <label key={mood.value} className="roulette__choice">
              <input type="radio" name="rec-mood" value={mood.value} checked={state.mood === mood.value} onChange={() => redraw(setMood(state, mood.value))} />
              <span>{mood.label}</span>
            </label>
          ))}
        </fieldset>

        <div className="rec__tools">
          <label className="rec__focus">
            <span>What goes well with</span>
            <select className="input" value={focusGame} onChange={(e) => setFocusGame(e.target.value)}>
              <option value="">(my ten ideas)</option>
              {games.map((game) => (
                <option key={game.name} value={game.name}>
                  {game.name}
                </option>
              ))}
            </select>
          </label>
          {focused === null && (
            <button type="button" className="button" onClick={() => draw(10)}>
              Give me ten more
            </button>
          )}
          <button type="button" className="button" aria-expanded={tuneOpen} onClick={() => setTuneOpen((value) => !value)}>
            Tune the scoring
          </button>
        </div>

        {tuneOpen && (
          <section className="settings__section" aria-label="Scoring weights">
            <p className="settings__lead">
              Each part of a score can count less or more. 1 is normal and 0 switches a part off. Thumbs up and down on a card also move these a little, and the changes they
              made are listed below.
            </p>
            {PART_KEYS.map((key: PartKey) => (
              <label key={key} className="rec__slider">
                <span>{PART_LABELS[key]}</span>
                <input
                  type="range"
                  min={0}
                  max={WEIGHT_MAX}
                  step={0.05}
                  value={state.weights[key]}
                  aria-label={`${PART_LABELS[key]} weight`}
                  onChange={(e) => redraw(setWeight(state, key, Number(e.target.value)))}
                />
                <span className="rec__value">{state.weights[key].toFixed(2)}</span>
              </label>
            ))}
            {nudgeList.length > 0 && (
              <ul className="rec__nudges" aria-label="Changes made by thumbs">
                {nudgeList.slice(-6).map((entry, index) => {
                  const pair = byKey.get(entry.pair);
                  return (
                    <li key={`${entry.pair}-${entry.part}-${index}`}>
                      {PART_LABELS[entry.part]} {entry.delta > 0 ? 'up' : 'down'} {Math.abs(entry.delta).toFixed(2)}
                      {pair === undefined ? '' : ` (${pair.a} + ${pair.b})`}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="rec__actions">
              <button type="button" className="button" onClick={() => redraw(resetWeights(state))}>
                Reset weights
              </button>
              <button type="button" className="button" onClick={() => redraw(clearHistory(state))}>
                Clear recommendation history
              </button>
            </div>
          </section>
        )}

        {reshuffled && (
          <p className="roulette__note" role="status">
            Not enough new pairs were left, so some earlier ones came back (reshuffled).
          </p>
        )}
        <p className="roulette__note">
          <strong>Scanned</strong> numbers were measured from each game&rsquo;s own code. <strong>Drafted</strong> ones are judgement calls written by an AI from general
          knowledge of the games, so they can be wrong. <strong>Guessed</strong> means there was no profile at all.
        </p>

        {shown.length === 0 ? (
          <p className="empty">Nothing to suggest.</p>
        ) : (
          <ol className="rec__cards" aria-label={focused !== null ? `Games that go well with ${focusGame}` : 'Game pairs'}>
            {shown.map((pair) => {
              const pinned = state.pins.includes(pair.key);
              const picked = state.picks.includes(pair.key);
              const thumb = state.thumbs[pair.key];
              return (
                <li key={pair.key} className="rec__card" data-testid="rec-card">
                  <div className="rec__head">
                    <h2 className="rec__names">
                      {pair.a} + {pair.b}
                    </h2>
                    <span className="rec__score" aria-label={`Score ${Math.round(pair.score)} out of 100`}>
                      {Math.round(pair.score)}
                    </span>
                  </div>
                  <p className="rec__kind">
                    {KIND_LABEL[pair.kind]}
                    {pair.guessed ? ' · Guessed' : ''}
                  </p>
                  {pair.reasons.length > 0 && (
                    <ul className="rec__reasons">
                      {pair.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  {pair.warnings.length > 0 && (
                    <ul className="rec__warnings" aria-label="Things to know">
                      {pair.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  <ul className="rec__parts" aria-label="Score breakdown">
                    {pair.parts.map((part) => (
                      <Bar key={part.key} label={PART_LABELS[part.key]} value={part.value} source={part.source} />
                    ))}
                  </ul>
                  <div className="rec__actions">
                    <button type="button" className="button button--primary" onClick={() => onUse([pair.a, pair.b])}>
                      Use these games
                    </button>
                    <button type="button" className="button" aria-pressed={pinned} onClick={() => persist(setPinned(state, pair.key, !pinned))}>
                      {pinned ? 'Pinned' : 'Pin'}
                    </button>
                    <button type="button" className="button" aria-pressed={thumb === 1} onClick={() => persist(setThumb(state, pair, thumb === 1 ? 0 : 1))}>
                      Good idea
                    </button>
                    <button type="button" className="button" aria-pressed={thumb === -1} onClick={() => persist(setThumb(state, pair, thumb === -1 ? 0 : -1))}>
                      Not for me
                    </button>
                    <button type="button" className="button" aria-pressed={picked} onClick={() => persist(setPick(state, pair.key, !picked))}>
                      {picked ? 'In my picks' : 'Add to my picks'}
                    </button>
                    <button type="button" className="button" onClick={() => dismiss(pair)}>
                      Never show this pair
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
