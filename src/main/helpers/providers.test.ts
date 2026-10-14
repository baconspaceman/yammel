import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanEnv, findExecutable, runCli } from './cli';
import { askClaude, askCodex, askOpenRouter, OPENROUTER_URL } from './providers';

const FAKE = join(process.cwd(), 'tests', 'fixtures', 'fake-cli.mjs');

/** Runs the real askClaude / askCodex code, with "the program" being node running the stand-in script. */
function standIn(mode: string, extraEnv: Record<string, string> = {}, timeoutMs = 20_000) {
  return {
    env: { ...process.env, FAKE_MODE: mode, ...extraEnv } as Record<string, string | undefined>,
    timeoutMs,
    find: () => process.execPath,
    argsPrefix: [FAKE],
  };
}

describe('cleanEnv', () => {
  it('removes every pay-per-use key and account switch, and keeps the rest', () => {
    const env = cleanEnv({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'b', OPENROUTER_API_KEY: 'c', openai_base_url: 'd', PATH: '/bin', HOME: '/h', EMPTY: undefined });
    expect(env).toEqual({ PATH: '/bin', HOME: '/h' });
  });
});

describe('findExecutable', () => {
  const exists = (present: string[]) => (path: string) => present.includes(path);
  it('finds a real program on the PATH, and on Windows only an .exe', () => {
    const win = join('C:', 'bin', 'claude.exe');
    expect(findExecutable('claude', { PATH: [join('C:', 'x'), join('C:', 'bin')].join(';') }, 'win32', exists([win]))).toBe(win);
    expect(findExecutable('codex', { PATH: join('C:', 'bin') }, 'win32', exists([join('C:', 'bin', 'codex.cmd')]))).toBeNull();
    expect(findExecutable('claude', { PATH: '' }, 'win32', () => true)).toBeNull();
  });
});

describe('runCli', () => {
  const base = { cwd: process.cwd(), env: cleanEnv(process.env) };
  it('runs a program, passes standard input, and returns what it printed', async () => {
    const run = await runCli({ ...base, command: process.execPath, args: ['-e', 'process.stdin.on("data",d=>process.stdout.write("got:"+d))'], input: 'abc', timeoutMs: 10_000 });
    expect(run).toMatchObject({ ok: true, stdout: 'got:abc', code: 0 });
  });

  it('stops a program that takes too long', async () => {
    const run = await runCli({ ...base, command: process.execPath, args: ['-e', 'setTimeout(()=>{},60000)'], timeoutMs: 300 });
    expect(run).toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('stops a program that prints too much', async () => {
    const run = await runCli({ ...base, command: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(5000))'], timeoutMs: 10_000, maxChars: 1000 });
    expect(run).toMatchObject({ ok: false, reason: 'too-big' });
  });

  it('says so when the program cannot be started', async () => {
    const run = await runCli({ ...base, command: join(process.cwd(), 'no-such-program.exe'), args: [], timeoutMs: 5000 });
    expect(run).toMatchObject({ ok: false, reason: 'start' });
  });
});

describe('askClaude', () => {
  it('reports a missing program plainly, and refuses a request that is too large', async () => {
    expect(await askClaude('hi', null, { env: {}, find: () => null })).toEqual({ ok: false, message: 'Claude Code was not found on this computer.' });
    expect(await askClaude('x'.repeat(70_000), null, { env: {}, find: () => process.execPath })).toEqual({ ok: false, message: 'That request is too large to send.' });
  });

  it('returns the structured answer, sends the request on standard input, asks for no tools and no saved session, and hides keys', async () => {
    const answer = await askClaude('hello there', 'some-model', standIn('claude-ok', { ANTHROPIC_API_KEY: 'sk-secret' }));
    expect(answer.ok).toBe(true);
    const data = JSON.parse((answer as { text: string }).text);
    expect(data.message).toBe('hello');
    expect(data.echoedInputLength).toBe('hello there'.length);
    expect(data.echoedArgs).toEqual(expect.arrayContaining(['-p', '--no-session-persistence', '--tools', '', '--model', 'some-model', '--json-schema']));
    expect(data.sawApiKey).toBeNull();
  });

  it('reads an answer that comes back as text instead of structured output', async () => {
    const answer = await askClaude('hi', null, standIn('claude-text'));
    expect(answer.ok && JSON.parse((answer as { text: string }).text.replace(/^Sure: /, '')).message).toBe('hello');
  });

  it('says plainly when the program is not signed in, or the allowance is used up', async () => {
    expect(await askClaude('hi', null, standIn('claude-auth'))).toMatchObject({ ok: false, message: expect.stringContaining('not signed in') });
    expect(await askClaude('hi', null, standIn('claude-limit'))).toMatchObject({ ok: false, message: expect.stringContaining('allowance') });
  });

  it('copes with garbage and with a program that hangs', async () => {
    expect(await askClaude('hi', null, standIn('garbage'))).toMatchObject({ ok: false });
    expect(await askClaude('hi', null, standIn('hang', {}, 300))).toEqual({ ok: false, message: 'Claude Code took too long to answer.' });
  });
});

describe('askCodex', () => {
  it('reports a missing program plainly and refuses oversize requests', async () => {
    expect(await askCodex('hi', null, { env: {}, find: () => null })).toEqual({ ok: false, message: 'Codex was not found on this computer.' });
    expect(await askCodex('x'.repeat(70_000), null, { env: {}, find: () => process.execPath })).toEqual({ ok: false, message: 'That request is too large to send.' });
  });

  it('reads the answer file, runs read-only with no saved session, sends the rules and the request, and hides keys', async () => {
    const answer = await askCodex('hello there', 'gpt-x', standIn('codex-ok', { OPENAI_API_KEY: 'sk-secret' }));
    expect(answer.ok).toBe(true);
    const data = JSON.parse((answer as { text: string }).text);
    expect(data.echoedArgs).toEqual(expect.arrayContaining(['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-m', 'gpt-x', '-']));
    expect(data.echoedInput).toContain('You help a person fill in an Archipelago');
    expect(data.sawApiKey).toBeNull();
  });

  it('explains a failed login in plain words', async () => {
    expect(await askCodex('hi', null, standIn('codex-fail'))).toMatchObject({ ok: false, message: expect.stringContaining('not signed in') });
  });

  it('gives up on a program that hangs', async () => {
    expect(await askCodex('hi', null, standIn('hang', {}, 300))).toEqual({ ok: false, message: 'Codex took too long to answer.' });
  });
});

describe('askOpenRouter', () => {
  const ok = (content: unknown) => (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as unknown as typeof fetch;
  const status = (code: number) => (async () => new Response('{}', { status: code })) as unknown as typeof fetch;

  it('sends the key as a bearer token to OpenRouter only, asks for strict JSON, and returns the text', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"message":"hi"}' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const answer = await askOpenRouter('hello', 'some/model', 'sk-test', { env: {}, fetchImpl });
    expect(answer).toEqual({ ok: true, text: '{"message":"hi"}' });
    expect(seen!.url).toBe(OPENROUTER_URL);
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test');
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe('some/model');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[1].content).toBe('hello');
  });

  it('uses a default model when none is chosen, and never sends the key in the body', async () => {
    let body = '';
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await askOpenRouter('hello', null, 'sk-secret', { env: {}, fetchImpl });
    expect(JSON.parse(body).model).toContain('/');
    expect(body).not.toContain('sk-secret');
  });

  it('explains each kind of failure in plain words', async () => {
    expect(await askOpenRouter('x', null, null, { env: {} })).toMatchObject({ ok: false, message: expect.stringContaining('No OpenRouter key') });
    expect(await askOpenRouter('x', null, 'k', { env: {}, fetchImpl: status(401) })).toMatchObject({ message: expect.stringContaining('did not accept the saved key') });
    expect(await askOpenRouter('x', null, 'k', { env: {}, fetchImpl: status(402) })).toMatchObject({ message: expect.stringContaining('out of credit') });
    expect(await askOpenRouter('x', null, 'k', { env: {}, fetchImpl: status(429) })).toMatchObject({ message: expect.stringContaining('too many requests') });
    expect(await askOpenRouter('x', null, 'k', { env: {}, fetchImpl: status(500) })).toMatchObject({ message: expect.stringContaining('(500)') });
    expect(await askOpenRouter('x', null, 'k', { env: {}, fetchImpl: ok(null) })).toMatchObject({ ok: false });
    const down = (async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    expect(await askOpenRouter('x', null, 'k', { env: {}, fetchImpl: down })).toMatchObject({ message: expect.stringContaining('could not be reached') });
  });

  it('gives up after the time limit', async () => {
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as unknown as typeof fetch;
    expect(await askOpenRouter('x', null, 'k', { env: {}, fetchImpl: slow, timeoutMs: 100 })).toMatchObject({ message: expect.stringContaining('too long') });
  });

  it('refuses an oversize request before any network call', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    await askOpenRouter('x'.repeat(70_000), null, 'k', { env: {}, fetchImpl });
    expect(called).toBe(false);
  });
});

