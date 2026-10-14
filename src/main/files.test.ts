// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileError, MAX_YAML_BYTES, readYamlFile, saveTextSafely } from './files';

// Lets a test make the disk misbehave on purpose: a temp file that comes out wrong, or a file that cannot be examined.
const faults = vi.hoisted(() => ({ corruptTempWrites: false, statErrorCode: null as string | null }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    stat: (async (...args: Parameters<typeof actual.stat>) => {
      if (faults.statErrorCode !== null && String(args[0]).endsWith('locked.yaml')) {
        throw Object.assign(new Error('simulated'), { code: faults.statErrorCode });
      }
      return actual.stat(...args);
    }) as typeof actual.stat,
    writeFile: (async (...args: Parameters<typeof actual.writeFile>) => {
      const [path, data, options] = args;
      if (faults.corruptTempWrites && typeof path === 'string' && path.includes('.tmp-')) {
        return actual.writeFile(path, `${String(data)}-corrupted`, options);
      }
      return actual.writeFile(...args);
    }) as typeof actual.writeFile,
  };
});

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'yamled-'));
});

afterEach(async () => {
  faults.corruptTempWrites = false;
  faults.statErrorCode = null;
  await rm(dir, { recursive: true, force: true });
});

describe('readYamlFile', () => {
  it('reads a .yaml file and strips a byte order mark', async () => {
    const file = join(dir, 'a.yaml');
    await writeFile(file, '\uFEFFname: P\n', 'utf8');
    expect(await readYamlFile(file)).toBe('name: P\n');
  });

  it('accepts .yml in any case and refuses other extensions', async () => {
    await writeFile(join(dir, 'a.YML'), 'x: 1\n');
    await writeFile(join(dir, 'a.txt'), 'x: 1\n');
    expect(await readYamlFile(join(dir, 'a.YML'))).toBe('x: 1\n');
    await expect(readYamlFile(join(dir, 'a.txt'))).rejects.toThrow(FileError);
  });

  it('refuses a folder and a file that is too large', async () => {
    await mkdir(join(dir, 'folder.yaml'));
    await expect(readYamlFile(join(dir, 'folder.yaml'))).rejects.toThrow(FileError);
    await writeFile(join(dir, 'big.yaml'), 'a'.repeat(MAX_YAML_BYTES + 1));
    await expect(readYamlFile(join(dir, 'big.yaml'))).rejects.toThrow('too large');
  });
});

describe('saveTextSafely', () => {
  it('creates a new file with no backup', async () => {
    const file = join(dir, 'new.yaml');
    const result = await saveTextSafely(file, 'name: P\n', join(dir, 'backups'));
    expect(result.backupPath).toBeNull();
    expect(await readFile(file, 'utf8')).toBe('name: P\n');
    expect(await readdir(dir)).toEqual(['new.yaml']);
  });

  it('backs up the old contents before replacing, and leaves no temp file', async () => {
    const file = join(dir, 'p.yaml');
    await writeFile(file, 'old\n');
    const result = await saveTextSafely(file, 'new\n', join(dir, 'backups'));
    expect(await readFile(file, 'utf8')).toBe('new\n');
    expect(result.backupPath).not.toBeNull();
    expect(await readFile(result.backupPath!, 'utf8')).toBe('old\n');
    expect((await readdir(dir)).sort()).toEqual(['backups', 'p.yaml']);
  });

  it('keeps every backup when saving twice quickly', async () => {
    const file = join(dir, 'p.yaml');
    await writeFile(file, 'v0\n');
    await saveTextSafely(file, 'v1\n', join(dir, 'backups'));
    await saveTextSafely(file, 'v2\n', join(dir, 'backups'));
    expect(await readdir(join(dir, 'backups'))).toHaveLength(2);
  });

  it('leaves the original untouched and cleans up when the write cannot finish', async () => {
    const target = join(dir, 'target.yaml');
    await mkdir(target); // renaming a file onto a folder fails
    await expect(saveTextSafely(target, 'x\n', join(dir, 'backups'))).rejects.toThrow();
    expect((await readdir(dir)).sort()).toEqual(['target.yaml']);
  });

  it('does not mistake "cannot examine the file" for "no file yet"', async () => {
    const file = join(dir, 'locked.yaml');
    await writeFile(file, 'precious\n');
    faults.statErrorCode = 'EPERM'; // only ENOENT (not found) may be treated as a new file
    await expect(saveTextSafely(file, 'new\n', join(dir, 'backups'))).rejects.toMatchObject({ code: 'EPERM' });
    faults.statErrorCode = null;
    expect(await readFile(file, 'utf8')).toBe('precious\n');
    expect(await readdir(dir)).toEqual(['locked.yaml']); // nothing written: no backup folder, no temp file
  });

  it('refuses to replace the file when what was written does not match, and keeps the original', async () => {
    const file = join(dir, 'p.yaml');
    await writeFile(file, 'old\n');
    faults.corruptTempWrites = true;
    await expect(saveTextSafely(file, 'new\n', join(dir, 'backups'))).rejects.toThrow('could not be verified');
    faults.corruptTempWrites = false;
    expect(await readFile(file, 'utf8')).toBe('old\n');
    expect((await readdir(dir)).sort()).toEqual(['backups', 'p.yaml']); // a backup was taken; no temp file is left
  });
});
