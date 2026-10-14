import type { Rating } from '../../difficulty/types';
import type { CountOk } from '../../shared/api';
import type { CounterState } from '../state/checkCounter';
import { DifficultyGauge, type AimControl } from './DifficultyGauge';

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

interface Shown {
  value: string;
  stale: boolean;
  notes: string[];
}

function describe(state: CounterState): Shown {
  const withLast = (last: CountOk | null, fallback: string): Pick<Shown, 'value' | 'stale'> =>
    last === null ? { value: fallback, stale: false } : { value: String(last.checks), stale: true };

  switch (state.status) {
    case 'idle':
      return { value: '—', stale: false, notes: [] };
    case 'calculating':
      return state.last === null
        ? { value: 'Calculating…', stale: false, notes: [] }
        : { ...withLast(state.last, ''), notes: ['updating…'] };
    case 'unavailable':
      return { value: 'Unavailable', stale: false, notes: [state.message] };
    case 'error':
      return { ...withLast(state.last, 'Unavailable'), notes: [state.message] };
    case 'ready': {
      const notes: string[] = [];
      const delta = state.baseline === null ? 0 : state.result.checks - state.baseline.checks;
      if (state.baseline !== null && delta !== 0) notes.push(`default ${state.baseline.checks} (${formatDelta(delta)})`);
      if (state.result.unresolved.length > 0) {
        notes.push(`Random or weighted settings are counted at their defaults: ${state.result.unresolved.join(', ')}.`);
      }
      if (state.result.invalid.length > 0) {
        notes.push(`Not counted because they are not valid for this game: ${state.result.invalid.map((i) => i.key).join(', ')}.`);
      }
      return { value: String(state.result.checks), stale: false, notes };
    }
  }
}

/** The bar under the YAML header: how many checks this seed will have now, and how hard it is estimated to be. */
export function SeedMeter({ state, rating, onSetup, aim }: { state: CounterState; rating: Rating | null; onSetup?: () => void; aim?: AimControl | undefined }) {
  const shown = describe(state);
  return (
    <section className="seedmeter" aria-label="Seed statistics">
      <div className="stat" aria-live="polite">
        <span className="stat__label">Checks</span>
        <span className="stat__value" data-testid="checks-value" data-stale={shown.stale}>
          {shown.value}
        </span>
      </div>
      <DifficultyGauge rating={rating} aim={aim} />
      {shown.notes.length > 0 && (
        <ul className="seedmeter__notes">
          {shown.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {state.status === 'unavailable' && onSetup && (
        <button type="button" className="button button--small" onClick={onSetup}>
          Set up check counts
        </button>
      )}
    </section>
  );
}
