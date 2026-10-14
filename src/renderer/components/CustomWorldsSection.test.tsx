// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../shared/api';
import type { CustomWorldsStatus, CustomWorldsSummary, ScanResult } from '../../shared/customWorlds';
import { CustomWorldsSection, type CustomWorldsApi } from './CustomWorldsSection';

const SUMMARY: CustomWorldsSummary = {
  folder: 'C:\\worlds',
  scannedAt: '2026-10-14T00:00:00.000Z',
  games: [
    { name: 'Alpha Game', file: 'alpha.apworld' },
    { name: 'Beta Game', file: 'beta.apworld' },
  ],
  problems: [{ file: 'broken.apworld', error: 'Written for a newer Python than the one used to scan (3.12 or later), so it could not be read.' }],
};

function fakeApi(start: Partial<CustomWorldsStatus> = {}, over: Partial<CustomWorldsApi> = {}): CustomWorldsApi {
  let status: CustomWorldsStatus = { folder: null, canScan: true, reason: null, scanning: false, summary: null, ...start };
  return {
    customWorldsStatus: vi.fn(async () => ({ ok: true, value: status }) as ApiResult<CustomWorldsStatus>),
    pickCustomWorlds: vi.fn(async () => ({ ok: true, value: 'C:\\worlds' }) as ApiResult<string | null>),
    saveSettings: vi.fn(async (patch) => {
      const dir = (patch.archipelago as { customWorldsDir?: string | null } | undefined)?.customWorldsDir ?? null;
      status = { ...status, folder: dir, summary: dir === null ? null : status.summary };
      return { ok: true, value: {} } as never;
    }),
    scanCustomWorlds: vi.fn(async () => {
      status = { ...status, summary: SUMMARY };
      return { ok: true, value: { ok: true, summary: SUMMARY } } as ApiResult<ScanResult>;
    }),
    cancelScan: vi.fn(async () => ({ ok: true, value: null }) as ApiResult<null>),
    ...over,
  };
}

describe('CustomWorldsSection', () => {
  it('starts calm with nothing chosen and offers to choose a folder', async () => {
    render(<CustomWorldsSection api={fakeApi()} onSchemaChanged={vi.fn()} />);
    expect(await screen.findByTestId('custom-folder')).toHaveProperty('textContent', 'Not chosen');
    expect(screen.getByRole('button', { name: /Choose/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Scan/ })).toBeNull();
  });

  it('choosing a folder saves it and scans it, then lists the games and the files that could not be added', async () => {
    const api = fakeApi();
    const onSchemaChanged = vi.fn();
    render(<CustomWorldsSection api={api} onSchemaChanged={onSchemaChanged} />);
    await userEvent.click(await screen.findByRole('button', { name: /Choose/ }));
    expect(api.saveSettings).toHaveBeenCalledWith({ archipelago: { customWorldsDir: 'C:\\worlds' } });
    await waitFor(() => expect(api.scanCustomWorlds).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Found 2 custom games\./)).toBeTruthy();
    expect(screen.getByTestId('custom-summary').textContent).toMatch(/2 custom games available, 1 file could not be added/);
    expect(onSchemaChanged).toHaveBeenCalled();
    await userEvent.click(screen.getByText('The games found'));
    expect(screen.getByText('Alpha Game')).toBeTruthy();
    await userEvent.click(screen.getByText('Files that could not be added'));
    expect(screen.getByText(/newer Python/)).toBeTruthy();
  });

  it('says plainly when a scan cannot run, and does not offer one', async () => {
    render(<CustomWorldsSection api={fakeApi({ folder: 'C:\\worlds', canScan: false, reason: 'Scanning needs a source folder.' })} onSchemaChanged={vi.fn()} />);
    expect(await screen.findByText(/Cannot scan yet\. Scanning needs a source folder\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Scan/ })).toBeNull();
  });

  it('a make-a-YAML button starts a new YAML for that game, and starters can be saved for all of them', async () => {
    const onStartGame = vi.fn();
    const onSaveStarters = vi.fn(async () => 'Saved 2 files to C:\\out.');
    render(<CustomWorldsSection api={fakeApi({ folder: 'C:\\worlds', summary: SUMMARY })} onSchemaChanged={vi.fn()} onStartGame={onStartGame} onSaveStarters={onSaveStarters} />);
    await userEvent.click(await screen.findByText('The games found'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Make a YAML' })[1]!);
    expect(onStartGame).toHaveBeenCalledWith('Beta Game');
    await userEvent.click(screen.getByRole('button', { name: /Save a starter YAML for every custom game/ }));
    expect(onSaveStarters).toHaveBeenCalledWith(['Alpha Game', 'Beta Game']);
    expect(await screen.findByText('Saved 2 files to C:\\out.')).toBeTruthy();
  });

  it('forgetting the folder clears the choice and tells the app the games changed', async () => {
    const api = fakeApi({ folder: 'C:\\worlds', summary: SUMMARY });
    const onSchemaChanged = vi.fn();
    render(<CustomWorldsSection api={api} onSchemaChanged={onSchemaChanged} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Forget this folder' }));
    expect(api.saveSettings).toHaveBeenCalledWith({ archipelago: { customWorldsDir: null } });
    await waitFor(() => expect(screen.getByTestId('custom-folder').textContent).toBe('Not chosen'));
    expect(onSchemaChanged).toHaveBeenCalled();
  });

  it('a scan that was already running when the screen opened is shown with a Stop button, and the games reload when it ends', async () => {
    let scanning = true;
    const api = fakeApi({ folder: 'C:\\worlds' }, {
      customWorldsStatus: vi.fn(async () => ({ ok: true, value: { folder: 'C:\\worlds', canScan: true, reason: null, scanning, summary: scanning ? null : SUMMARY } }) as ApiResult<CustomWorldsStatus>),
    });
    const onSchemaChanged = vi.fn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CustomWorldsSection api={api} onSchemaChanged={onSchemaChanged} />);
      expect(await screen.findByRole('button', { name: 'Stop' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Scan/ })).toBeNull();
      scanning = false;
      await vi.advanceTimersByTimeAsync(3500);
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
      expect(onSchemaChanged).toHaveBeenCalled();
      expect(screen.getByTestId('custom-summary').textContent).toMatch(/2 custom games available/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a failed scan as a plain message', async () => {
    const api = fakeApi({ folder: 'C:\\worlds' }, { scanCustomWorlds: vi.fn(async () => ({ ok: true, value: { ok: false, reason: 'failed', message: 'The scan did not finish.' } }) as ApiResult<ScanResult>) });
    render(<CustomWorldsSection api={api} onSchemaChanged={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Scan this folder' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The scan did not finish.');
  });
});
