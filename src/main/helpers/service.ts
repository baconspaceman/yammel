import type { HelperId, HelperStatus } from '../../shared/api';
import type { Settings } from '../../shared/settings';
import { findExecutable } from './cli';
import { askClaude, askCodex, askOpenRouter, OPENROUTER_DEFAULT_MODEL, type HelperAnswer, type ProviderDeps } from './providers';
import type { SecretStore } from './secrets';

export const HELPER_IDS: readonly HelperId[] = ['claudeCode', 'codex', 'openRouter'];
export const MAX_PROMPT_CHARS = 60_000;

export interface HelperServiceDeps {
  settings(): Settings;
  secrets: SecretStore;
  env: Record<string, string | undefined>;
  /** Replaces the provider calls (tests). */
  providers?: ProviderDeps;
}

const NAMES: Record<HelperId, string> = { claudeCode: 'Claude Code', codex: 'Codex', openRouter: 'OpenRouter' };

export function isHelperId(value: unknown): value is HelperId {
  return typeof value === 'string' && (HELPER_IDS as readonly string[]).includes(value);
}

/** What each optional AI helper needs, and whether it is switched on and ready. Never reveals a key. */
export function helperStatuses(deps: HelperServiceDeps): HelperStatus[] {
  const settings = deps.settings();
  const find = deps.providers?.find ?? ((name: string) => findExecutable(name, deps.env));
  const claude = find('claude') !== null;
  const codex = find('codex') !== null;
  const keySet = deps.secrets.has('openRouter');
  return [
    {
      id: 'claudeCode',
      name: NAMES.claudeCode,
      enabled: settings.integrations.claudeCode.enabled,
      ready: claude,
      model: settings.integrations.claudeCode.model,
      note: claude
        ? 'Found on this computer. It uses your own Claude login, so each question uses part of your plan allowance. On a normal subscription login it costs nothing extra.'
        : 'Not found on this computer. Install Claude Code and sign in to use it.',
    },
    {
      id: 'codex',
      name: NAMES.codex,
      enabled: settings.integrations.codex.enabled,
      ready: codex,
      model: settings.integrations.codex.model,
      note: codex
        ? 'Found on this computer. It uses your own ChatGPT login. Codex uses a fair amount of your allowance for each question.'
        : 'Not found on this computer. Install Codex and sign in to use it.',
    },
    {
      id: 'openRouter',
      name: NAMES.openRouter,
      enabled: settings.integrations.openRouter.enabled,
      ready: keySet,
      model: settings.integrations.openRouter.model,
      keySet,
      canStoreKey: deps.secrets.canStore,
      note: keySet
        ? `A key is saved. Each question costs a small amount of money at OpenRouter's prices. The default model is ${OPENROUTER_DEFAULT_MODEL}.`
        : deps.secrets.canStore
          ? 'Needs your own OpenRouter key. Each question costs a small amount of money, charged to your OpenRouter account.'
          : 'This computer cannot keep a key safely, so OpenRouter cannot be used here.',
    },
  ];
}

/** Sends one request to a helper that is switched on, and returns the raw answer text. */
export async function askHelper(deps: HelperServiceDeps, helperId: unknown, prompt: unknown): Promise<HelperAnswer> {
  if (!isHelperId(helperId)) return { ok: false, message: 'That helper is not known.' };
  if (typeof prompt !== 'string' || prompt.trim() === '' || prompt.length > MAX_PROMPT_CHARS) return { ok: false, message: 'That request could not be sent.' };
  const settings = deps.settings().integrations[helperId];
  if (!settings.enabled) return { ok: false, message: `${NAMES[helperId]} is switched off in Settings.` };
  const providerDeps: ProviderDeps = { env: deps.env, ...deps.providers };
  switch (helperId) {
    case 'claudeCode':
      return askClaude(prompt, settings.model, providerDeps);
    case 'codex':
      return askCodex(prompt, settings.model, providerDeps);
    case 'openRouter':
      return askOpenRouter(prompt, settings.model, deps.secrets.get('openRouter'), providerDeps);
  }
}
