import type { OptionSchema } from '../../../schema/types';
import type { OptionState } from '../../state/options';
import { ChoiceControl } from './ChoiceControl';
import { NamedRangeControl } from './NamedRangeControl';
import { RangeControl } from './RangeControl';
import { TextControl } from './TextControl';
import { ToggleControl } from './ToggleControl';

export interface OptionControlProps {
  id: string;
  option: OptionSchema;
  state: OptionState;
  onCommit(value: unknown): void;
}

/** Picks the right control for an option the user can edit in Simple mode. */
export function OptionControl({ id, option, state, onCommit }: OptionControlProps) {
  const label = option.displayName;
  switch (option.kind) {
    case 'toggle':
      return <ToggleControl id={id} label={label} value={state.value === true} onCommit={onCommit} />;
    case 'choice':
      return (
        <ChoiceControl
          id={id}
          label={label}
          value={String(state.value)}
          choices={option.choices ?? []}
          onCommit={onCommit}
        />
      );
    case 'text_choice':
      return (
        <TextControl
          id={id}
          label={label}
          value={String(state.value)}
          suggestions={option.choices ?? []}
          onCommit={onCommit}
        />
      );
    case 'range':
      return (
        <RangeControl
          id={id}
          label={label}
          value={Number(state.value)}
          min={option.min ?? 0}
          max={option.max ?? 100}
          onCommit={onCommit}
        />
      );
    case 'named_range': {
      const min = option.min ?? 0;
      const max = option.max ?? 100;
      const inRange = typeof option.default === 'number' && option.default >= min && option.default <= max;
      const fallback = inRange ? (option.default as number) : min;
      return (
        <NamedRangeControl
          id={id}
          label={label}
          value={state.value as number | string}
          min={min}
          max={max}
          names={option.specialNames ?? {}}
          customStart={fallback}
          onCommit={onCommit}
        />
      );
    }
    case 'free_text':
      return <TextControl id={id} label={label} value={String(state.value)} onCommit={onCommit} />;
    default:
      return null;
  }
}
