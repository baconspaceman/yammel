import { inputKey } from './args';
import { COMMANDS } from './commands';
import { EXIT_CODES, toPayload } from './run';
import { SetupError, type CommandDef, type CommandResult, type Ctx } from './types';

/**
 * A small Model Context Protocol server over newline-delimited JSON-RPC (stdin/stdout), with no dependencies.
 * Every command in the table is one tool, with the same inputs and the same JSON result as the command line.
 */

export const SERVER_INFO = { name: 'apyaml', version: '0.1.0' } as const;
const DEFAULT_PROTOCOL = '2024-11-05';

export interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

export function toolName(command: CommandDef): string {
  return `apyaml_${command.name.replace(/-/g, '_')}`;
}

function schemaFor(command: CommandDef): McpTool['inputSchema'] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (command.positional !== undefined) {
    properties[command.positional.name] = { type: 'string', description: command.positional.description };
    if (command.positional.required) required.push(command.positional.name);
  }
  for (const flag of command.flags) {
    const type = flag.type === 'list' ? { type: 'array', items: { type: 'string' } } : { type: flag.type };
    properties[inputKey(flag.name)] = { ...type, description: flag.description };
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

export function listTools(): McpTool[] {
  return COMMANDS.map((command) => ({
    name: toolName(command),
    description: `${command.summary} Exit codes: ${Object.entries(EXIT_CODES).map(([code, text]) => `${code} = ${text}`).join('; ')}.`,
    inputSchema: schemaFor(command),
  }));
}

/** Checks tool arguments against the command's own flags, so a wrong call gets a plain message instead of a surprise. */
function checkArguments(command: CommandDef, args: Record<string, unknown>): string | null {
  const known = new Map<string, string>();
  if (command.positional !== undefined) known.set(command.positional.name, 'string');
  for (const flag of command.flags) known.set(inputKey(flag.name), flag.type);
  for (const [key, value] of Object.entries(args)) {
    const type = known.get(key);
    if (type === undefined) return `Unknown argument "${key}". Arguments: ${[...known.keys()].join(', ') || 'none'}.`;
    const okType =
      type === 'list' ? Array.isArray(value) && value.every((v) => typeof v === 'string') : typeof value === type && !(type === 'number' && !Number.isFinite(value as number));
    if (!okType) return `Argument "${key}" must be ${type === 'list' ? 'a list of strings' : `a ${type}`}.`;
  }
  if (command.positional?.required === true && args[command.positional.name] === undefined) {
    return `Missing required argument "${command.positional.name}": ${command.positional.description}.`;
  }
  return null;
}

const reply = (id: RpcRequest['id'], result: unknown): RpcResponse => ({ jsonrpc: '2.0', id: id ?? null, result });
const error = (id: RpcRequest['id'], code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** One message in, at most one message out (notifications get none). `makeCtx` is only called when a tool actually runs. */
export async function handleMessage(message: RpcRequest, makeCtx: () => Ctx): Promise<RpcResponse | null> {
  const isNotification = message.id === undefined;
  const method = message.method;
  if (typeof method !== 'string') return isNotification ? null : error(message.id, -32600, 'Invalid request.');

  switch (method) {
    case 'initialize': {
      const wanted = message.params?.['protocolVersion'];
      return reply(message.id, {
        protocolVersion: typeof wanted === 'string' ? wanted : DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }
    case 'ping':
      return reply(message.id, {});
    case 'tools/list':
      return reply(message.id, { tools: listTools() });
    case 'tools/call': {
      const name = message.params?.['name'];
      const args = (message.params?.['arguments'] ?? {}) as Record<string, unknown>;
      const command = COMMANDS.find((c) => toolName(c) === name);
      if (command === undefined) return error(message.id, -32602, `Unknown tool "${String(name)}".`);
      if (typeof args !== 'object' || args === null || Array.isArray(args)) return error(message.id, -32602, 'Tool arguments must be an object.');
      const problem = checkArguments(command, args);
      let result: CommandResult;
      if (problem !== null) result = { ok: false, code: 1, message: problem };
      else {
        try {
          result = await command.run(args, makeCtx());
        } catch (caught) {
          result = { ok: false, code: caught instanceof SetupError ? 3 : 1, message: caught instanceof Error ? caught.message : 'The tool failed.' };
        }
      }
      const { payload } = toPayload(result);
      return reply(message.id, { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: !result.ok });
    }
    default:
      if (method.startsWith('notifications/') || isNotification) return null;
      return error(message.id, -32601, `Method not found: ${method}`);
  }
}
