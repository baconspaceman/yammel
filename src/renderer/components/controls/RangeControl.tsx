import { useEffect, useState } from 'react';
import { NumberField } from './NumberField';

export interface RangeControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit(value: number): void;
}

/** A slider plus a number box. Dragging the slider is one change, written when the drag ends. */
export function RangeControl({ id, label, value, min, max, onCommit }: RangeControlProps) {
  const [live, setLive] = useState(value);

  useEffect(() => {
    setLive(value);
  }, [value]);

  const commitSlider = () => {
    if (live !== value) onCommit(live);
  };

  return (
    <div className="range">
      <input
        id={id}
        type="range"
        className="slider"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={Math.min(max, Math.max(min, live))}
        onChange={(e) => setLive(Number(e.target.value))}
        onPointerUp={commitSlider}
        onKeyUp={(e) => {
          // Releasing a shortcut such as Ctrl+Z must not write the slider's stale position back.
          if (e.ctrlKey || e.metaKey || e.altKey || ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;
          commitSlider();
        }}
        onBlur={commitSlider}
      />
      <NumberField id={`${id}-number`} label={`${label} (number)`} value={value} min={min} max={max} onCommit={onCommit} />
    </div>
  );
}
