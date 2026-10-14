// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Issue } from '../../validate/types';
import { ProblemsBar } from './ProblemsBar';

const issue = (over: Partial<Issue> = {}): Issue => ({
  id: 'BAD_VALUE|G|lives',
  severity: 'error',
  code: 'BAD_VALUE',
  game: 'G',
  option: 'lives',
  message: '99 is above the highest allowed value, 10.',
  fixes: [{ label: 'Use 10', edits: [{ op: 'set', game: 'G', option: 'lives', value: 10 }] }],
  source: 'rules',
  ...over,
});

const setup = (issues: Issue[]) => {
  const props = { issues, onFix: vi.fn(), onFixAll: vi.fn(), onShow: vi.fn() };
  render(<ProblemsBar {...props} />);
  return props;
};

describe('ProblemsBar', () => {
  it('says calmly that there is nothing to fix', () => {
    setup([]);
    expect(screen.getByRole('status').textContent).toMatch(/No problems found/);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('counts errors and warnings in plain words', () => {
    setup([issue(), issue({ id: 'b', severity: 'warning' }), issue({ id: 'c', severity: 'warning' })]);
    expect(screen.getByRole('status').textContent).toMatch(/1 error and 2 warnings to look at/);
  });

  it('hides the list until asked, then shows each problem with its fixes', async () => {
    setup([issue()]);
    expect(screen.queryByRole('list', { name: 'Problems found' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show the list' }));
    const list = screen.getByRole('list', { name: 'Problems found' });
    expect(list.textContent).toContain('G: lives');
    expect(list.textContent).toContain('99 is above the highest allowed value');
    expect(screen.getByRole('button', { name: 'Use 10' })).toBeTruthy();
  });

  it('applies one fix, or the first fix of every problem at once', async () => {
    const props = setup([issue(), issue({ id: 'two', option: null, fixes: [] }), issue({ id: 'three', fixes: [{ label: 'A', edits: [] }, { label: 'B', edits: [] }] })]);
    await userEvent.click(screen.getByRole('button', { name: 'Show the list' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use 10' }));
    expect(props.onFix).toHaveBeenCalledWith(expect.objectContaining({ label: 'Use 10' }));
    await userEvent.click(screen.getByRole('button', { name: /Apply the suggested fixes \(2\)/ }));
    expect(props.onFixAll).toHaveBeenCalledWith([expect.objectContaining({ label: 'Use 10' }), expect.objectContaining({ label: 'A' })]);
  });

  it('offers "Show the option" only for problems about an option', async () => {
    const props = setup([issue(), issue({ id: 'file', option: null, game: null, message: 'The player needs a name.' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Show the list' }));
    const buttons = screen.getAllByRole('button', { name: 'Show the option' });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);
    expect(props.onShow).toHaveBeenCalledWith(expect.objectContaining({ option: 'lives' }));
  });

  it('has no "apply fixes" button when nothing can be fixed', () => {
    setup([issue({ fixes: [] })]);
    expect(screen.queryByRole('button', { name: /Apply the suggested fixes/ })).toBeNull();
  });
});
