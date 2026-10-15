/**
 * The app's saved settings. Everything here is optional: an empty settings file (or none at all) is a
 * complete, working setup. Nothing in this file is a secret; keys and tokens are never stored here.
 */

export interface ArchipelagoSettings {
  /** An Archipelago source folder (the one with ModuleUpdate.py). Used by the check-count engine. null = look for one. */
  sourceRoot: string | null;
  /** A Python to run the engine with. null = use the folder's own .venv / venv. */
  pythonPath: string | null;
  /** A folder of custom .apworld files whose games should be added to the editor. null = none. */
  customWorldsDir: string | null;
}

/** Extras that need an account or another program. Every one is off until the person turns it on. */
export interface HelperSettings {
  enabled: boolean;
  /** The model to ask for, or null to let the program or service pick its own default. */
  model: string | null;
}

export interface IntegrationSettings {
  claudeCode: HelperSettings;
  codex: HelperSettings;
  openRouter: HelperSettings;
  jev: { enabled: boolean };
}

/** How the app looks: follow the computer's light or dark setting, or always one of them. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export interface AppearanceSettings {
  theme: ThemeChoice;
}

/** The first-run "how it works" card. `seen` turns true the first time it is closed. */
export interface WelcomeSettings {
  seen: boolean;
}

export interface Settings {
  version: 1;
  archipelago: ArchipelagoSettings;
  integrations: IntegrationSettings;
  appearance: AppearanceSettings;
  welcome: WelcomeSettings;
}

function cleanTheme(value: unknown): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : 'system';
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  archipelago: { sourceRoot: null, pythonPath: null, customWorldsDir: null },
  integrations: {
    claudeCode: { enabled: false, model: null },
    codex: { enabled: false, model: null },
    openRouter: { enabled: false, model: null },
    jev: { enabled: false },
  },
  appearance: { theme: 'system' },
  welcome: { seen: false },
};

/** What the window may change. Anything not listed here cannot be changed from the page. */
export interface SettingsPatch {
  archipelago?: Partial<ArchipelagoSettings>;
  integrations?: { [K in keyof IntegrationSettings]?: { enabled?: boolean; model?: string | null } };
  appearance?: { theme?: ThemeChoice };
  welcome?: { seen?: boolean };
}

const MAX_PATH_LENGTH = 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The file name of a Python program the app is willing to run (python, python3, python3.11, with or without .exe). */
export const PYTHON_NAME = /^python[\d.]*(\.exe)?$/i;

/** A usable folder or file path, or null for "not set". Anything else (wrong type, blank, absurdly long) is "not set". */
export function cleanPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_PATH_LENGTH || trimmed.includes('\u0000')) return null;
  return trimmed;
}

/** A model name (letters, digits and . _ : / - only), or null. Nothing else is ever passed to a program or a web address. */
export function cleanModel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(trimmed) ? trimmed : null; // never starts with '-', so it cannot look like a flag
}

/** A path whose file name looks like a Python program, or null. A damaged settings file cannot name any other program. */
export function cleanPython(value: unknown): string | null {
  const path = cleanPath(value);
  if (path === null) return null;
  const name = path.split(/[\\/]/).pop() ?? '';
  return PYTHON_NAME.test(name) ? path : null;
}

/**
 * Reads whatever is in a settings file and returns a complete, valid Settings. Damaged or unknown parts
 * fall back to defaults, so a bad file can never stop the app from starting.
 */
export function parseSettings(raw: unknown): Settings {
  const out: Settings = structuredClone(DEFAULT_SETTINGS);
  if (!isRecord(raw)) return out;
  if (isRecord(raw['archipelago'])) {
    out.archipelago.sourceRoot = cleanPath(raw['archipelago']['sourceRoot']);
    out.archipelago.pythonPath = cleanPython(raw['archipelago']['pythonPath']);
    out.archipelago.customWorldsDir = cleanPath(raw['archipelago']['customWorldsDir']);
  }
  if (isRecord(raw['integrations'])) {
    for (const key of Object.keys(out.integrations) as (keyof IntegrationSettings)[]) {
      const entry = raw['integrations'][key];
      if (!isRecord(entry)) continue;
      if (entry['enabled'] === true) out.integrations[key].enabled = true;
      const target = out.integrations[key];
      if ('model' in target) target.model = cleanModel(entry['model']);
    }
  }
  if (isRecord(raw['appearance'])) out.appearance.theme = cleanTheme(raw['appearance']['theme']);
  if (isRecord(raw['welcome']) && raw['welcome']['seen'] === true) out.welcome.seen = true;
  return out;
}

/** Applies a patch from the window. Only known fields with the right type are taken; the rest are ignored. */
export function applyPatch(settings: Settings, patch: unknown): Settings {
  const out = structuredClone(settings);
  if (!isRecord(patch)) return out;
  const archipelago = patch['archipelago'];
  if (isRecord(archipelago)) {
    if ('sourceRoot' in archipelago) out.archipelago.sourceRoot = cleanPath(archipelago['sourceRoot']);
    if ('pythonPath' in archipelago) out.archipelago.pythonPath = cleanPython(archipelago['pythonPath']);
    if ('customWorldsDir' in archipelago) out.archipelago.customWorldsDir = cleanPath(archipelago['customWorldsDir']);
  }
  const integrations = patch['integrations'];
  if (isRecord(integrations)) {
    for (const key of Object.keys(out.integrations) as (keyof IntegrationSettings)[]) {
      const entry = integrations[key];
      if (!isRecord(entry)) continue;
      const target = out.integrations[key];
      if (typeof entry['enabled'] === 'boolean') target.enabled = entry['enabled'];
      if ('model' in target && 'model' in entry) target.model = cleanModel(entry['model']);
    }
  }
  const appearance = patch['appearance'];
  if (isRecord(appearance) && 'theme' in appearance) out.appearance.theme = cleanTheme(appearance['theme']);
  const welcome = patch['welcome'];
  if (isRecord(welcome) && typeof welcome['seen'] === 'boolean') out.welcome.seen = welcome['seen'];
  return out;
}
