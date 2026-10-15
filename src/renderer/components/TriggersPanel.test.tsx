// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YamlDocument } from '../../model/document';
import type { Edit } from '../../model/edits';
import { parseSchemaFile } from '../../schema/load';
import { validateDocument } from '../../validate/validate';
import { TriggersPanel } from './TriggersPanel';

const schema = parseSchemaFile(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'mini-schema.json'), 'utf8'));
const game = schema.games['Demo Game']!;
const GAME = 'Demo Game';

afterEach(cleanup);

/** The panel wired to a real document, the way the app wires it: every edit goes through the document. */
function Harness({ text, onEdits }: { text: string; onEdits?: (edits: Edit[]) => void }) {
  const [doc, setDoc] = useState(() => YamlDocument.parse(text));
  return (
    <>
      <TriggersPanel
        doc={doc}
        gameName={GAME}
        game={game}
        issues={validateDocument(doc, schema)}
        onApply={(edits) => {
          const next = doc.clone();
          next.applyAll(edits);
          setDoc(next);
          onEdits?.(edits);
        }}
      />
      <pre data-testid="yaml">{doc.toString()}</pre>
    </>
  );
}

const BASE = 'name: P\ngame: Demo Game\nDemo Game:\n  difficulty: hard\n  lives: 3\n';
const WITH_TRIGGER = `${BASE}  triggers:
    - option_category: Demo Game
      option_name: difficulty
      option_result: hard
      options:
        Demo Game:
          lives: 9
`;
const yamlOf = () => screen.getByTestId('yaml').textContent ?? '';

describe('TriggersPanel', () => {
  it('asks to open a YAML when there is none', () => {
    render(<TriggersPanel doc={null} gameName={null} game={undefined} issues={[]} onApply={vi.fn()} />);
    expect(screen.getByText(/Open or start a YAML/)).toBeTruthy();
  });

  it('says there are none, then adds one that watches an option already in the YAML', async () => {
    render(<Harness text={BASE} />);
    expect(screen.getByText('No triggers yet.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add a trigger' }));
    expect(screen.getByRole('listitem', { name: 'Trigger 1' })).toBeTruthy();
    expect(yamlOf()).toContain('option_category: Demo Game');
    expect(yamlOf()).toMatch(/option_name: (difficulty|lives)/);
  });

  it('writes the watched option too when it was not in the YAML, so the trigger can work', async () => {
    render(<Harness text={'name: P\ngame: Demo Game\nDemo Game: {}\n'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a trigger' }));
    const doc = YamlDocument.parse(yamlOf());
    const triggers = doc.get(GAME, 'triggers') as { option_name: string }[];
    expect(doc.has(GAME, triggers[0]!.option_name)).toBe(true);
  });

  it('shows what is there, with the watched value and the changes', () => {
    render(<Harness text={WITH_TRIGGER} />);
    const card = screen.getByRole('listitem', { name: 'Trigger 1' });
    expect(within(card).getByLabelText('Value that fires trigger 1')).toHaveProperty('value', 'hard');
    expect(within(card).getByLabelText('Value for change 1 of trigger 1')).toHaveProperty('value', '9');
  });

  it('changes a value, keeping the rest of the trigger', async () => {
    render(<Harness text={WITH_TRIGGER} />);
    const field = screen.getByLabelText('Value for change 1 of trigger 1');
    await userEvent.clear(field);
    await userEvent.type(field, '7{Enter}');
    const doc = YamlDocument.parse(yamlOf());
    const [trigger] = doc.get(GAME, 'triggers') as { option_name: string; option_result: string; options: Record<string, Record<string, unknown>> }[];
    expect(trigger!.options[GAME]).toEqual({ lives: 7 });
    expect(trigger!.option_name).toBe('difficulty');
    expect(doc.get(GAME, 'difficulty')).toBe('hard');
  });

  it('picks a choice from a list, and a chance', async () => {
    render(<Harness text={WITH_TRIGGER} />);
    await userEvent.selectOptions(screen.getByLabelText('Value that fires trigger 1'), 'easy');
    const chance = screen.getByLabelText('Chance (%)');
    await userEvent.type(chance, '40{Enter}');
    const doc = YamlDocument.parse(yamlOf());
    const [trigger] = doc.get(GAME, 'triggers') as { option_result: string; percentage: number }[];
    expect(trigger).toMatchObject({ option_result: 'easy', percentage: 40 });
  });

  it('adds and removes a change, and removes the whole trigger (and the key with it)', async () => {
    render(<Harness text={WITH_TRIGGER} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a change to trigger 1' }));
    expect(screen.getAllByRole('button', { name: /^Remove change \d from trigger 1$/ })).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Remove change 2 from trigger 1' }));
    expect(screen.getAllByRole('button', { name: /^Remove change \d from trigger 1$/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Remove trigger 1' }));
    expect(yamlOf()).not.toContain('triggers');
    expect(yamlOf()).toContain('lives: 3');
  });

  it('shows a trigger it cannot edit read-only and leaves it exactly as it is', async () => {
    const odd = `${BASE}  triggers:\n    - option_name: difficulty\n      option_result: hard\n      options:\n        Demo Game:\n          lives: 9\n`;
    render(<Harness text={odd} />);
    expect(screen.getByText(/Edit it in the Raw tab/)).toBeTruthy();
    expect(screen.queryByLabelText('Value that fires trigger 1')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add a trigger' }));
    const doc = YamlDocument.parse(yamlOf());
    const list = doc.get(GAME, 'triggers') as Record<string, unknown>[];
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ option_name: 'difficulty', option_result: 'hard', options: { [GAME]: { lives: 9 } } });
  });

  it('lists the problems with the triggers and applies a fix', async () => {
    const wrong = WITH_TRIGGER.replace('option_result: hard', 'option_result: Hard');
    render(<Harness text={wrong} />);
    const problems = screen.getByRole('list', { name: 'Problems with the triggers' });
    expect(within(problems).getByText(/capitals/)).toBeTruthy();
    await userEvent.click(within(problems).getByRole('button', { name: /Wait for "hard"/ }));
    expect(yamlOf()).toContain('option_result: hard');
    expect(screen.queryByRole('list', { name: 'Problems with the triggers' })).toBeNull();
  });

  it('mentions triggers at the top of the file instead of hiding them', () => {
    render(<Harness text={`${BASE}triggers:\n  - option_name: x\n`} />);
    expect(screen.getByTestId('triggers-top').textContent).toMatch(/1 trigger at the top level/);
  });

  it('does not offer to edit when triggers is not a list', () => {
    render(<Harness text={`${BASE}  triggers: nope\n`} />);
    expect(screen.getByText(/not a list/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a trigger' })).toBeNull();
  });
});
