import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { COMMANDS } from './commands';
import { handleMessage, listTools, SERVER_INFO, toolName } from './mcp';
import { serveMcp } from './serve';
import { FakeEngine, makeCtx } from './testCtx';
import { SetupError } from './types';

const call = (name: string, args: Record<string, unknown>, id: number | string = 1) =>
  handleMessage({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, () => makeCtx().ctx);

function text(response: Awaited<ReturnType<typeof call>>): Record<string, unknown> {
  const result = response?.result as { content: { type: string; text: string }[] };
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe('listTools', () => {
  it('has one tool per command, with names like apyaml_schema_refresh', () => {
    expect(listTools().map((t) => t.name)).toEqual(['apyaml_games', 'apyaml_options', 'apyaml_new', 'apyaml_fuzz', 'apyaml_count', 'apyaml_rate', 'apyaml_schema_refresh']);
    expect(COMMANDS.map(toolName)).toEqual(listTools().map((t) => t.name));
  });

  it('describes inputs with real types, camel-cased names, and the required argument', () => {
    const fuzz = listTools().find((t) => t.name === 'apyaml_fuzz')!;
    expect(fuzz.inputSchema.required).toEqual(['game']);
    expect(fuzz.inputSchema.additionalProperties).toBe(false);
    expect(fuzz.inputSchema.properties['count']).toMatchObject({ type: 'number' });
    expect(fuzz.inputSchema.properties['check']).toMatchObject({ type: 'boolean' });
    expect(fuzz.inputSchema.properties['set']).toMatchObject({ type: 'array', items: { type: 'string' } });
    const refresh = listTools().find((t) => t.name === 'apyaml_schema_refresh')!;
    expect(Object.keys(refresh.inputSchema.properties)).toEqual(['apRoot']);
    expect(refresh.inputSchema.required).toEqual([]);
  });

  it('puts the exit codes in every description so an agent knows how results are reported', () => {
    for (const tool of listTools()) expect(tool.description).toContain('2 = a YAML was refused by its world');
  });
});

describe('handleMessage', () => {
  it('answers initialize with the tools capability and echoes the protocol version it was offered', async () => {
    const response = await handleMessage({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, () => makeCtx().ctx);
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 0,
      result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: SERVER_INFO },
    });
    const none = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, () => makeCtx().ctx);
    expect((none?.result as { protocolVersion: string }).protocolVersion).toBe('2024-11-05');
  });

  it('answers ping and tools/list, and stays silent for notifications', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', id: 2, method: 'ping' }, () => makeCtx().ctx)).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
    const list = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, () => makeCtx().ctx);
    expect((list?.result as { tools: unknown[] }).tools).toHaveLength(7);
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, () => makeCtx().ctx)).toBeNull();
    expect(await handleMessage({ jsonrpc: '2.0', method: 'something/else' }, () => makeCtx().ctx)).toBeNull();
  });

  it('refuses an unknown method with a request id', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', id: 9, method: 'resources/list' }, () => makeCtx().ctx)).toEqual({
      jsonrpc: '2.0',
      id: 9,
      error: { code: -32601, message: 'Method not found: resources/list' },
    });
    expect(await handleMessage({ jsonrpc: '2.0', id: 9 }, () => makeCtx().ctx)).toMatchObject({ error: { code: -32600 } });
  });

  it('runs a tool and returns its JSON result as text, not as an error', async () => {
    const response = await call('apyaml_new', { game: 'Test Game', set: ['lives=3'], seed: 2 });
    expect((response?.result as { isError: boolean }).isError).toBe(false);
    expect(text(response)).toMatchObject({ ok: true, game: 'Test Game', seed: 2 });
    expect(text(response)['yaml']).toContain('lives: 3');
  });

  it('shows exit code 2 in the result when a world refused a YAML, even though the tool itself worked', async () => {
    const engine = new FakeEngine((n) => (n === 1 ? { ok: false, reason: 'failed', message: 'world_error: OptionError: bad mix' } : { ok: true, checks: 5, items: 5, unresolved: [], invalid: [], ms: 1 }));
    const response = await handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'apyaml_fuzz', arguments: { game: 'Test Game', count: 3, out: 'dir', check: true } } },
      () => makeCtx(engine).ctx,
    );
    expect((response?.result as { isError: boolean }).isError).toBe(false);
    expect(text(response)).toMatchObject({ ok: true, exitCode: 2, summary: { refused: 1, accepted: 2 } });
  });

  it('reports a setup problem (no schema yet) as exit code 3', async () => {
    const response = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'apyaml_games', arguments: {} } }, () => {
      throw new SetupError('The game schema was not found. Run "apyaml schema-refresh" first.');
    });
    expect((response?.result as { isError: boolean }).isError).toBe(true);
    expect(text(response)).toMatchObject({ ok: false, exitCode: 3 });
  });

  it('marks a failing tool as an error but still explains it', async () => {
    const response = await call('apyaml_new', { game: 'Nope' });
    expect((response?.result as { isError: boolean }).isError).toBe(true);
    expect(text(response)).toMatchObject({ ok: false, exitCode: 1 });
    expect(String(text(response)['error'])).toContain('No game called "Nope"');
  });

  it('checks the arguments before running anything', async () => {
    expect(text(await call('apyaml_new', { game: 'Test Game', speed: 3 }))['error']).toBe('Unknown argument "speed". Arguments: game, name, seed, randomize, set, lock, band, out, force.');
    expect(text(await call('apyaml_new', { game: 3 }))['error']).toBe('Argument "game" must be a string.');
    expect(text(await call('apyaml_new', { game: 'Test Game', seed: 'x' }))['error']).toBe('Argument "seed" must be a number.');
    expect(text(await call('apyaml_new', { game: 'Test Game', set: 'lives=3' }))['error']).toBe('Argument "set" must be a list of strings.');
    expect(text(await call('apyaml_new', {}))['error']).toBe('Missing required argument "game": the game name.');
  });

  it('refuses an unknown tool and arguments that are not an object', async () => {
    expect(await call('apyaml_nope', {})).toMatchObject({ error: { code: -32602 } });
    const bad = await handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'apyaml_games', arguments: [] } }, () => makeCtx().ctx);
    expect(bad).toMatchObject({ error: { code: -32602, message: 'Tool arguments must be an object.' } });
  });

  it('only builds the context (and so loads the schema) when a tool really runs', async () => {
    let built = 0;
    const lazy = () => {
      built += 1;
      return makeCtx().ctx;
    };
    await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, lazy);
    await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, lazy);
    expect(built).toBe(0);
    await handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'apyaml_games', arguments: {} } }, lazy);
    expect(built).toBe(1);
  });
});

describe('serveMcp', () => {
  async function converse(lines: string[]): Promise<Record<string, unknown>[]> {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (c: Buffer) => chunks.push(c.toString('utf8')));
    const done = serveMcp(input, output, () => makeCtx().ctx);
    for (const line of lines) input.write(`${line}\n`);
    input.end();
    await done;
    return chunks.join('').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  it('answers each request on its own line, in order, and nothing for notifications', async () => {
    const replies = await converse([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      '',
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'apyaml_games', arguments: {} } }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }),
    ]);
    expect(replies.map((r) => r['id'])).toEqual([1, 2, 3]);
    expect(JSON.parse(((replies[1]!['result'] as { content: { text: string }[] }).content[0]!.text))).toMatchObject({ ok: true, count: 2 });
  });

  it('answers bad lines with a protocol error and keeps going', async () => {
    const replies = await converse(['{not json', '[1,2]', JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'ping' })]);
    expect(replies[0]).toMatchObject({ id: null, error: { code: -32700 } });
    expect(replies[1]).toMatchObject({ id: null, error: { code: -32600 } });
    expect(replies[2]).toEqual({ jsonrpc: '2.0', id: 5, result: {} });
  });

  it('does not split a message at the Unicode line separators U+2028 and U+2029, and escapes them in replies', async () => {
    const message = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'apyaml_options', arguments: { game: 'Test\u2028Game\u2029' } } });
    expect(message).toContain('\u2028'); // JSON.stringify leaves the raw character in place
    const replies = await converse([message, JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'ping' })]);
    expect(replies.map((r) => r['id'])).toEqual([7, 8]);
    const text = (replies[0]!['result'] as { content: { text: string }[] }).content[0]!.text;
    expect(JSON.parse(text)).toMatchObject({ ok: false });
  });

  it('keeps raw U+2028 and U+2029 out of what it writes', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (c: Buffer) => chunks.push(c.toString('utf8')));
    const done = serveMcp(input, output, () => makeCtx().ctx);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'apyaml_options', arguments: { game: 'a\u2028b' } } })}\n`);
    input.end();
    await done;
    const written = chunks.join('');
    expect(written).not.toMatch(/[\u2028\u2029]/);
    expect(written).toContain('\\u2028');
  });

  it('handles a message that arrives in pieces', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (c: Buffer) => chunks.push(c.toString('utf8')));
    const done = serveMcp(input, output, () => makeCtx().ctx);
    const line = JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' });
    input.write(line.slice(0, 10));
    input.write(`${line.slice(10)}\n${JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'ping' }).slice(0, 5)}`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'ping' }).slice(5)}\n`);
    input.end();
    await done;
    expect(chunks.join('').trim().split('\n').map((l) => (JSON.parse(l) as { id: number }).id)).toEqual([4, 5]);
  });

  it('answers a final message even when the input ends without a newline', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (c: Buffer) => chunks.push(c.toString('utf8')));
    const done = serveMcp(input, output, () => makeCtx().ctx);
    input.end(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }));
    await done;
    expect(JSON.parse(chunks.join(''))).toEqual({ jsonrpc: '2.0', id: 9, result: {} });
  });

  it('finishes when input ends', async () => {
    expect(await converse([])).toEqual([]);
  });
});
