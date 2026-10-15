import { useEffect, useState } from 'react';
import { parse, stringify } from 'yaml';
import type { OptionSchema } from '../../schema/types';

export interface ValueFieldProps {
  id: string;
  /** What the value is for, read by screen readers. */
  label: string;
  /** The option this value belongs to, when the game has one. Without it the value is typed as YAML. */
  option?: OptionSchema;
  value: unknown;
  onChange(value: unknown): void;
}

/** A value written the way a YAML would hold it, on one line: `[Bow, Hookshot]`, `{Bow: 1}`, `5`, `true`. */
export function flowText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return stringify(value, { collectionStyle: 'flow', lineWidth: 0, version: '1.1' } as never).trim();
}

/** Reads typed text back into a value. Throws a sentence when it cannot. */
export function readFlowText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  try {
    return parse(trimmed, { version: '1.1' });
  } catch {
    throw new Error('That is not valid YAML. Lists look like [a, b] and maps like {a: 1}.');
  }
}

/**
 * One value for one option, with the control that suits the option: a switch, the list of choices, a number, or
 * plain text. Values that are lists or maps are typed as YAML on one line. A value commits when you leave the box or press Enter.
 */
export function ValueField({ id, label, option, value, onChange }: ValueFieldProps) {
  const [text, setText] = useState(flowText(value));
  const [problem, setProblem] = useState<string | null>(null);
  const shown = flowText(value);
  useEffect(() => {
    setText(shown);
    setProblem(null);
  }, [shown]);

  if (option?.kind === 'toggle') {
    return (
      <select id={id} className="host__select" aria-label={label} value={value === true ? 'true' : value === false ? 'false' : String(value)} onChange={(event) => onChange(event.target.value === 'true')}>
        {value !== true && value !== false && <option value={String(value)}>{String(value)}</option>}
        <option value="true">on (true)</option>
        <option value="false">off (false)</option>
      </select>
    );
  }
  if (option?.kind === 'choice' && option.choices !== undefined && option.choices.length > 0) {
    const current = String(value);
    const known = option.choices.some((choice) => choice.key === current);
    return (
      <select id={id} className="host__select" aria-label={label} value={current} onChange={(event) => onChange(event.target.value)}>
        {!known && <option value={current}>{current}</option>}
        {option.choices.map((choice) => (
          <option key={choice.key} value={choice.key}>
            {choice.key}
            {choice.label !== choice.key ? ` — ${choice.label}` : ''}
          </option>
        ))}
      </select>
    );
  }

  const commit = () => {
    if (text === shown) return;
    try {
      const plain = option !== undefined && (option.kind === 'free_text' || option.kind === 'text_choice');
      onChange(plain ? text : option?.kind === 'range' || option?.kind === 'named_range' ? numberOrWord(text) : readFlowText(text));
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That value cannot be used.');
    }
  };
  const hint =
    option === undefined
      ? 'a value, or YAML like [a, b]'
      : option.kind === 'range' || option.kind === 'named_range'
        ? `a number${option.min !== undefined && option.max !== undefined ? ` from ${option.min} to ${option.max}` : ''}${option.specialNames !== undefined ? ', or a name' : ''}`
        : option.kind === 'set' || option.kind === 'list'
          ? 'a list like [Bow, Hookshot]'
          : option.kind === 'dict' || option.kind === 'counter'
            ? 'a map like {Bow: 1}'
            : '';
  return (
    <span className="valuefield">
      <input
        id={id}
        className="host__input"
        type="text"
        aria-label={label}
        aria-invalid={problem !== null}
        aria-describedby={problem !== null ? `${id}-problem` : undefined}
        placeholder={hint}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      {problem !== null && (
        <span id={`${id}-problem`} className="host__problem" role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}

/** "5" is the number 5; anything else (a name like "high") stays text. */
function numberOrWord(text: string): unknown {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}
