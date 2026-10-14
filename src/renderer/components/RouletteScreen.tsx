import { useEffect, useMemo, useRef, useState } from 'react';
import type { SchemaFile } from '../../schema/types';
import { clampCount, pickGames, rerollOne, rouletteGames, ROULETTE_MAX, ROULETTE_MIN } from '../../roulette/pick';
import type { Random } from '../../roulette/random';
import { buildRouletteYamls } from '../../roulette/yamls';

export type RouletteMode = 'games' | 'both' | 'yaml';

export interface RouletteScreenProps {
  schema: SchemaFile;
  onBack(): void;
  /** Open this YAML text in the editor. */
  onOpenYaml(text: string): void;
  /** Save all of these files into a folder the user chooses. */
  onSaveAll(files: { fileName: string; text: string }[]): Promise<{ ok: boolean; message: string }>;
  /** Random source (tests pass a seeded one). Default Math.random. */
  random?: Random;
  /** How long the spin animation lasts in ms. Default 1200. 0 means no animation. */
  spinMs?: number;
}

const TICK_MS = 80;

const MODES: { value: RouletteMode; label: string }[] = [
  { value: 'games', label: 'Games only' },
  { value: 'both', label: 'Games and YAMLs' },
  { value: 'yaml', label: 'YAMLs only' },
];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function RouletteScreen({
  schema,
  onBack,
  onOpenYaml,
  onSaveAll,
  random = Math.random,
  spinMs = 1200,
}: RouletteScreenProps) {
  const pool = useMemo(() => rouletteGames(schema), [schema]);
  const [mode, setMode] = useState<RouletteMode>('both');
  const [count, setCount] = useState(3);
  const [games, setGames] = useState<string[] | null>(null);
  const [resultMode, setResultMode] = useState<RouletteMode>('both');
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const randomRef = useRef(random);
  randomRef.current = random;

  const clearTimers = () => {
    if (tickRef.current !== null) clearInterval(tickRef.current);
    if (endRef.current !== null) clearTimeout(endRef.current);
    tickRef.current = null;
    endRef.current = null;
  };
  useEffect(() => clearTimers, []);

  const yamls = useMemo(() => (games ? buildRouletteYamls(games) : []), [games]);
  const wanted = clampCount(count);
  const shortPool = pool.length < wanted;

  const randomNames = (n: number): string[] =>
    Array.from({ length: n }, () => pool[Math.floor(randomRef.current() * pool.length)] ?? '');

  const spin = () => {
    clearTimers();
    setMessage(null);
    const picked = pickGames(pool, wanted, randomRef.current);
    if (mode === 'yaml' && picked.length === 1) {
      setGames(null);
      setSpinning(false);
      onOpenYaml(buildRouletteYamls(picked)[0]!.text);
      return;
    }
    setGames(picked);
    setResultMode(mode);
    const animate = mode !== 'yaml' && spinMs > 0 && picked.length > 0 && !prefersReducedMotion();
    if (!animate) {
      setSpinning(false);
      return;
    }
    setSpinning(true);
    setShown(randomNames(picked.length));
    tickRef.current = setInterval(() => setShown(randomNames(picked.length)), TICK_MS);
    endRef.current = setTimeout(() => {
      clearTimers();
      setSpinning(false);
    }, spinMs);
  };

  const reroll = (index: number) => {
    if (!games) return;
    setMessage(null);
    setGames(rerollOne(pool, games, index, randomRef.current));
  };

  const saveAll = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await onSaveAll(yamls.map((y) => ({ fileName: y.fileName, text: y.text })));
      setMessage({ ok: res.ok, text: res.message });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save the files.' });
    } finally {
      setSaving(false);
    }
  };

  const withYamls = resultMode !== 'games';

  return (
    <main className="start roulette">
      <div className="start__panel">
        <h1 className="start__title">Game roulette</h1>
        <p className="start__lead">Let the app pick games for you, and make a YAML for each one.</p>
        <p>
          <button type="button" className="button" onClick={onBack}>
            Back
          </button>
        </p>

        <fieldset className="roulette__controls">
          <legend>What should it make?</legend>
          {MODES.map((m) => (
            <label key={m.value} className="roulette__choice">
              <input
                type="radio"
                name="roulette-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
              />
              <span>{m.label}</span>
            </label>
          ))}
          <div className="roulette__count">
            <label htmlFor="roulette-count">How many games</label>
            <input
              id="roulette-count"
              type="range"
              min={ROULETTE_MIN}
              max={ROULETTE_MAX}
              step={1}
              value={count}
              onChange={(e) => setCount(clampCount(Number(e.target.value)))}
            />
            <span className="roulette__value" aria-hidden="true">
              {count}
            </span>
          </div>
          {shortPool && <p className="roulette__note">Only {pool.length} games are available.</p>}
          <div>
            <button type="button" className="button button--primary" onClick={spin} disabled={spinning}>
              {spinning ? 'Spinning…' : 'Spin'}
            </button>
          </div>
        </fieldset>

        {spinning && (
          <p role="status" className="status">
            Spinning…
          </p>
        )}

        {games && (
          <ol className="roulette__results" aria-label="Roulette results">
            {games.map((game, index) => {
              const yaml = yamls[index]!;
              return (
                <li key={`${index}-${game}`} className="roulette__item">
                  <span className="badge">{index + 1}</span>
                  <div className="roulette__body">
                    {spinning ? (
                      <span className="roulette__name" aria-hidden="true">
                        {shown[index] ?? ''}
                      </span>
                    ) : (
                      <span className="roulette__name">{game}</span>
                    )}
                    {!spinning && withYamls && <span className="roulette__file">{yaml.fileName}</span>}
                  </div>
                  {!spinning && (
                    <div className="roulette__actions">
                      <button
                        type="button"
                        className="button button--small"
                        aria-label={`Re-roll ${game}`}
                        onClick={() => reroll(index)}
                      >
                        Re-roll
                      </button>
                      {withYamls ? (
                        <button
                          type="button"
                          className="button button--small"
                          aria-label={`Open ${game} in editor`}
                          onClick={() => onOpenYaml(yaml.text)}
                        >
                          Open in editor
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button button--small"
                          onClick={() => onOpenYaml(yaml.text)}
                        >
                          Start a YAML for this game
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {games && !spinning && withYamls && games.length > 0 && (
          <div className="roulette__save">
            <button type="button" className="button" onClick={saveAll} disabled={saving}>
              Save all YAMLs to a folder…
            </button>
          </div>
        )}
        {message && (
          <p
            role="status"
            className={`roulette__message ${message.ok ? 'roulette__message--ok' : 'roulette__message--error'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </main>
  );
}
