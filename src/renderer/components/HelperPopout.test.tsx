// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../shared/api';
import type { HelperAction, HelperSnapshot } from '../../shared/popout';
import { HelperPopout, type PopoutApi } from './HelperPopout';

const SNAPSHOT: HelperSnapshot = {
  entries: [
    { id: 1, role: 'user', text: 'make it harder' },
    {
      id: 2,
      role: 'assistant',
      text: 'That moves the difficulty up.',
      reply: {
        text: 'That moves the difficulty up.',
        proposals: [{ id: 'p1', title: 'Set Item Pool to Hard', edits: [{ op: 'set', game: 'G', option: 'item_pool', value: 'hard' }] }],
        pointers: [{ game: 'G', option: 'item_pool', label: 'Item Pool' }],
        followUps: ['A bit harder'],
        source: 'guide',
      },
    },
  ],
  starters: ['Make it easier'],
  busy: false,
  helpers: [{ id: 'guide', name: 'Built-in guide', unavailable: null }],
  helperId: 'guide',
  note: 'The built-in guide runs on this computer.',
  settled: [],
};

function fakeApi(initial: HelperSnapshot | null = SNAPSHOT) {
  let push: (snapshot: HelperSnapshot) => void = () => undefined;
  const actions: HelperAction[] = [];
  const api: PopoutApi = {
    getHelperSnapshot: vi.fn(async () => ({ ok: true, value: initial }) as ApiResult<HelperSnapshot | null>),
    onHelperSnapshot: vi.fn((listener) => {
      push = listener;
      return () => undefined;
    }),
    sendHelperAction: vi.fn(async (action) => {
      actions.push(action);
      return { ok: true, value: null } as ApiResult<null>;
    }),
    closeHelperWindow: vi.fn(async () => ({ ok: true, value: null }) as ApiResult<null>),
  };
  return { api, actions, push: (snapshot: HelperSnapshot) => push(snapshot) };
}

describe('HelperPopout', () => {
  it('shows the conversation it was given, and says it is waiting when there is none yet', async () => {
    const waiting = fakeApi(null);
    const { unmount } = render(<HelperPopout api={waiting.api} />);
    expect(await screen.findByText(/Waiting for the editor window/)).toBeTruthy();
    act(() => waiting.push(SNAPSHOT));
    expect(await screen.findByText('make it harder')).toBeTruthy();
    unmount();
    const ready = fakeApi();
    render(<HelperPopout api={ready.api} />);
    expect(await screen.findByText('That moves the difficulty up.')).toBeTruthy();
    expect(screen.getByText('Set Item Pool to Hard')).toBeTruthy();
  });

  it('turns every click into an action for the editor window, and does nothing itself', async () => {
    const { api, actions } = fakeApi();
    render(<HelperPopout api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show Item Pool' }));
    await userEvent.click(screen.getByRole('button', { name: 'A bit harder' }));
    await userEvent.type(screen.getByLabelText('Message to the helper'), 'turn off death link');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(actions).toEqual([
      { type: 'apply', proposalId: 'p1' },
      { type: 'point', game: 'G', option: 'item_pool' },
      { type: 'send', text: 'A bit harder', viaChip: true },
      { type: 'send', text: 'turn off death link', viaChip: false },
      { type: 'clear' },
    ]);
  });

  it('shows what was applied from the copy it is given, and can hand the chat back', async () => {
    const { api, push } = fakeApi();
    render(<HelperPopout api={api} />);
    await screen.findByText('Set Item Pool to Hard');
    act(() => push({ ...SNAPSHOT, settled: [['p1', 'applied']] }));
    await waitFor(() => expect(screen.getByText('Applied (you can undo it)')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Back to the editor' }));
    expect(api.closeHelperWindow).toHaveBeenCalled();
  });

  it('shows a refusal as a message', async () => {
    const { api } = fakeApi();
    (api.sendHelperAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, message: 'Request refused.' });
    render(<HelperPopout api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Request refused.');
  });
});
