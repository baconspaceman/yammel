import { useId, useState } from 'react';
import type { OptionSchema } from '../../schema/types';
import { addableValues, isNumeric, percentages, valueLabel, weightsProblem } from '../state/weights';
import { NumberField } from './controls/NumberField';

export interface WeightsEditorProps {
  option: OptionSchema;
  weights: Record<string, number>;
  /** Save these weights (at least one above 0). */
  onChange(weights: Record<string, number>): void;
}

const MAX_WEIGHT = 10000;

/** "Pick one of these, in these proportions": a weight for each value, with the odds shown as percentages. */
export function WeightsEditor({ option, weights, onChange }: WeightsEditorProps) {
  const uid = useId();
  const name = option.displayName;
  const [number, setNumber] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const odds = percentages(weights);
  const keys = Object.keys(weights);
  const problem = weightsProblem(weights);
  const addable = addableValues(option, weights);
  const min = option.min ?? 0;
  const max = option.max ?? 0;

  const change = (key: string, weight: number) => onChange({ ...weights, [key]: weight });
  const remove = (key: string) => {
    const next = { ...weights };
    delete next[key];
    if (Object.keys(next).length > 0 && weightsProblem(next) === null) onChange(next);
  };
  const add = (key: string) => onChange({ ...weights, [key]: 50 });

  const addNumber = () => {
    const text = number.trim();
    if (!/^-?\d+$/.test(text)) return setNumberError('Enter a whole number.');
    const value = Number(text);
    if (value < min || value > max) return setNumberError(`Must be between ${min} and ${max}.`);
    if (Object.prototype.hasOwnProperty.call(weights, String(value))) return setNumberError('That number is already in the list.');
    setNumberError(null);
    setNumber('');
    add(String(value));
  };

  return (
    <div className="weights" role="group" aria-label={`Weighted values for ${name}`}>
      <p className="weights__lead">When the seed is made, one of these is picked. A bigger weight is more likely.</p>
      <ul className="weights__list">
        {keys.map((key, index) => (
          <li key={key} className="weights__row">
            <span className="weights__name">{valueLabel(option, key)}</span>
            <NumberField id={`${uid}-w${index}`} label={`${name}: weight of ${valueLabel(option, key)}`} value={weights[key]!} min={0} max={MAX_WEIGHT} onCommit={(value) => change(key, value)} />
            <span className="weights__odds" aria-label={`${odds[key]} percent`}>
              {odds[key]}%
            </span>
            <button type="button" className="button button--small" aria-label={`Remove ${valueLabel(option, key)} from ${name}`} disabled={keys.length <= 1} onClick={() => remove(key)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="weights__add">
        {addable.length > 0 && (
          <select
            className="select select--small"
            aria-label={`Add a value to ${name}`}
            value=""
            onChange={(e) => {
              if (e.target.value !== '') add(e.target.value);
            }}
          >
            <option value="">Add a value&hellip;</option>
            {addable.map((value) => (
              <option key={value.key} value={value.key}>
                {value.label}
              </option>
            ))}
          </select>
        )}
        {isNumeric(option) && (
          <span className="weights__number">
            <input
              type="text"
              inputMode="numeric"
              className="input input--number"
              aria-label={`Add a number to ${name}`}
              placeholder={`${min} to ${max}`}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addNumber();
              }}
            />
            <button type="button" className="button button--small" onClick={addNumber}>
              Add number
            </button>
          </span>
        )}
        {keys.length > 1 && (
          <button type="button" className="button button--small" onClick={() => onChange(Object.fromEntries(keys.map((key) => [key, 50])))}>
            Make all equal
          </button>
        )}
      </div>
      {numberError !== null && (
        <p className="field-error" role="alert">
          {numberError}
        </p>
      )}
      {problem !== null && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
