// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Contribution, Rating } from '../../difficulty/types';
import { DifficultyGauge } from './DifficultyGauge';

const pull = (key: string, delta: number, why: string | null = null): Contribution => ({
  key,
  displayName: key.toUpperCase(),
  valueText: 'On',
  delta,
  why,
});

const rated = (extra: Partial<Rating> = {}): Rating => ({
  source: 'rated',
  status: 'drafted',
  score: 6.04,
  label: 'Hard',
  contributions: [pull('a', 1.5, 'Because.'), pull('b', -0.4)],
  approximated: [],
  note: 'A draft rating written from the option names.',
  ...extra,
});

describe('DifficultyGauge', () => {
  it('shows a dash when there is no document to rate', () => {
    render(<DifficultyGauge rating={null} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('says "Not rated" with the reason and draws no bar when there is no rating', () => {
    render(
      <DifficultyGauge
        rating={{ source: 'none', status: null, score: null, label: null, contributions: [], approximated: [], note: 'Nobody has rated this.' }}
      />,
    );
    expect(screen.getByTestId('difficulty-value').textContent).toBe('Not rated');
    expect(screen.getByText('Nobody has rated this.')).toBeTruthy();
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('shows the number to one decimal, the word, and that it is a draft', () => {
    render(<DifficultyGauge rating={rated()} />);
    expect(screen.getByTestId('difficulty-value').textContent).toBe('6.0');
    expect(screen.getByTestId('difficulty-label').textContent).toBe('Hard');
    expect(screen.getByTestId('difficulty-source').textContent).toBe('Rated · draft');
  });

  it('calls a checked profile just "Rated" and marks an estimate with a tilde', () => {
    const { unmount } = render(<DifficultyGauge rating={rated({ status: 'reviewed' })} />);
    expect(screen.getByTestId('difficulty-source').textContent).toBe('Rated');
    unmount();
    render(<DifficultyGauge rating={rated({ source: 'estimated', status: 'estimated' })} />);
    expect(screen.getByTestId('difficulty-source').textContent).toBe('Estimated');
    expect(screen.getByTestId('difficulty-value').textContent).toBe('~6.0');
  });

  it('is a meter that screen readers can read in words', () => {
    render(<DifficultyGauge rating={rated()} />);
    const meter = screen.getByRole('meter', { name: 'Difficulty' });
    expect(meter.getAttribute('aria-valuenow')).toBe('6');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('10');
    expect(meter.getAttribute('aria-valuetext')).toBe('6.0 out of 10, Hard, Rated · draft');
  });

  it('puts the marker where the number is and fills the bar up to it', () => {
    const { container } = render(<DifficultyGauge rating={rated({ score: 2.5 })} />);
    expect((container.querySelector('.gauge__marker') as HTMLElement).style.left).toBe('25%');
    expect((container.querySelector('.gauge__rest') as HTMLElement).style.width).toBe('75%');
    expect(container.querySelectorAll('.gauge__cell')).toHaveLength(10);
  });

  it('keeps the marker inside the bar at both ends', () => {
    const low = render(<DifficultyGauge rating={rated({ score: 0, label: 'Very easy' })} />);
    expect((low.container.querySelector('.gauge__marker') as HTMLElement).style.left).toBe('0%');
    low.unmount();
    const high = render(<DifficultyGauge rating={rated({ score: 10, label: 'Very hard' })} />);
    expect((high.container.querySelector('.gauge__marker') as HTMLElement).style.left).toBe('100%');
  });

  it('opens a "why" list with signed changes, reasons and the note, and closes it again', async () => {
    const user = userEvent.setup();
    render(<DifficultyGauge rating={rated()} />);
    const toggle = screen.getByRole('button', { name: 'Why this number?' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Why this difficulty' })).toBeNull();

    await user.click(toggle);
    const region = screen.getByRole('region', { name: 'Why this difficulty' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(region).getByText('A draft rating written from the option names.')).toBeTruthy();
    const items = within(region).getAllByTestId('why-item');
    expect(items.map((i) => i.textContent)).toEqual(['+1.5A: On — Because.', '−0.4B: On']);

    await user.click(screen.getByRole('button', { name: 'Hide why' }));
    expect(screen.queryByRole('region', { name: 'Why this difficulty' })).toBeNull();
  });

  it('lists only the six biggest changes and says how many more there are', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 8 }, (_, i) => pull(`opt${i}`, 1 - i * 0.1));
    render(<DifficultyGauge rating={rated({ contributions: many })} />);
    await user.click(screen.getByRole('button', { name: 'Why this number?' }));
    expect(screen.getAllByTestId('why-item')).toHaveLength(6);
    expect(screen.getByText('…and 2 smaller changes.')).toBeTruthy();
  });

  it('says plainly when nothing has moved the number, and lists approximated settings', async () => {
    const user = userEvent.setup();
    render(<DifficultyGauge rating={rated({ contributions: [], approximated: ['Mode', 'Lives'] })} />);
    await user.click(screen.getByRole('button', { name: 'Why this number?' }));
    expect(screen.getByText(/Nothing you have changed moves the number/)).toBeTruthy();
    expect(screen.getByText(/counted as their average or at the default: Mode, Lives\./)).toBeTruthy();
  });
});
