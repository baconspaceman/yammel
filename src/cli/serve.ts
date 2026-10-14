import { StringDecoder } from 'node:string_decoder';
import type { Readable, Writable } from 'node:stream';
import { handleMessage, type RpcRequest, type RpcResponse } from './mcp';
import { jsonLine } from './run';
import type { Ctx } from './types';

/**
 * Serves MCP over newline-delimited JSON: one JSON-RPC message per line in, one reply per line out (nothing for notifications).
 * Messages are handled one after another, so replies come back in the order the requests were sent. Resolves when input ends.
 * Lines are split on "\n" only: JavaScript's own readers also split on U+2028 and U+2029, which are legal inside a JSON string.
 */
export async function serveMcp(input: Readable, output: Writable, makeCtx: () => Ctx): Promise<void> {
  const write = (response: RpcResponse) => {
    output.write(jsonLine(response));
  };

  const handleLine = async (line: string): Promise<void> => {
    const text = line.trim();
    if (text === '') return;
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: each line must be one JSON message.' } });
      return;
    }
    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request: send one JSON object per line (batches are not supported).' } });
      return;
    }
    const response = await handleMessage(message as RpcRequest, makeCtx);
    if (response !== null) write(response);
  };

  const decoder = new StringDecoder('utf8');
  let buffer = '';
  for await (const chunk of input) {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk as Buffer);
    for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      await handleLine(line);
    }
  }
  buffer += decoder.end();
  await handleLine(buffer); // a last message with no newline after it
}
