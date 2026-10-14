import { OPTION_KINDS, type SchemaFile } from './types';

export class SchemaError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'SchemaError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function need(condition: boolean, message: string, path: string): asserts condition {
  if (!condition) throw new SchemaError(message, path);
}

function checkKindFields(option: Record<string, unknown>, path: string): void {
  const kind = option.kind;
  if (kind === 'choice' || kind === 'text_choice') {
    need(Array.isArray(option.choices), 'expected an array', `${path}.choices`);
    for (const [index, choice] of (option.choices as unknown[]).entries()) {
      const choicePath = `${path}.choices[${index}]`;
      need(isRecord(choice), 'expected an object', choicePath);
      need(typeof choice.key === 'string', 'expected a string', `${choicePath}.key`);
      need(typeof choice.label === 'string', 'expected a string', `${choicePath}.label`);
    }
    need(isRecord(option.aliases), 'expected an object', `${path}.aliases`);
  }
  if (kind === 'range' || kind === 'named_range') {
    need(typeof option.min === 'number', 'expected a number', `${path}.min`);
    need(typeof option.max === 'number', 'expected a number', `${path}.max`);
    need(option.min <= option.max, 'min must not be above max', `${path}.min`);
  }
  if (kind === 'named_range') {
    need(isRecord(option.specialNames), 'expected an object', `${path}.specialNames`);
    for (const [name, value] of Object.entries(option.specialNames)) {
      need(typeof value === 'number', 'expected a number', `${path}.specialNames["${name}"]`);
    }
  }
}

/** Parse and structurally check schema.json text. Throws SchemaError with the failing path. */
export function parseSchemaFile(text: string): SchemaFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new SchemaError(`not valid JSON (${(error as Error).message})`, '$');
  }
  need(isRecord(raw), 'expected an object', '$');
  need(typeof raw.apVersion === 'string', 'expected a string', '$.apVersion');
  need(typeof raw.extractedAt === 'string', 'expected a string', '$.extractedAt');
  need(Array.isArray(raw.errors), 'expected an array', '$.errors');
  for (const [index, entry] of (raw.errors as unknown[]).entries()) {
    const errorPath = `$.errors[${index}]`;
    need(isRecord(entry), 'expected an object', errorPath);
    need(typeof entry.game === 'string', 'expected a string', `${errorPath}.game`);
    need(typeof entry.error === 'string', 'expected a string', `${errorPath}.error`);
  }
  need(isRecord(raw.games), 'expected an object', '$.games');

  for (const [gameName, game] of Object.entries(raw.games)) {
    const gamePath = `$.games["${gameName}"]`;
    need(isRecord(game), 'expected an object', gamePath);
    need(game.name === gameName, `name must equal its key "${gameName}"`, `${gamePath}.name`);
    need(isRecord(game.options), 'expected an object', `${gamePath}.options`);
    need(Array.isArray(game.groups), 'expected an array', `${gamePath}.groups`);
    need(isRecord(game.presets), 'expected an object', `${gamePath}.presets`);
    need(typeof game.hidden === 'boolean', 'expected a boolean', `${gamePath}.hidden`);
    for (const field of ['items', 'locations', 'itemGroups', 'locationGroups']) {
      const list = game[field];
      need(Array.isArray(list), 'expected an array', `${gamePath}.${field}`);
      for (const [index, name] of (list as unknown[]).entries()) {
        need(typeof name === 'string', 'expected a string', `${gamePath}.${field}[${index}]`);
      }
    }
    for (const [key, option] of Object.entries(game.options)) {
      const optionPath = `${gamePath}.options["${key}"]`;
      need(isRecord(option), 'expected an object', optionPath);
      need(option.key === key, `key must equal its map key "${key}"`, `${optionPath}.key`);
      need(
        (OPTION_KINDS as readonly unknown[]).includes(option.kind),
        `unknown kind ${JSON.stringify(option.kind)}`,
        `${optionPath}.kind`,
      );
      need(typeof option.displayName === 'string', 'expected a string', `${optionPath}.displayName`);
      need(typeof option.description === 'string', 'expected a string', `${optionPath}.description`);
      need(Array.isArray(option.visibility), 'expected an array', `${optionPath}.visibility`);
      need(typeof option.supportsWeighting === 'boolean', 'expected a boolean', `${optionPath}.supportsWeighting`);
      checkKindFields(option, optionPath);
    }
    for (const [index, group] of (game.groups as unknown[]).entries()) {
      const groupPath = `${gamePath}.groups[${index}]`;
      need(isRecord(group), 'expected an object', groupPath);
      need(Array.isArray(group.options), 'expected an array', `${groupPath}.options`);
      for (const optionKey of group.options as unknown[]) {
        need(
          typeof optionKey === 'string' && optionKey in game.options,
          `lists unknown option ${JSON.stringify(optionKey)}`,
          `${groupPath}.options`,
        );
      }
    }
  }
  return raw as unknown as SchemaFile;
}
