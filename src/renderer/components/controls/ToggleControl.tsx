export interface ToggleControlProps {
  id: string;
  label: string;
  value: boolean;
  onCommit(value: boolean): void;
}

export function ToggleControl({ id, label, value, onCommit }: ToggleControlProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={value}
      aria-label={label}
      className="switch"
      onClick={() => onCommit(!value)}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__text">{value ? 'On' : 'Off'}</span>
    </button>
  );
}
