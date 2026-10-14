import { useId } from 'react';
import { modeOf, randomModes, type RandomModeId, type RandomSpec } from '../../randomize/randomSpec';
import type { OptionSchema } from '../../schema/types';
import { NumberField } from './controls/NumberField';

export type ModeChoice = 'fixed' | 'weighted' | RandomModeId;

export interface RandomControlsProps {
  option: OptionSchema;
  /** The random value the option has now, or null when it holds a fixed value. */
  spec: RandomSpec | null;
  locked: boolean;
  /** Roll now has something to pick from. */
  canRoll: boolean;
  /** The option holds something this editor cannot show as fixed, random or weighted (an unusual random form). */
  custom: boolean;
  /** The option holds weighted values. */
  weighted: boolean;
  /** The option can be given weighted values. */
  canWeigh: boolean;
  /** Pick a real value now and write it. */
  onRoll(): void;
  /** Choose between a fixed value and one of the random modes. */
  onMode(mode: ModeChoice): void;
  /** The "random between" range changed. */
  onRange(from: number, to: number): void;
  onToggleLock(): void;
}

/** The row under an option: Roll now, how the value is decided (fixed or random), and a lock for Randomize everything. */
export function RandomControls({ option, spec, locked, canRoll, custom, weighted, canWeigh, onRoll, onMode, onRange, onToggleLock }: RandomControlsProps) {
  const uid = useId();
  const name = option.displayName;
  const modes = randomModes(option);
  const current: ModeChoice | 'custom' = weighted ? 'weighted' : custom ? 'custom' : spec === null ? 'fixed' : modeOf(spec);
  const min = option.min ?? 0;
  const max = option.max ?? 0;

  return (
    <div className="option__tools" role="group" aria-label={`Randomize ${name}`}>
      <button type="button" className="button button--small" aria-label={`Roll now: ${name}`} disabled={!canRoll} onClick={onRoll}>
        Roll now
      </button>
      <select
        className="select select--small"
        aria-label={`How ${name} is decided`}
        value={current}
        onChange={(e) => onMode(e.target.value as ModeChoice)}
      >
        {custom && (
          <option value="custom" disabled>
            Other (edit it in the Raw tab)
          </option>
        )}
        <option value="fixed">Fixed value</option>
        {modes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.label}
          </option>
        ))}
        {canWeigh && <option value="weighted">Weighted values</option>}
      </select>
      {spec?.type === 'range' && (
        <span className="option__range">
          <NumberField id={`${uid}-from`} label={`${name}: random from`} value={spec.from} min={min} max={Math.max(min, spec.to)} onCommit={(v) => onRange(v, spec.to)} />
          <span aria-hidden="true">to</span>
          <NumberField id={`${uid}-to`} label={`${name}: random to`} value={spec.to} min={Math.min(max, spec.from)} max={max} onCommit={(v) => onRange(spec.from, v)} />
        </span>
      )}
      <button
        type="button"
        className={`button button--small${locked ? ' button--on' : ''}`}
        aria-pressed={locked}
        aria-label={`Lock ${name}`}
        onClick={onToggleLock}
      >
        Lock
      </button>
    </div>
  );
}
