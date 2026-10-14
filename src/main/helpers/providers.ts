import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPLY_SCHEMA, SYSTEM_PROMPT } from '../../assistant/model';
import { cleanEnv, findExecutable, runCli } from './cli';

export type HelperAnswer = { ok: true; text: string } | { ok: false; message: string };

export interface ProviderDeps {
  env: Record<string, string | undefined>;
  /** Where throwaway working folders are made. */
  tmpRoot?: string;
  fetchImpl?: typeof fetch;
  /** How long to wait for an answer. */
  timeoutMs?: number;
  /** Replaces the program name search (tests). */
  find?: (name: string) => string | null;
  /** Goes before the program's own arguments (tests run a script through node this way). */
  argsPrefix?: string[];
}

const MAX_PROMPT_CHARS = 60_000;
const DEFAULT_TIMEOUT_MS = 150_000;

const fail = (message: string): HelperAnswer => ({ ok: false, message });

function friendly(program: 'Claude Code' | 'Codex', raw: string): string {
  const text = raw.trim();
  if (/not (logged|signed) in|log ?in|sign ?in|authenticat|oauth|credentials|unauthori[sz]ed|401/i.test(text)) {
    const command = program === 'Claude Code' ? 'claude' : 'codex login';
    return `${program} is not signed in on this computer. Open a terminal, run "${command}", sign in, and try again.`;
  }
  if (/usage limit|rate limit|quota|limit reached|too many requests|429/i.test(text)) {
    return `${program} says you have used up your allowance for now. Try again later.`;
  }
  return text === '' ? `${program} did not give an answer.` : `${program} said: ${text.slice(0, 220)}`;
}

async function inTempFolder<T>(deps: ProviderDeps, work: (folder: string) => Promise<T>): Promise<T> {
  const folder = await mkdtemp(join(deps.tmpRoot ?? tmpdir(), 'apyaml-helper-'));
  try {
    return await work(folder);
  } finally {
    await rm(folder, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Asks the person's own Claude Code (headless, no tools, no saved session). Uses their subscription login only. */
export async function askClaude(prompt: string, model: string | null, deps: ProviderDeps): Promise<HelperAnswer> {
  if (prompt.length > MAX_PROMPT_CHARS) return fail('That request is too large to send.');
  const exe = (deps.find ?? ((name) => findExecutable(name, deps.env)))('claude');
  if (exe === null) return fail('Claude Code was not found on this computer.');
  const args = [...(deps.argsPrefix ?? []), '-p', '--output-format', 'json', '--json-schema', JSON.stringify(REPLY_SCHEMA), '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--system-prompt', SYSTEM_PROMPT];
  if (model !== null) args.push('--model', model);
  return inTempFolder(deps, async (cwd) => {
    const run = await runCli({ command: exe, args, input: prompt, cwd, env: cleanEnv(deps.env), timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    if (!run.ok) return fail(run.reason === 'timeout' ? 'Claude Code took too long to answer.' : run.message);
    let parsed: unknown;
    try {
      parsed = JSON.parse(run.stdout.trim());
    } catch {
      return fail(friendly('Claude Code', run.stderr || run.stdout));
    }
    if (typeof parsed !== 'object' || parsed === null) return fail('Claude Code gave an answer that could not be read.');
    const result = parsed as Record<string, unknown>;
    if (result['is_error'] === true) return fail(friendly('Claude Code', typeof result['result'] === 'string' ? result['result'] : run.stderr));
    const structured = result['structured_output'];
    if (structured !== undefined && structured !== null) return { ok: true, text: JSON.stringify(structured) };
    if (typeof result['result'] === 'string' && result['result'].trim() !== '') return { ok: true, text: result['result'] };
    return fail('Claude Code did not give an answer.');
  });
}

/** Asks the person's own Codex (read-only sandbox, no saved session, answer forced into the reply schema). */
export async function askCodex(prompt: string, model: string | null, deps: ProviderDeps): Promise<HelperAnswer> {
  if (prompt.length > MAX_PROMPT_CHARS) return fail('That request is too large to send.');
  const exe = (deps.find ?? ((name) => findExecutable(name, deps.env)))('codex');
  if (exe === null) return fail('Codex was not found on this computer.');
  return inTempFolder(deps, async (cwd) => {
    const schemaFile = join(cwd, 'schema.json');
    const outFile = join(cwd, 'answer.txt');
    await writeFile(schemaFile, JSON.stringify(REPLY_SCHEMA), 'utf8');
    const args = [...(deps.argsPrefix ?? []), 'exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '--output-schema', schemaFile, '-o', outFile, '-C', cwd, '-c', 'mcp_servers={}'];
    if (model !== null) args.push('-m', model);
    args.push('-'); // read the request from standard input
    const run = await runCli({ command: exe, args, input: `${SYSTEM_PROMPT}\n\n${prompt}`, cwd, env: cleanEnv(deps.env), timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    if (!run.ok) return fail(run.reason === 'timeout' ? 'Codex took too long to answer.' : run.message);
    let text = '';
    try {
      text = (await readFile(outFile, 'utf8')).trim();
    } catch {
      text = '';
    }
    if (run.code !== 0 && text === '') return fail(friendly('Codex', run.stderr || run.stdout));
    return text === '' ? fail(friendly('Codex', run.stderr)) : { ok: true, text };
  });
}

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

/** Asks OpenRouter with the person's own key. This costs them money at OpenRouter's prices; the app never adds a key of its own. */
export async function askOpenRouter(prompt: string, model: string | null, key: string | null, deps: ProviderDeps): Promise<HelperAnswer> {
  if (prompt.length > MAX_PROMPT_CHARS) return fail('That request is too large to send.');
  if (key === null || key === '') return fail('No OpenRouter key has been saved. Add one in Settings.');
  const doFetch = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 90_000);
  try {
    const response = await doFetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Archipelago YAML Editor' },
      body: JSON.stringify({
        model: model ?? OPENROUTER_DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'helper_reply', strict: true, schema: REPLY_SCHEMA } },
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });
    if (response.status === 401 || response.status === 403) return fail('OpenRouter did not accept the saved key. Check it in Settings.');
    if (response.status === 402) return fail('OpenRouter says the account is out of credit.');
    if (response.status === 429) return fail('OpenRouter says there are too many requests right now. Try again in a moment.');
    if (!response.ok) return fail(`OpenRouter answered with an error (${response.status}).`);
    const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[]; error?: { message?: unknown } };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim() !== '') return { ok: true, text: content };
    return fail(typeof data.error?.message === 'string' ? `OpenRouter said: ${data.error.message.slice(0, 200)}` : 'OpenRouter did not give an answer.');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return fail('OpenRouter took too long to answer.');
    return fail('OpenRouter could not be reached. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
}
