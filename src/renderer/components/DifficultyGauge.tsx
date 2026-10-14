import { useEffect, useId, useState } from 'react';
import type { NudgeResult } from '../../assistant/nudge';
import { formatScore, labelFor } from '../../difficulty/labels';
import type { Edit } from '../../model/edits';
import type { Contribution, Rating } from '../../difficulty/types';

const SHOWN = 6;
const CELLS = 10;

function sourceText(rating: Rating): string {
  if (rating.source === 'estimated') return 'Estimated';
  return rating.status === 'reviewed' ? 'Rated' : 'Rated · draft';
}

function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

function WhyList({ rating }: { rating: Rating }) {
  const shown = rating.contributions.slice(0, SHOWN);
  const more = rating.contributions.length - shown.length;
  return (
    <>
      <p className="why__note">{rating.note}</p>
      {shown.length === 0 ? (
        <p className="why__empty">Nothing you have changed moves the number away from the game&apos;s defaults.</p>
      ) : (
        <ul className="why__list">
          {shown.map((c: Contribution) => (
            <li key={c.key} data-testid="why-item">
              <span className="why__delta" data-direction={c.delta > 0 ? 'harder' : 'easier'}>
                {signed(c.delta)}
              </span>
              <span className="why__text">
                <strong>{c.displayName}</strong>: {c.valueText}
                {c.why !== null && <span className="why__reason"> — {c.why}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="why__more">…and {more} smaller {more === 1 ? 'change' : 'changes'}.</p>}
      {rating.approximated.length > 0 && (
        <p className="why__more">
          Random, weighted or unreadable settings are counted as their average or at the default: {rating.approximated.join(', ')}.
        </p>
      )}
    </>
  );
}

/** Asks for option changes that move the difficulty toward a target, and applies them as one undoable step. */
export interface AimControl {
  suggest(target: number): NudgeResult;
  apply(edits: Edit[]): void;
}

function AimPanel({ rating, aim, onDone, id }: { rating: Rating; aim: AimControl; onDone(): void; id: string }) {
  const start = Math.round((rating.score ?? 5) * 2) / 2;
  const [target, setTarget] = useState(start);
  const [result, setResult] = useState<NudgeResult | null>(null);
  const sliderId = useId();
  // The suggestion was worked out for the options as they were. When the YAML changes (undo, an edit, another game) it is dropped and the slider starts again at the new score.
  useEffect(() => {
    setResult(null);
    setTarget(start);
  }, [aim, start]);
  return (
    <div className="aim" id={id} role="region" aria-label="Aim for a difficulty">
      <label htmlFor={sliderId} className="aim__label">
        Drag to the difficulty you want
      </label>
      <div className="aim__row">
        <input
          id={sliderId}
          className="aim__slider"
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={target}
          aria-valuetext={`${formatScore(target)} out of 10, ${labelFor(target)}`}
          onChange={(event) => {
            setTarget(Number(event.target.value));
            setResult(null);
          }}
        />
        <output className="aim__value" htmlFor={sliderId}>
          {formatScore(target)} · {labelFor(target)}
        </output>
      </div>
      <p className="aim__note">Now it is {formatScore(rating.score ?? 0)}. The app looks for a few option changes that get close, and shows them before anything changes.</p>
      <div className="aim__actions">
        <button type="button" className="button button--small" onClick={() => setResult(aim.suggest(target))}>
          Show the changes
        </button>
        <button type="button" className="button button--small" onClick={onDone}>
          Close
        </button>
      </div>
      {result !== null && !result.ok && (
        <p className="aim__result" role="status" data-testid="aim-result">
          {result.message}
        </p>
      )}
      {result !== null && result.ok && (
        <div className="aim__result" role="status" data-testid="aim-result">
          <p>
            This moves it from {formatScore(result.nudge.before)} to about {formatScore(result.nudge.after)} ({labelFor(result.nudge.after)}):
          </p>
          <ul>
            {result.nudge.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <button
            type="button"
            className="button button--small button--primary"
            onClick={() => {
              aim.apply(result.nudge.edits);
              onDone();
            }}
          >
            Apply these changes
          </button>
        </div>
      )}
    </div>
  );
}

/** The Difficulty part of the Seed Meter: a number, a word, a 10-step bar with a marker, where the number comes from, and a "why" list. */
export function DifficultyGauge({ rating, aim }: { rating: Rating | null; aim?: AimControl | undefined }) {
  const [open, setOpen] = useState(false);
  const [aiming, setAiming] = useState(false);
  const panelId = useId();
  const aimId = useId();

  if (rating === null) {
    return (
      <div className="stat">
        <span className="stat__label">Difficulty</span>
        <span className="stat__value stat__value--muted">—</span>
      </div>
    );
  }
  if (rating.score === null || rating.label === null) {
    return (
      <div className="stat">
        <span className="stat__label">Difficulty</span>
        <span className="stat__value stat__value--muted" data-testid="difficulty-value">
          Not rated
        </span>
        <span className="gauge__note">{rating.note}</span>
      </div>
    );
  }

  const shownScore = formatScore(rating.score);
  const percent = (Number(shownScore) / 10) * 100;
  const source = sourceText(rating);
  return (
    <>
      <div className="stat stat--difficulty">
        <span className="stat__label">Difficulty</span>
        <span className="stat__value gauge__value" aria-live="polite">
          <span data-testid="difficulty-value">
            {rating.source === 'estimated' && <span aria-hidden="true">~</span>}
            {shownScore}
          </span>
          <span className="gauge__label" data-testid="difficulty-label">
            {rating.label}
          </span>
          <span className="badge" data-testid="difficulty-source">
            {source}
          </span>
        </span>
        <div
          className="gauge"
          role="meter"
          aria-label="Difficulty"
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={Number(shownScore)}
          aria-valuetext={`${shownScore} out of 10, ${rating.label}, ${source}`}
        >
          <div className="gauge__track">
            <div className="gauge__rest" style={{ width: `${100 - percent}%` }} />
            <div className="gauge__cells">
              {Array.from({ length: CELLS }, (_, i) => (
                <span key={i} className="gauge__cell" />
              ))}
            </div>
          </div>
          <div className="gauge__marker" style={{ left: `${percent}%` }} />
        </div>
        <button
          type="button"
          className="link gauge__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide why' : 'Why this number?'}
        </button>
        {aim !== undefined && rating.source !== 'estimated' && (
          <button type="button" className="link gauge__toggle" aria-expanded={aiming} aria-controls={aimId} onClick={() => setAiming((v) => !v)}>
            {aiming ? 'Hide target' : 'Aim for a difficulty'}
          </button>
        )}
      </div>
      {open && (
        <div className="why" id={panelId} role="region" aria-label="Why this difficulty">
          <WhyList rating={rating} />
        </div>
      )}
      {aiming && aim !== undefined && rating.source !== 'estimated' && <AimPanel id={aimId} rating={rating} aim={aim} onDone={() => setAiming(false)} />}
    </>
  );
}
