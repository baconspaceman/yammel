// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiResult, HelperStatus } from '../../shared/api';
import { HelpersSection, type HelpersApi } from './HelpersSection';

const STATUSES: HelperStatus[] = [
  { id: 'claudeCode', name: 'Claude Code', enabled: false, ready: true, model: null, note: 'Found on this computer.' },
  { id: 'codex', name: 'Codex', enabled: false, ready: false, model: null, note: 'Not found on this computer.' },
  { id: 'openRouter', name: 'OpenRouter', enabled: false, ready: false, model: null, keySet: false, canStoreKey: true, note: 'Needs your own OpenRouter key.' },
];

function fakeApi(start: HelperStatus[] = STATUSES) {
  let current = structuredClone(start);
  const api: HelpersApi = {
    helperStatus: vi.fn(async () => ({ ok: true, value: structuredClone(current) }) as ApiResult<HelperStatus[]>),
    saveSettings: vi.fn(async (patch) => {
      for (const [id, change] of Object.entries(patch.integrations ?? {}) as [string, { enabled?: boolean; model?: string | null }][]) {
        const helper = current.find((h) => h.id === id)!;
        if (change.enabled !== undefined) helper.enabled = change.enabled;
        if ('model' in change) helper.model = change.model ?? null;
      }
      return { ok: true, value: {} as never } as ApiResult<never>;
    }),
    setOpenRouterKey: vi.fn(async (key) => {
      const helper = current.find((h) => h.id === 'openRouter')!;
      helper.keySet = key !== null;
      helper.ready = key !== null;
      return { ok: true, value: structuredClone(current) } as ApiResult<HelperStatus[]>;
    }),
  };
  return api;
}

const group = (name: string) => screen.getByRole('group', { name });

describe('HelpersSection', () => {
  it('lists every helper, all off, saying what each needs and costs', async () => {
    render(<HelpersSection api={fakeApi()} onChanged={vi.fn()} confirm={() => true} />);
    expect(await screen.findByRole('heading', { name: 'Claude Code' })).toBeTruthy();
    for (const name of ['Claude Code', 'Codex', 'OpenRouter']) {
      expect((within(group(name)).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    }
    expect(screen.getByText(/Found on this computer/)).toBeTruthy();
    expect(screen.getByText(/Needs your own OpenRouter key/)).toBeTruthy();
    expect(screen.getByText(/already works on its own, for free, and sends nothing anywhere/)).toBeTruthy();
  });

  it('asks before switching a helper on, says what will be sent, and does nothing when declined', async () => {
    const api = fakeApi();
    const confirm = vi.fn((_message: string) => false);
    render(<HelpersSection api={api} onChanged={vi.fn()} confirm={confirm} />);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Claude Code' })).getByRole('checkbox'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toContain('your current YAML');
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it('switches it on after the person agrees, and tells the app', async () => {
    const api = fakeApi();
    const onChanged = vi.fn();
    render(<HelpersSection api={api} onChanged={onChanged} confirm={() => true} />);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Claude Code' })).getByRole('checkbox'));
    expect(api.saveSettings).toHaveBeenCalledWith({ integrations: { claudeCode: { enabled: true } } });
    await waitFor(() => expect((within(group('Claude Code')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true));
    expect(onChanged).toHaveBeenCalled();
  });

  it('switching off needs no question', async () => {
    const confirm = vi.fn((_message: string) => true);
    const api = fakeApi([{ ...STATUSES[0]!, enabled: true }, STATUSES[1]!, STATUSES[2]!]);
    render(<HelpersSection api={api} onChanged={vi.fn()} confirm={confirm} />);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Claude Code' })).getByRole('checkbox'));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.saveSettings).toHaveBeenCalledWith({ integrations: { claudeCode: { enabled: false } } });
  });

  it('warns when a helper is on but not ready', async () => {
    render(<HelpersSection api={fakeApi([STATUSES[0]!, { ...STATUSES[1]!, enabled: true }, STATUSES[2]!])} onChanged={vi.fn()} confirm={() => true} />);
    expect(await screen.findByText(/Switched on, but not ready yet: Codex was not found/)).toBeTruthy();
  });

  it('saves a key without ever showing it, and can remove it', async () => {
    const api = fakeApi();
    render(<HelpersSection api={api} onChanged={vi.fn()} confirm={() => true} />);
    const card = within(await screen.findByRole('group', { name: 'OpenRouter' }));
    const input = card.getByLabelText('OpenRouter key') as HTMLInputElement;
    expect(input.type).toBe('password');
    await userEvent.type(input, 'sk-or-secret');
    await userEvent.click(card.getByRole('button', { name: 'Save key' }));
    expect(api.setOpenRouterKey).toHaveBeenCalledWith('sk-or-secret');
    await waitFor(() => expect((card.getByLabelText('OpenRouter key') as HTMLInputElement).value).toBe(''));
    expect(document.body.textContent).not.toContain('sk-or-secret');
    await waitFor(() => expect((card.getByRole('button', { name: 'Remove key' }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(card.getByRole('button', { name: 'Remove key' }));
    expect(api.setOpenRouterKey).toHaveBeenLastCalledWith(null);
  });

  it('cannot take a key on a computer that cannot keep one safely', async () => {
    render(<HelpersSection api={fakeApi([STATUSES[0]!, STATUSES[1]!, { ...STATUSES[2]!, canStoreKey: false }])} onChanged={vi.fn()} confirm={() => true} />);
    const input = (await screen.findByLabelText('OpenRouter key')) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('saves an optional model name, and an empty box means the default', async () => {
    const api = fakeApi();
    render(<HelpersSection api={api} onChanged={vi.fn()} confirm={() => true} />);
    const card = within(await screen.findByRole('group', { name: 'Codex' }));
    expect((card.getByRole('button', { name: 'Save model' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(card.getByLabelText('Model (optional)'), 'gpt-x');
    await userEvent.click(card.getByRole('button', { name: 'Save model' }));
    expect(api.saveSettings).toHaveBeenCalledWith({ integrations: { codex: { model: 'gpt-x' } } });
  });

  it('shows an error from the app and keeps working', async () => {
    const api = fakeApi();
    api.setOpenRouterKey = vi.fn(async () => ({ ok: false, message: 'That does not look like a key.' }) as ApiResult<HelperStatus[]>);
    render(<HelpersSection api={api} onChanged={vi.fn()} confirm={() => true} />);
    const card = within(await screen.findByRole('group', { name: 'OpenRouter' }));
    await userEvent.type(card.getByLabelText('OpenRouter key'), 'bad');
    await userEvent.click(card.getByRole('button', { name: 'Save key' }));
    expect((await card.findByRole('alert')).textContent).toContain('does not look like a key');
  });
});
