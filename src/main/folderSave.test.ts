// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileError, MAX_YAML_BYTES } from './files';
import { MAX_FOLDER_FILES, freeFileName, parseFolderFiles, writeYamlFolder } from './folderSave';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'folder-save-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('parseFolderFiles', () => {
  it('accepts a normal list and returns copies with only the two fields', () => {
    const input = [
      { fileName: 'a.yaml', text: 'name: a\n', extra: 1 },
      { fileName: '01-a-link-to-the-past.yaml', text: 'name: b\n' },
    ];
    const parsed = parseFolderFiles(input);
    expect(parsed).toEqual([
      { fileName: 'a.yaml', text: 'name: a\n' },
      { fileName: '01-a-link-to-the-past.yaml', text: 'name: b\n' },
    ]);
    expect(parsed).not.toBe(input);
    expect(parsed?.[0]).not.toBe(input[0]);
  });

  it('accepts names with spaces, brackets and .yml', () => {
    expect(parseFolderFiles([{ fileName: 'Roulette1-A Link to the Past.yaml', text: '' }])).not.toBeNull();
    expect(parseFolderFiles([{ fileName: 'x (2).yml', text: '' }])).not.toBeNull();
  });

  it('rejects a non-array, an empty array and more than the maximum', () => {
    expect(parseFolderFiles('x')).toBeNull();
    expect(parseFolderFiles(null)).toBeNull();
    expect(parseFolderFiles({ fileName: 'a.yaml', text: '' })).toBeNull();
    expect(parseFolderFiles([])).toBeNull();
    const many = Array.from({ length: 181 }, (_, i) => ({ fileName: `game-${i}.yaml`, text: 'name: P' }));
    expect(parseFolderFiles(many)).toHaveLength(181); // a starter YAML for every custom game
    const huge = Array.from({ length: 20 }, (_, i) => ({ fileName: `big-${i}.yaml`, text: 'x'.repeat(1_900_000) }));
    expect(parseFolderFiles(huge)).toBeNull(); // far too much in total
    const tooMany = Array.from({ length: MAX_FOLDER_FILES + 1 }, (_, i) => ({ fileName: `f${i}.yaml`, text: '' }));
    expect(parseFolderFiles(tooMany)).toBeNull();
    const exactly = tooMany.slice(0, MAX_FOLDER_FILES);
    expect(parseFolderFiles(exactly)).not.toBeNull();
  });

  it('rejects non-object items and non-string fields', () => {
    expect(parseFolderFiles(['a.yaml'])).toBeNull();
    expect(parseFolderFiles([null])).toBeNull();
    expect(parseFolderFiles([{ fileName: 'a.yaml' }])).toBeNull();
    expect(parseFolderFiles([{ fileName: 1, text: '' }])).toBeNull();
    expect(parseFolderFiles([{ fileName: 'a.yaml', text: 5 }])).toBeNull();
  });

  it.each([
    '../x.yaml',
    'a/b.yaml',
    'a\\b.yaml',
    'C:x.yaml',
    'CON.yaml',
    'nul.yml',
    'con.txt.yaml',
    '.hidden.yaml',
    'x.txt',
    'x.yaml.exe',
    'x .yaml',
    'x..yaml',
    'LPT1.yaml',
  ])('rejects the bad name %s', (fileName) => {
    expect(parseFolderFiles([{ fileName, text: '' }])).toBeNull();
  });

  it('rejects an 82-character name and accepts an 81-character one', () => {
    const base81 = `${'a'.repeat(76)}.yaml`; // 81 total
    const base82 = `${'a'.repeat(77)}.yaml`; // 82 total
    expect(base81).toHaveLength(81);
    expect(parseFolderFiles([{ fileName: base81, text: '' }])).not.toBeNull();
    expect(parseFolderFiles([{ fileName: base82, text: '' }])).toBeNull();
  });

  it('rejects duplicate names that differ only in case', () => {
    expect(
      parseFolderFiles([
        { fileName: 'Alpha.yaml', text: '' },
        { fileName: 'alpha.yaml', text: '' },
      ]),
    ).toBeNull();
  });

  it('rejects text over MAX_YAML_BYTES and accepts text at the limit', () => {
    expect(parseFolderFiles([{ fileName: 'a.yaml', text: 'x'.repeat(MAX_YAML_BYTES + 1) }])).toBeNull();
    expect(parseFolderFiles([{ fileName: 'a.yaml', text: 'x'.repeat(MAX_YAML_BYTES) }])).not.toBeNull();
  });
});

describe('freeFileName', () => {
  it('returns the name unchanged when it is free', () => {
    expect(freeFileName('a.yaml', () => false)).toBe('a.yaml');
  });

  it('inserts " (2)", " (3)" before the extension while names are taken', () => {
    const taken = new Set(['a.yaml', 'a (2).yaml']);
    expect(freeFileName('a.yaml', (n) => taken.has(n))).toBe('a (3).yaml');
    expect(freeFileName('a.yaml', (n) => n === 'a.yaml')).toBe('a (2).yaml');
  });

  it('throws a FileError after 1000 attempts', () => {
    expect(() => freeFileName('a.yaml', () => true)).toThrow(FileError);
    expect(() => freeFileName('a.yaml', () => true)).toThrow('Could not choose a name for a file.');
  });
});

describe('writeYamlFolder', () => {
  it('writes every file with exact contents and returns the paths in order', async () => {
    const files = [
      { fileName: 'one.yaml', text: 'name: one\n' },
      { fileName: 'two.yml', text: 'name: two\r\n' },
    ];
    const written = await writeYamlFolder(dir, files, join(dir, 'backups'));
    expect(written).toEqual([join(dir, 'one.yaml'), join(dir, 'two.yml')]);
    expect(await readFile(join(dir, 'one.yaml'), 'utf8')).toBe('name: one\n');
    expect(await readFile(join(dir, 'two.yml'), 'utf8')).toBe('name: two\r\n');
  });

  it('keeps the first files untouched when run twice, and writes " (2)" copies', async () => {
    const backups = join(dir, 'backups');
    const sub = join(dir, 'out');
    await mkdir(sub);
    await writeYamlFolder(sub, [{ fileName: 'p.yaml', text: 'first\n' }], backups);
    const second = await writeYamlFolder(sub, [{ fileName: 'p.yaml', text: 'second\n' }], backups);
    expect(second).toEqual([join(sub, 'p (2).yaml')]);
    expect(await readFile(join(sub, 'p.yaml'), 'utf8')).toBe('first\n');
    expect(await readFile(join(sub, 'p (2).yaml'), 'utf8')).toBe('second\n');
  });

  it('does not let two files in one call that differ only in case collide', async () => {
    const sub = join(dir, 'case');
    await mkdir(sub);
    const written = await writeYamlFolder(
      sub,
      [
        { fileName: 'Alpha.yaml', text: 'A\n' },
        { fileName: 'alpha.yaml', text: 'B\n' },
      ],
      join(dir, 'backups'),
    );
    expect(written).toEqual([join(sub, 'Alpha.yaml'), join(sub, 'alpha (2).yaml')]);
    expect((await readdir(sub)).sort()).toEqual(['Alpha.yaml', 'alpha (2).yaml']);
  });

  it('throws "That is not a folder." and writes nothing when the folder is missing', async () => {
    const missing = join(dir, 'nope');
    await expect(writeYamlFolder(missing, [{ fileName: 'a.yaml', text: 'x' }], join(dir, 'b'))).rejects.toThrow(
      'That is not a folder.',
    );
    expect(await readdir(dir)).toEqual([]);
  });

  it('throws "That is not a folder." when the path is a file', async () => {
    const filePath = join(dir, 'plain.txt');
    await writeFile(filePath, 'hello');
    await expect(writeYamlFolder(filePath, [{ fileName: 'a.yaml', text: 'x' }], join(dir, 'b'))).rejects.toThrow(
      'That is not a folder.',
    );
    expect(await readFile(filePath, 'utf8')).toBe('hello');
  });
});
