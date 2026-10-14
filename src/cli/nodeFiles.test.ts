import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFiles, reservedNameProblem } from './nodeFiles';

const temp = () => mkdtempSync(join(tmpdir(), 'nodefiles-'));

describe('reservedNameProblem', () => {
  it('refuses Windows device names in any part of the path, with or without an extension', () => {
    for (const path of ['NUL', 'con.yaml', 'sub\\aux', 'C:\\x\\LPT1.txt', 'com9', 'PRN.', 'out/Nul/file.yaml', 'a\\COM1.tar.gz']) {
      expect(reservedNameProblem(path, 'win32'), path).toMatch(/is a reserved name on Windows/);
    }
  });

  it('lets ordinary names through, including ones that merely contain a device name', () => {
    for (const path of ['console.yaml', 'nul2', 'a\\b\\c.yaml', 'aux-1', 'my.con', 'C:\\Users\\x\\out', 'COM10', '']) {
      expect(reservedNameProblem(path, 'win32'), path).toBeNull();
    }
  });

  it('does not apply on other systems', () => {
    expect(reservedNameProblem('NUL', 'linux')).toBeNull();
    expect(reservedNameProblem('con.yaml', 'darwin')).toBeNull();
  });
});

describe('nodeFiles', () => {
  it('writes a new file, and refuses to replace an existing one unless told to', async () => {
    const dir = temp();
    const path = join(dir, 'a.yaml');
    expect(await nodeFiles.writeText(path, 'first', false)).toBe(true);
    expect(await nodeFiles.writeText(path, 'second', false)).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe('first');
    expect(await nodeFiles.writeText(path, 'third', true)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('third');
    expect(readdirSync(dir)).toEqual(['a.yaml']); // no temporary file left behind
  });

  it('leaves no temporary file behind when a replace fails', async () => {
    const dir = temp();
    const folder = join(dir, 'adir');
    mkdirSync(folder);
    await expect(nodeFiles.writeText(folder, 'text', true)).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(['adir']);
  });

  it('makes folders (several levels), says whether something exists, and strips a byte-order mark when reading', async () => {
    const dir = temp();
    const deep = join(dir, 'a', 'b', 'c');
    await nodeFiles.makeDir(deep);
    expect(await nodeFiles.exists(deep)).toBe(true);
    expect(await nodeFiles.exists(join(dir, 'nope'))).toBe(false);
    const file = join(deep, 'x.yaml');
    writeFileSync(file, '\uFEFFname: P\n', 'utf8');
    expect(await nodeFiles.readText(file)).toBe('name: P\n');
  });

  it('refuses a reserved Windows name before touching the disk (on Windows)', async () => {
    if (process.platform !== 'win32') return;
    const dir = temp();
    await expect(nodeFiles.writeText(join(dir, 'NUL'), 'x', true)).rejects.toThrow(/reserved name on Windows/);
    await expect(nodeFiles.writeText(join(dir, 'aux.yaml'), 'x', false)).rejects.toThrow(/reserved name on Windows/);
    await expect(nodeFiles.makeDir(join(dir, 'con'))).rejects.toThrow(/reserved name on Windows/);
  });
});
