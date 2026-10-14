import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPatch, DEFAULT_SETTINGS, type Settings } from '../../shared/settings';
import { SecretStore } from './secrets';
import { askHelper, helperStatuses, isHelperId, MAX_PROMPT_CHARS, type HelperServiceDeps } from './service';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'helpers-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const crypto = { available: () => true, encrypt: (t: string) => Buffer.from(t).toString('base64'), decrypt: (b: string) => Buffer.from(b, 'base64').toString() };

function make(settings: Settings = DEFAULT_SETTINGS, found: string[] = [], fetchImpl?: typeof fetch): HelperServiceDeps {
  return {
    settings: () => settings,
    secrets: SecretStore.in(dir, crypto),
    env: {},
    providers: { env: {}, find: (name) => (found.includes(name) ? process.execPath : null), ...(fetchImpl === undefined ? {} : { fetchImpl }) },
  };
}

const on = (id: 'claudeCode' | 'codex' | 'openRouter', model: string | null = null) => applyPatch(DEFAULT_SETTINGS, { integrations: { [id]: { enabled: true, model } } });

describe('helperStatuses', () => {
  it('starts with everything off, and says what each needs', () => {
    const statuses = helperStatuses(make());
    expect(statuses.map((s) => [s.id, s.enabled, s.ready])).toEqual([
      ['claudeCode', false, false],
      ['codex', false, false],
      ['openRouter', false, false],
    ]);
    expect(statuses[0]!.note).toContain('Not found');
    expect(statuses[2]!.note).toContain('Needs your own OpenRouter key');
    expect(statuses[2]!.canStoreKey).toBe(true);
  });

  it('shows what it found, and the cost in plain words, without revealing the key', async () => {
    const deps = make(DEFAULT_SETTINGS, ['claude', 'codex']);
    await deps.secrets.set('openRouter', 'sk-or-secret');
    const statuses = helperStatuses(deps);
    expect(statuses.map((s) => s.ready)).toEqual([true, true, true]);
    expect(statuses[0]!.note).toContain('costs nothing extra');
    expect(statuses[1]!.note).toContain('fair amount');
    expect(statuses[2]!.note).toContain('costs a small amount of money');
    expect(JSON.stringify(statuses)).not.toContain('sk-or-secret');
  });

  it('says so when the computer cannot keep a key safely', () => {
    const deps = { ...make(), secrets: SecretStore.in(dir, { ...crypto, available: () => false }) };
    expect(helperStatuses(deps)[2]!.note).toContain('cannot keep a key safely');
  });

  it('reports the chosen model and whether each is switched on', () => {
    const statuses = helperStatuses(make(on('codex', 'gpt-x')));
    expect(statuses[1]).toMatchObject({ enabled: true, model: 'gpt-x' });
  });
});

describe('askHelper', () => {
  it('only knows the three helpers', async () => {
    expect(isHelperId('codex')).toBe(true);
    expect(isHelperId('jev')).toBe(false);
    expect(await askHelper(make(), 'evil', 'hi')).toEqual({ ok: false, message: 'That helper is not known.' });
  });

  it('refuses a helper that is switched off, however it is asked', async () => {
    expect(await askHelper(make(DEFAULT_SETTINGS, ['claude']), 'claudeCode', 'hi')).toEqual({ ok: false, message: 'Claude Code is switched off in Settings.' });
  });

  it('refuses empty, non-text and oversize requests', async () => {
    const deps = make(on('openRouter'));
    for (const bad of ['', '   ', 5, null, 'x'.repeat(MAX_PROMPT_CHARS + 1)]) {
      expect(await askHelper(deps, 'openRouter', bad)).toEqual({ ok: false, message: 'That request could not be sent.' });
    }
  });

  it('asks OpenRouter with the saved key and the chosen model, and nothing else leaves', async () => {
    let request: { url: string; headers: Record<string, string>; body: { model: string } } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      request = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"message":"ok","edits":[],"followUps":[]}' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const deps = make(on('openRouter', 'some/model'), [], fetchImpl);
    await deps.secrets.set('openRouter', 'sk-or-secret');
    const answer = await askHelper(deps, 'openRouter', 'hello');
    expect(answer).toMatchObject({ ok: true });
    expect(request!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(request!.headers['Authorization']).toBe('Bearer sk-or-secret');
    expect(request!.body.model).toBe('some/model');
  });

  it('says to add a key when OpenRouter is on but no key is saved, without calling the network', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    const answer = await askHelper(make(on('openRouter'), [], fetchImpl), 'openRouter', 'hi');
    expect(answer).toMatchObject({ ok: false, message: expect.stringContaining('No OpenRouter key') });
    expect(called).toBe(false);
  });
});
