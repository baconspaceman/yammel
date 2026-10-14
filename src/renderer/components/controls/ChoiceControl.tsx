import type { ChoiceEntry } from '../../../schema/types';

export interface ChoiceControlProps {
  id: string;
  label: string;
  value: string;
  choices: ChoiceEntry[];
  onCommit(key: string): void;
}

export function ChoiceControl({ id, label, value, choices, onCommit }: ChoiceControlProps) {
  return (
    <select id={id} aria-label={label} className="select" value={value} onChange={(e) => onCommit(e.target.value)}>
      {choices.map((choice) => (
        <option key={choice.key} value={choice.key}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}
