// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YamlDocument } from '../../model/document';
import type { Edit } from '../../model/edits';
import { parseSchemaFile } from '../../schema/load';
import type { ApiResult } from '../../shared/api';
import type { HostFileContents, HostFileInfo } from '../../shared/host';
import { validateDocument } from '../../validate/validate';
import { PlandoPanel, plandoSwitchesFrom, type PlandoApi } from './PlandoPanel';

const schema = parseSchemaFile(readFileSync(join(process.cwd(), 'data', 'schema.json'), 'utf8'));
const AQ = 'APQuest';
const LTTP = 'A Link to the Past';

afterEach(cleanup);

const hostApi = (text: string | null): PlandoApi => ({
  hostFiles: vi.fn(async () => ({ ok: true, value: text === null ? [] : [{ id: 'installed', label: 'Installed Archipelago', path: 'C:/AP/host.yaml', exists: true }] }) as ApiResult<HostFileInfo[]>),
  readHost: vi.fn(async () => ({ ok: true, value: { id: 'installed', path: 'C:/AP/host.yaml', text: text ?? '' } }) as ApiResult<HostFileContents>),
});

const HOST_OFF = 'generator:\n  # List of options that can be plando\'d.\n  plando_options: "bosses, connections, texts"\n';
const HOST_ON = 'generator:\n  plando_options: "bosses, items, connections, texts"\n';

function Harness({ text, gameName, api = hostApi(null) }: { text: string; gameName: string; api?: PlandoApi }) {
  const [doc, setDoc] = useState(() => YamlDocument.parse(text));
  return (
    <>
      <PlandoPanel
        api={api}
        doc={doc}
        gameName={gameName}
        game={schema.games[gameName]}
        issues={validateDocument(doc, schema)}
        onApply={(edits: Edit[]) => {
          const next = doc.clone();
          next.applyAll(edits);
          setDoc(next);
        }}
      />
      <pre data-testid="yaml">{doc.toString()}</pre>
    </>
  );
}
const yamlOf = () => screen.getByTestId('yaml').textContent ?? '';
const AQ_BASE = `name: P\ngame: ${AQ}\n${AQ}: {}\n`;
const AQ_ONE = `name: P\ngame: ${AQ}\n${AQ}:\n  plando_items:\n    - item: Sword\n      location: Bottom Left Chest\n`;

describe('plandoSwitchesFrom', () => {
  it('reads which plando kinds the host.yaml allows', () => {
    expect(plandoSwitchesFrom(HOST_OFF)).toEqual({ items: false, connections: true });
    expect(plandoSwitchesFrom(HOST_ON)).toEqual({ items: true, connections: true });
    expect(plandoSwitchesFrom('generator:\n  plando_options: ""\n')).toEqual({ items: false, connections: false });
  });

  it('gives null for a file it cannot read or that does not say', () => {
    expect(plandoSwitchesFrom('generator:\n  race: 0\n')).toBeNull();
    expect(plandoSwitchesFrom(':\n  - [')).toBeNull();
  });
});

describe('PlandoPanel item plando', () => {
  it('asks to open a YAML when there is none', () => {
    render(<PlandoPanel doc={null} gameName={null} game={undefined} issues={[]} onApply={vi.fn()} />);
    expect(screen.getByText(/Open or start a YAML/)).toBeTruthy();
  });

  it('adds a placement and shows it in the YAML', async () => {
    render(<Harness text={AQ_BASE} gameName={AQ} />);
    expect(screen.getByText('No placements yet.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add an item placement' }));
    const card = screen.getByRole('listitem', { name: 'Placement 1' });
    const add = within(card).getByRole('textbox', { name: 'Add to Items' });
    await userEvent.type(add, 'Sword{Enter}');
    expect(yamlOf()).toMatch(/item: Sword/);
    await userEvent.type(within(card).getByRole('textbox', { name: 'Add to Locations' }), 'Bottom Left Chest{Enter}');
    expect(yamlOf()).toMatch(/location: Bottom Left Chest/);
  });

  it('shows what is there and changes the chance, force and count', async () => {
    render(<Harness text={AQ_ONE} gameName={AQ} />);
    const card = screen.getByRole('listitem', { name: 'Placement 1' });
    expect(within(card).getByText('Sword')).toBeTruthy();
    expect(within(card).getByText('Bottom Left Chest')).toBeTruthy();
    await userEvent.selectOptions(within(card).getByLabelText('If it goes wrong'), 'true');
    await userEvent.type(within(card).getByLabelText('Chance of placement 1'), '40{Enter}');
    const entry = (YamlDocument.parse(yamlOf()).get(AQ, 'plando_items') as Record<string, unknown>[])[0]!;
    expect(entry).toMatchObject({ force: true, percentage: 40 });
    expect(entry['items'] ?? entry['item']).toBeTruthy();
  });

  it('switches to items with a count and keeps the names', async () => {
    render(<Harness text={AQ_ONE} gameName={AQ} />);
    await userEvent.selectOptions(screen.getByLabelText('Items'), 'counts');
    const entry = (YamlDocument.parse(yamlOf()).get(AQ, 'plando_items') as Record<string, unknown>[])[0]!;
    expect(entry['items']).toEqual({ Sword: 1 });
  });

  it('chooses the world and the pool setting', async () => {
    render(<Harness text={AQ_ONE} gameName={AQ} />);
    await userEvent.selectOptions(screen.getByLabelText('In whose world'), 'others');
    await userEvent.click(screen.getByRole('checkbox', { name: /Take them from the normal item pool/ }));
    const entry = (YamlDocument.parse(yamlOf()).get(AQ, 'plando_items') as Record<string, unknown>[])[0]!;
    expect(entry).toMatchObject({ world: true, from_pool: false });
  });

  it('removes a placement, and the option with the last one', async () => {
    render(<Harness text={AQ_ONE} gameName={AQ} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove placement 1' }));
    expect(yamlOf()).not.toContain('plando_items');
  });

  it('lists the problems with a fix', async () => {
    render(<Harness text={AQ_ONE.replace('Sword', 'Swrod')} gameName={AQ} />);
    const problems = screen.getByRole('list', { name: 'Problems with Plando Items' });
    expect(within(problems).getByText(/not an item/)).toBeTruthy();
    await userEvent.click(within(problems).getByRole('button', { name: 'Use "Sword"' }));
    expect(yamlOf()).toContain('item: Sword');
    expect(screen.queryByRole('list', { name: 'Problems with Plando Items' })).toBeNull();
  });

  it('keeps a placement it cannot show exactly as it is', async () => {
    const odd = `name: P\ngame: ${AQ}\n${AQ}:\n  plando_items:\n    - item: Sword\n      location: Bottom Left Chest\n      count: {min: 1, max: 2}\n`;
    render(<Harness text={odd} gameName={AQ} />);
    expect(screen.getByText(/Edit it in the Raw tab/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add an item placement' }));
    const list = YamlDocument.parse(yamlOf()).get(AQ, 'plando_items') as Record<string, unknown>[];
    expect(list[0]).toEqual({ item: 'Sword', location: 'Bottom Left Chest', count: { min: 1, max: 2 } });
    expect(list).toHaveLength(2);
  });
});

describe('PlandoPanel and the host.yaml', () => {
  it('says plando is off when the host.yaml leaves items out', async () => {
    render(<Harness text={AQ_BASE} gameName={AQ} api={hostApi(HOST_OFF)} />);
    await waitFor(() => expect(screen.getByTestId('plando-items-switch').textContent).toMatch(/switched off/));
  });

  it('says it is on when it is', async () => {
    render(<Harness text={AQ_BASE} gameName={AQ} api={hostApi(HOST_ON)} />);
    await waitFor(() => expect(screen.getByTestId('plando-items-switch').textContent).toMatch(/switched on/));
  });

  it('explains who decides when there is no host.yaml to read', async () => {
    render(<Harness text={AQ_BASE} gameName={AQ} api={hostApi(null)} />);
    await waitFor(() => expect(screen.getByTestId('plando-items-switch').textContent).toMatch(/could not read/));
  });
});

describe('PlandoPanel connection plando', () => {
  const BASE = `name: P\ngame: ${LTTP}\n${LTTP}: {}\n`;

  it('adds a connection and fills the entrance and exit', async () => {
    render(<Harness text={BASE} gameName={LTTP} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a connection' }));
    const card = screen.getByRole('listitem', { name: 'Connection 1' });
    const entrance = within(card).getByLabelText('Entrance');
    await userEvent.type(entrance, 'Sanctuary{Enter}');
    const exit = within(card).getByLabelText('Exit');
    await userEvent.type(exit, 'Hyrule Castle Entrance (South){Enter}');
    const entry = (YamlDocument.parse(yamlOf()).get(LTTP, 'plando_connections') as Record<string, unknown>[])[0]!;
    expect(entry).toMatchObject({ entrance: 'Sanctuary', exit: 'Hyrule Castle Entrance (South)' });
  });

  it('offers the game\'s real names as suggestions', () => {
    const { container } = render(<Harness text={BASE} gameName={LTTP} />);
    const lists = container.querySelectorAll('datalist');
    expect(lists.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('datalist option[value="sanctuary"]')).toBeTruthy();
  });

  it('flags a name the game does not have and offers the nearest', async () => {
    const text = `${BASE.replace('{}', '')}\n  plando_connections:\n    - entrance: Sanctuery\n      exit: Hyrule Castle Entrance (South)\n`;
    render(<Harness text={text} gameName={LTTP} />);
    const problems = screen.getByRole('list', { name: /Problems with/ });
    expect(within(problems).getByText(/not an entrance/)).toBeTruthy();
    await userEvent.click(within(problems).getAllByRole('button', { name: /^Use / })[0]!);
    expect(yamlOf()).toMatch(/entrance: sanctuary/i);
  });

  it('says so for a game with no plando options it can show', () => {
    const bare = { ...schema.games[AQ]!, options: {} };
    render(<PlandoPanel doc={YamlDocument.parse(AQ_BASE)} gameName={AQ} game={bare} issues={[]} onApply={vi.fn()} />);
    expect(screen.getByText(/no plando options/)).toBeTruthy();
  });
});
