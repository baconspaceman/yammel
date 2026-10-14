import { NumberField } from './NumberField';

const CUSTOM = '__custom__';

export interface NamedRangeControlProps {
  id: string;
  label: string;
  /** A number, or one of the option's special names. */
  value: number | string;
  min: number;
  max: number;
  names: Record<string, number>;
  /** The number to start from when switching to "Custom number". */
  customStart: number;
  onCommit(value: number | string): void;
}

export function NamedRangeControl({ id, label, value, min, max, names, customStart, onCommit }: NamedRangeControlProps) {
  const isName = typeof value === 'string';
  return (
    <div className="namedrange">
      <select
        id={id}
        aria-label={label}
        className="select"
        value={isName ? value : CUSTOM}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            if (isName) onCommit(customStart);
          } else {
            onCommit(e.target.value);
          }
        }}
      >
        {Object.entries(names).map(([name, number]) => (
          <option key={name} value={name}>
            {name} ({number})
          </option>
        ))}
        <option value={CUSTOM}>Custom number</option>
      </select>
      {!isName && (
        <NumberField id={`${id}-number`} label={`${label} (number)`} value={value} min={min} max={max} onCommit={onCommit} />
      )}
    </div>
  );
}
