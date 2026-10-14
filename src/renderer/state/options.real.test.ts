import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchemaFile } from '../../schema/load';
import { describeOption } from './options';

const schemaUrl = new URL('../../../data/schema.json', import.meta.url);
const EDITABLE_KINDS = ['toggle', 'choice', 'text_choice', 'range', 'named_range', 'free_text'];

// Runs every Simple-mode option of every real game through describeOption, absent and at its own default.
describe.skipIf(!existsSync(schemaUrl))('describeOption against the real schema', () => {
  const schema = parseSchemaFile(readFileSync(schemaUrl, 'utf8'));

  it('shows every option at its default without warnings or false changes', () => {
    const failures: string[] = [];
    for (const game of Object.values(schema.games)) {
      for (const option of Object.values(game.options)) {
        if (!EDITABLE_KINDS.includes(option.kind) || !option.visibility.includes('simple_ui')) continue;
        const id = `${game.name}.${option.key}`;

        const absent = describeOption(option, undefined);
        if (!absent.editable) failures.push(`${id}: absent option is not editable`);
        if (absent.changed) failures.push(`${id}: absent option is marked changed`);
        if (absent.warning !== undefined) failures.push(`${id}: absent option warns: ${absent.warning}`);

        const asYaml = option.kind === 'free_text' || option.kind === 'text_choice' ? (option.default ?? '') : option.default;
        let held;
        try {
          held = describeOption(option, asYaml);
        } catch (error) {
          failures.push(`${id}: describeOption threw for default ${JSON.stringify(asYaml)}: ${String(error)}`);
          continue;
        }
        if (typeof asYaml === 'string' && asYaml.trim().toLowerCase() === 'random') continue;
        if (!held.editable) failures.push(`${id}: default ${JSON.stringify(asYaml)} is not editable (${held.note ?? 'no note'})`);
        if (held.warning !== undefined) failures.push(`${id}: default ${JSON.stringify(asYaml)} warns: ${held.warning}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
