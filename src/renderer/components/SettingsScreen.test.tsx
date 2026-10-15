// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiResult, ArchipelagoFinding, HelperStatus, SettingsView } from '../../shared/api';
import type { CustomWorldsStatus, ScanResult } from '../../shared/customWorlds';
import type { HostBackup, HostFileContents, HostFileInfo, HostWriteResult } from '../../shared/host';
import { applyPatch, DEFAULT_SETTINGS } from '../../shared/settings';
import { SettingsScreen, type SettingsApi } from './SettingsScreen';

const NOTHING: ArchipelagoFinding = {
  sourceRoot: null,
  origin: null,
  python: null,
  installRoot: null,
  problem: 'No Archipelago source folder was found. The check count needs one; everything else works without it.',
};
const READY: ArchipelagoFinding = { sourceRoot: 'C:\\ap', origin: 'settings', python: 'C:\\ap\\.venv\\Scripts\\python.exe', installRoot: null, problem: null };

function fakeApi(start: SettingsView, over: Partial<SettingsApi> = {}): SettingsApi {
  let view = start;
  return {
    getSettings: vi.fn(async () => ({ ok: true, value: view }) as ApiResult<SettingsView>),
    saveSettings: vi.fn(async (patch) => {
      const settings = applyPatch(view.settings, patch);
      view = { settings, finding: settings.archipelago.sourceRoot === 'C:\\ap' ? READY : NOTHING };
      return { ok: true, value: view } as ApiResult<SettingsView>;
    }),
    pickArchipelagoFolder: vi.fn(async () => ({ ok: true, value: 'C:\\ap' }) as ApiResult<string | null>),
    pickPythonFile: vi.fn(async () => ({ ok: true, value: null }) as ApiResult<string | null>),
    helperStatus: vi.fn(async () => ({ ok: true, value: [] }) as ApiResult<HelperStatus[]>),
    setOpenRouterKey: vi.fn(async () => ({ ok: true, value: [] }) as ApiResult<HelperStatus[]>),
    customWorldsStatus: vi.fn(async () => ({ ok: true, value: { folder: null, canScan: false, reason: 'No source folder.', scanning: false, summary: null } }) as ApiResult<CustomWorldsStatus>),
    pickCustomWorlds: vi.fn(async () => ({ ok: true, value: null }) as ApiResult<string | null>),
    scanCustomWorlds: vi.fn(async () => ({ ok: false, message: 'none' }) as ApiResult<ScanResult>),
    cancelScan: vi.fn(async () => ({ ok: true, value: null }) as ApiResult<null>),
    hostFiles: vi.fn(async () => ({ ok: true, value: [] }) as ApiResult<HostFileInfo[]>),
    readHost: vi.fn(async () => ({ ok: false, message: 'none' }) as ApiResult<HostFileContents>),
    writeHost: vi.fn(async () => ({ ok: false, message: 'none' }) as ApiResult<HostWriteResult>),
    listHostBackups: vi.fn(async () => ({ ok: true, value: [] }) as ApiResult<HostBackup[]>),
    readHostBackup: vi.fn(async () => ({ ok: false, message: 'none' }) as ApiResult<string>),
    checkHostPaths: vi.fn(async (_id, values) => ({ ok: true, value: values.map(() => true) }) as ApiResult<boolean[]>),
    pickHostPath: vi.fn(async () => ({ ok: true, value: null }) as ApiResult<string | null>),
    ...over,
  };
}

const start = (): SettingsView => ({ settings: DEFAULT_SETTINGS, finding: NOTHING });

describe('SettingsScreen', () => {
  it('opens calmly with nothing set: says the check count is off and that nothing is required', async () => {
    render(<SettingsScreen api={fakeApi(start())} onBack={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/Off\. No Archipelago source folder was found/)).toBeTruthy();
    expect(screen.getByText(/Nothing on this page is required/)).toBeTruthy();
    expect(screen.getByTestId('settings-folder').textContent).toBe('Automatic');
    expect(screen.getByText(/Each one is off until you/)).toBeTruthy();
  });

  it('choosing a folder saves it, shows it, and tells the app the engine changed', async () => {
    const api = fakeApi(start());
    const onChanged = vi.fn();
    render(<SettingsScreen api={api} onBack={vi.fn()} onChanged={onChanged} />);
    await screen.findByText(/^Off\./);
    const [browse] = screen.getAllByRole('button', { name: /Browse/ });
    await userEvent.click(browse!);
    expect(await screen.findByText(/^Ready\. Using C:\\ap/)).toBeTruthy();
    expect(api.saveSettings).toHaveBeenCalledWith({ archipelago: { sourceRoot: 'C:\\ap' } });
    expect(screen.getByTestId('settings-folder').textContent).toBe('C:\\ap');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('cancelling the folder picker changes nothing', async () => {
    const api = fakeApi(start(), { pickArchipelagoFolder: vi.fn(async () => ({ ok: true, value: null }) as ApiResult<string | null>) });
    const onChanged = vi.fn();
    render(<SettingsScreen api={api} onBack={vi.fn()} onChanged={onChanged} />);
    await screen.findByText(/^Off\./);
    await userEvent.click(screen.getAllByRole('button', { name: /Browse/ })[0]!);
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('"Use automatic" clears the chosen folder, and is disabled when none is chosen', async () => {
    const chosen = applyPatch(DEFAULT_SETTINGS, { archipelago: { sourceRoot: 'C:\\ap' } });
    const api = fakeApi({ settings: chosen, finding: READY });
    render(<SettingsScreen api={api} onBack={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText(/^Ready\./);
    const [clearFolder, clearPython] = screen.getAllByRole('button', { name: 'Use automatic' }) as HTMLButtonElement[];
    expect(clearPython!.disabled).toBe(true);
    await userEvent.click(clearFolder!);
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ archipelago: { sourceRoot: null } }));
    expect(await screen.findByText(/^Off\./)).toBeTruthy();
  });

  it('shows an error from the app and keeps working', async () => {
    const api = fakeApi(start(), { pickPythonFile: vi.fn(async () => ({ ok: false, message: 'Choose a file named python or python.exe.' }) as ApiResult<string | null>) });
    render(<SettingsScreen api={api} onBack={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText(/^Off\./);
    await userEvent.click(screen.getAllByRole('button', { name: /Browse/ })[1]!);
    expect((await screen.findByRole('alert')).textContent).toContain('python.exe');
    expect(screen.getAllByRole('button', { name: /Browse/ })[0]!.hasAttribute('disabled')).toBe(false);
  });

  it('shows the installed Archipelago as information only', async () => {
    const view = { settings: DEFAULT_SETTINGS, finding: { ...NOTHING, installRoot: 'C:\\ProgramData\\Archipelago' } };
    render(<SettingsScreen api={fakeApi(view)} onBack={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/found at C:\\ProgramData\\Archipelago/)).toBeTruthy();
    expect(screen.getByText(/never changes it/)).toBeTruthy();
  });

  it('Back calls onBack', async () => {
    const onBack = vi.fn();
    render(<SettingsScreen api={fakeApi(start())} onBack={onBack} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
