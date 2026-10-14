import { useState } from 'react';
import { formatScore } from '../../difficulty/labels';
import type { Rating } from '../../difficulty/types';
import type { DifficultyBand } from '../../randomize/plan';

export interface RandomizeOutcome {
  ok: boolean;
  message: string;
}

export interface RandomizePanelProps {
  id: string;
  /** How many options Randomize everything can touch in this game, and how many of those are locked. */
  randomizable: number;
  locked: number;
  /** Options with weights (not locked) that are left alone too. */
  weighted: number;
  /** The current difficulty estimate; a band is only possible when the game has one. */
  rating: Rating | null;
  onRandomize(band: DifficultyBand | null): RandomizeOutcome;
  /** Lock every option this YAML already sets. */
  onLockSet(): void;
  onClearLocks(): void;
}

function readBand(low: string, high: string): DifficultyBand | string {
  const min = Number(low);
  const max = Number(high);
  if (low.trim() === '' || high.trim() === '' || !Number.isFinite(min) || !Number.isFinite(max)) return 'Enter a number from 0 to 10 at both ends of the band.';
  if (min < 0 || max > 10) return 'The band must stay between 0 and 10.';
  if (min > max) return 'The low end of the band must not be higher than the high end.';
  return { min, max };
}

/** "Randomize everything": re-rolls every unlocked option in one step, optionally keeping the difficulty estimate inside a band. */
export function RandomizePanel({ id, randomizable, locked, weighted, rating, onRandomize, onLockSet, onClearLocks }: RandomizePanelProps) {
  const [bandOn, setBandOn] = useState(false);
  const [low, setLow] = useState('3');
  const [high, setHigh] = useState('7');
  const [outcome, setOutcome] = useState<RandomizeOutcome | null>(null);

  const bandAvailable = rating !== null && rating.score !== null;
  const open = Math.max(0, randomizable - locked - weighted);

  const run = () => {
    if (bandOn && bandAvailable) {
      const band = readBand(low, high);
      if (typeof band === 'string') {
        setOutcome({ ok: false, message: band });
        return;
      }
      setOutcome(onRandomize(band));
      return;
    }
    setOutcome(onRandomize(null));
  };

  return (
    <section id={id} className="randompanel" aria-label="Randomize">
      <h2 className="randompanel__title">Randomize</h2>
      <p className="randompanel__text">
        Re-rolls {open} of {randomizable} {randomizable === 1 ? 'option' : 'options'} in one step, so Undo puts everything back.{' '}
        {locked === 0 ? 'Nothing is locked.' : `${locked} locked ${locked === 1 ? 'option stays' : 'options stay'} as ${locked === 1 ? 'it is' : 'they are'}.`}
        {weighted > 0 && ` ${weighted} weighted ${weighted === 1 ? 'option is' : 'options are'} left alone too.`}
      </p>

      <div className="randompanel__band">
        <label className="check">
          <input type="checkbox" checked={bandOn && bandAvailable} disabled={!bandAvailable} onChange={(e) => setBandOn(e.target.checked)} />
          <span>Keep the difficulty between</span>
        </label>
        <input
          type="number"
          className="input input--number"
          aria-label="Lowest difficulty"
          min={0}
          max={10}
          step={0.5}
          value={low}
          disabled={!bandOn || !bandAvailable}
          onChange={(e) => setLow(e.target.value)}
        />
        <span aria-hidden="true">and</span>
        <input
          type="number"
          className="input input--number"
          aria-label="Highest difficulty"
          min={0}
          max={10}
          step={0.5}
          value={high}
          disabled={!bandOn || !bandAvailable}
          onChange={(e) => setHigh(e.target.value)}
        />
      </div>
      {!bandAvailable ? (
        <p className="randompanel__note">This game has no difficulty rating, so there is no band to keep.</p>
      ) : (
        rating?.score != null && (
          <p className="randompanel__note">
            Difficulty now: {formatScore(rating.score)} ({rating.label}
            {rating.source === 'estimated' ? ', estimated' : ''}). A band is a best effort: if nothing fits, nothing changes.
          </p>
        )
      )}

      <div className="randompanel__actions">
        <button type="button" className="button button--primary" onClick={run}>
          Randomize everything
        </button>
        <button type="button" className="button" onClick={onLockSet}>
          Lock the options I have set
        </button>
        <button type="button" className="button" onClick={onClearLocks} disabled={locked === 0}>
          Clear all locks
        </button>
      </div>

      <p className="randompanel__note">
        Number options with more than 1,000 values (such as starting money) are left alone. A few games refuse some combinations: if the Checks bar
        says so, randomize again.
      </p>
      {outcome !== null && (
        <p role="status" className={`randompanel__message${outcome.ok ? '' : ' randompanel__message--bad'}`}>
          {outcome.message}
        </p>
      )}
    </section>
  );
}
