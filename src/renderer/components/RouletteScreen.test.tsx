// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../roulette/random';
import type { GameSchema, SchemaFile } from '../../schema/types';
import { RouletteScreen, type RouletteScreenProps } from './RouletteScreen';

const NAMES = ['Alpha Quest', 'Beta Blast', 'Gamma Run', 'Delta Dash', 'Epsilon Edge', 'Zeta Zone'];

function game(name: string): GameSchema {
  return {
    name,
    hidden: false,
    groups: [],
    options: {},
    presets: {},
    items: [],
    locations: [],
    itemGroups: [],
    locationGroups: [],
  };
}

const schema: SchemaFile = {
  apVersion: 'test',
  extractedAt: '',
  games: Object.fromEntries(NAMES.map((n) => [n, game(n)])),
  errors: [],
};

function setup(extra: Partial<RouletteScreenProps> = {}) {
  const props: RouletteScreenProps = {
    schema,
    onBack: vi.fn(),
    onOpenYaml: vi.fn(),
    onSaveAll: vi.fn().mockResolvedValue({ ok: true, message: 'Saved 3 files.' }),
    random: seededRandom(7),
    spinMs: 0,
    ...extra,
  };
  const user = userEvent.setup();
  render(<RouletteScreen {...props} />);
  return { props, user };
}

const names = () =>
  within(screen.getByRole('list', { name: 'Roulette results' }))
    .getAllByRole('listitem')
    .map((li) => NAMES.find((n) => li.textContent?.includes(n)) ?? '?');

const setCount = (n: number) => fireEvent.change(screen.getByLabelText('How many games'), { target: { value: String(n) } });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RouletteScreen', () => {
  it('shows defaults: Games and YAMLs and 3 games', () => {
    setup();
    expect((screen.getByLabelText('Games and YAMLs') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('heading', { name: 'Game roulette' })).toBeTruthy();
    expect(screen.getByText('3', { selector: '.roulette__value' })).toBeTruthy();
  });

  it('shows the new count when the slider changes', () => {
    setup();
    setCount(5);
    expect(screen.getByText('5', { selector: '.roulette__value' })).toBeTruthy();
  });

  it('Spin in both mode shows the chosen number of different games', async () => {
    const { user } = setup();
    setCount(4);
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    const shown = names();
    expect(shown).toHaveLength(4);
    expect(new Set(shown).size).toBe(4);
  });

  it('caps at the pool size and says so', async () => {
    const { user } = setup();
    setCount(10);
    expect(screen.getByText('Only 6 games are available.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    expect(names()).toHaveLength(6);
  });

  it('games mode starts a YAML per game and has no Save all', async () => {
    const { user, props } = setup();
    await user.click(screen.getByLabelText('Games only'));
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    expect(screen.queryByRole('button', { name: /Save all/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /in editor/ })).toBeNull();
    const buttons = screen.getAllByRole('button', { name: 'Start a YAML for this game' });
    expect(buttons).toHaveLength(3);
    await user.click(buttons[1]!);
    const text = (props.onOpenYaml as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(text).toContain(`game: ${names()[1]}`);
  });

  it('both mode has Open in editor and Save all', async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    const first = names()[0]!;
    await user.click(screen.getByRole('button', { name: `Open ${first} in editor` }));
    expect((props.onOpenYaml as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain(`game: ${first}`);
    expect(screen.getByRole('button', { name: /Save all YAMLs/ })).toBeTruthy();
  });

  it('Save all passes numbered files with unique player names and shows the message', async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    await user.click(screen.getByRole('button', { name: /Save all YAMLs/ }));
    const files = (props.onSaveAll as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { fileName: string; text: string }[];
    expect(files.map((f) => f.fileName.slice(0, 3))).toEqual(['01-', '02-', '03-']);
    expect(files.every((f) => f.fileName.endsWith('.yaml'))).toBe(true);
    const players = files.map((f) => /^name: (.+)$/m.exec(f.text)?.[1]);
    expect(new Set(players).size).toBe(3);
    expect((await screen.findByText('Saved 3 files.')).getAttribute('role')).toBe('status');
  });

  it('shows a failure message from Save all', async () => {
    const { user } = setup({ onSaveAll: vi.fn().mockResolvedValue({ ok: false, message: 'Disk full.' }) });
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    await user.click(screen.getByRole('button', { name: /Save all YAMLs/ }));
    const msg = await screen.findByText('Disk full.');
    expect(msg.getAttribute('role')).toBe('status');
    expect(msg.className).toContain('roulette__message--error');
  });

  it('yaml mode with one game opens it at once and shows no results', async () => {
    const { user, props } = setup();
    await user.click(screen.getByLabelText('YAMLs only'));
    setCount(1);
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    expect(props.onOpenYaml).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('list', { name: 'Roulette results' })).toBeNull();
  });

  it('yaml mode with three games shows three results', async () => {
    const { user, props } = setup();
    await user.click(screen.getByLabelText('YAMLs only'));
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    expect(names()).toHaveLength(3);
    expect(props.onOpenYaml).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Save all YAMLs/ })).toBeTruthy();
  });

  it('Re-roll changes only that slot and keeps games different', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    const before = names();
    await user.click(screen.getByRole('button', { name: `Re-roll ${before[1]}` }));
    const after = names();
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[1]).not.toBe(before[1]);
    expect(new Set(after).size).toBe(3);
  });

  it('changing mode or count does not alter shown results; Spin again does', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    const first = names();
    await user.click(screen.getByLabelText('Games only'));
    setCount(5);
    expect(names()).toEqual(first);
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    const second = names();
    expect(second).toHaveLength(5);
    expect(second).not.toEqual(first);
  });

  it('plays the spin animation then reveals results', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    setup({ spinMs: 300 });
    fireEvent.click(screen.getByRole('button', { name: 'Spin' }));
    const spinBtn = screen.getByRole('button', { name: 'Spinning…' }) as HTMLButtonElement;
    expect(spinBtn.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Spinning…');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByRole('button', { name: 'Spin' }) as HTMLButtonElement).disabled).toBe(false);
    expect(names()).toHaveLength(3);
  });

  it('skips the animation when reduced motion is preferred', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { user } = setup({ spinMs: 300 });
    await user.click(screen.getByRole('button', { name: 'Spin' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(names()).toHaveLength(3);
  });

  it('Back calls onBack', async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onBack).toHaveBeenCalled();
  });
});
