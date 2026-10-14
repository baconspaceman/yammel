import { parseCommandArgs } from './args';
import { COMMANDS, findCommand } from './commands';
import { SetupError, type CommandDef, type CommandResult, type Ctx } from './types';

export const EXIT_CODES = {
  '0': 'success',
  '1': 'the request was wrong: unknown game or option, bad value, missing file',
  '2': 'a YAML was refused by its world (a check failed or an option was unusable); the result still lists everything',
  '3': 'the check engine or the Archipelago source folder cannot be used on this machine',
} as const;

/** What a result looks like on the wire, for the command line and for MCP alike: one flat JSON object. */
export function toPayload(result: CommandResult): { payload: Record<string, unknown>; exitCode: number } {
  if (result.ok) {
    const exitCode = result.exitCode ?? 0;
    // a success that still needs attention says so in the JSON, not only in the process exit code
    return { payload: { ok: true, ...result.data, ...(exitCode === 0 ? {} : { exitCode }) }, exitCode };
  }
  return { payload: { ok: false, error: result.message, exitCode: result.code, ...(result.data ?? {}) }, exitCode: result.code };
}

function describe(command: CommandDef): Record<string, unknown> {
  return {
    name: command.name,
    summary: command.summary,
    ...(command.positional ? { argument: { name: command.positional.name, description: command.positional.description, required: command.positional.required } } : {}),
    flags: command.flags.map((f) => ({ name: `--${f.name}`, type: f.type, description: f.description })),
  };
}

export function helpPayload(): Record<string, unknown> {
  return {
    ok: true,
    usage: 'apyaml <command> [argument] [--flag value ...]   (add --pretty for indented JSON; "apyaml mcp" starts the MCP server)',
    note: 'Every command prints one JSON object on stdout. Seeds make randomness repeatable: the same --seed gives the same YAML.',
    exitCodes: EXIT_CODES,
    commands: COMMANDS.map(describe),
  };
}

/** One line of JSON. U+2028 and U+2029 are escaped: they are legal inside JSON strings but many readers treat them as line breaks. */
export function jsonLine(value: unknown, indent?: number): string {
  return `${JSON.stringify(value, null, indent).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}\n`;
}

export interface RunIo {
  out(text: string): void;
}

/** Runs one command line. Returns the process exit code. `ctx` is only needed by commands, so help works without a schema. */
export async function runCli(argv: readonly string[], makeCtx: () => Ctx, io: RunIo): Promise<number> {
  const words = [...argv];
  const prettyAt = words.indexOf('--pretty');
  const pretty = prettyAt !== -1;
  if (pretty) words.splice(prettyAt, 1);
  const print = (payload: Record<string, unknown>) => io.out(jsonLine(payload, pretty ? 2 : undefined));

  const [name, ...rest] = words;
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    print(helpPayload());
    return 0;
  }
  const command = findCommand(name);
  if (command === undefined) {
    print({ ok: false, error: `Unknown command "${name}". Commands: ${COMMANDS.map((c) => c.name).join(', ')}.`, exitCode: 1 });
    return 1;
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    print({ ok: true, ...describe(command) });
    return 0;
  }
  const parsed = parseCommandArgs(command, rest);
  if (!parsed.ok) {
    print({ ok: false, error: parsed.message, exitCode: 1 });
    return 1;
  }
  let ctx: Ctx;
  try {
    ctx = makeCtx();
  } catch (error) {
    const code = error instanceof SetupError ? 3 : 1;
    print({ ok: false, error: error instanceof Error ? error.message : 'Could not load the game schema.', exitCode: code });
    return code;
  }
  let result: CommandResult;
  try {
    result = await command.run(parsed.input, ctx);
  } catch (error) {
    result = { ok: false, code: error instanceof SetupError ? 3 : 1, message: error instanceof Error ? error.message : 'The command failed.' };
  }
  const { payload, exitCode } = toPayload(result);
  print(payload);
  return exitCode;
}
