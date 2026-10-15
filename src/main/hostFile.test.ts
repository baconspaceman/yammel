import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArchipelagoFinding } from '../shared/api';
import { checkHostPaths, hostCandidates, hostErrorMessage, listHostBackups, MAX_CHECKED_PATHS, pathsPresent, readHostBackup, readHostFile, writeHostFile } from './hostFile';

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'yamled-host-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const finding = (over: Partial<ArchipelagoFinding> = {}): ArchipelagoFinding => ({ sourceRoot: null, origin: null, python: null, installRoot: null, problem: null, ...over });

describe('hostCandidates', () => {
  it('lists only what was detected, with the full path', () => {
    expect(hostCandidates(finding())).toEqual([]);
    const both = hostCandidates(finding({ installRoot: 'C:/AP', sourceRoot: 'C:/src' }), () => true);
    expect(both.map((c) => c.id)).toEqual(['installed', 'source']);
    expect(both[0]!.path.replace(/\\/g, '/')).toBe('C:/AP/host.yaml');
  });

  it('says when the file is missing', () => {
    expect(hostCandidates(finding({ installRoot: 'C:/AP' }), () => false)[0]!.exists).toBe(false);
  });
});

describe('readHostFile / writeHostFile', () => {
  const setup = (text = 'general_options:\r\n  output_path: "output"\r\n') => {
    const root = temp();
    writeFileSync(join(root, 'host.yaml'), text, 'utf8');
    return { root, f: finding({ installRoot: root }), backups: join(temp(), 'backups') };
  };

  it('reads the file, dropping a byte-order mark', async () => {
    const { f } = setup('\uFEFFa:\n  b: 1\n');
    expect((await readHostFile(f, 'installed')).text).toBe('a:\n  b: 1\n');
  });

  it('refuses an id that is not on this machine', async () => {
    await expect(readHostFile(finding(), 'installed')).rejects.toThrow('could not be found');
  });

  it('writes with a backup of the old file', async () => {
    const { root, f, backups } = setup();
    const before = (await readHostFile(f, 'installed')).text;
    const result = await writeHostFile(f, 'installed', 'general_options:\r\n  output_path: "seeds"\r\n', before, backups);
    expect(readFileSync(join(root, 'host.yaml'), 'utf8')).toBe('general_options:\r\n  output_path: "seeds"\r\n');
    expect(result.backupPath).not.toBeNull();
    expect(readFileSync(result.backupPath!, 'utf8')).toBe(before);
    expect(readdirSync(root)).toEqual(['host.yaml']);
  });

  it('puts back a byte-order mark that was hidden when the file was read', async () => {
    const { root, f, backups } = setup('\uFEFFa:\n  b: 1\n');
    const before = (await readHostFile(f, 'installed')).text;
    await writeHostFile(f, 'installed', 'a:\n  b: 2\n', before, backups);
    expect(readFileSync(join(root, 'host.yaml'), 'utf8')).toBe('\uFEFFa:\n  b: 2\n');
  });

  it('refuses to overwrite a file changed by something else since it was read', async () => {
    const { root, f, backups } = setup();
    const before = (await readHostFile(f, 'installed')).text;
    writeFileSync(join(root, 'host.yaml'), 'general_options:\n  output_path: "other"\n', 'utf8');
    await expect(writeHostFile(f, 'installed', 'general_options:\n  output_path: "mine"\n', before, backups)).rejects.toThrow('changed by something else');
    expect(readFileSync(join(root, 'host.yaml'), 'utf8')).toContain('other');
  });

  it('refuses text that is not a list of settings or is far too big, and writes nothing', async () => {
    const { root, f, backups } = setup();
    const before = (await readHostFile(f, 'installed')).text;
    await expect(writeHostFile(f, 'installed', 'a: [unclosed\n', before, backups)).rejects.toThrow('could not be read back');
    await expect(writeHostFile(f, 'installed', '- just\n- a list\n', before, backups)).rejects.toThrow('could not be read back');
    await expect(writeHostFile(f, 'installed', `a: ${'x'.repeat(1024 * 1024 + 1)}\n`, before, backups)).rejects.toThrow('too large');
    expect(readFileSync(join(root, 'host.yaml'), 'utf8')).toBe(before);
  });
});

describe('hostErrorMessage', () => {
  it('turns system errors into plain sentences that name the file', () => {
    const denied = Object.assign(new Error('x'), { code: 'EACCES' });
    expect(hostErrorMessage(denied, 'C:/AP/host.yaml')).toContain('did not allow changing C:/AP/host.yaml');
    expect(hostErrorMessage(Object.assign(new Error('x'), { code: 'EBUSY' }), 'p')).toContain('in use');
    expect(hostErrorMessage(Object.assign(new Error('x'), { code: 'ENOENT' }), 'p')).toContain('not there');
  });
});

describe('pathsPresent / checkHostPaths', () => {
  it('reads relative paths from the folder that holds host.yaml and absolute ones as they are', () => {
    const asked: string[] = [];
    const seen = (path: string) => {
      asked.push(path.replace(/\\/g, '/'));
      return false;
    };
    expect(pathsPresent(['output', 'D:/roms/game.sfc'], 'C:/AP', seen)).toEqual([false, false]);
    expect(asked).toEqual(['C:/AP/output', 'D:/roms/game.sfc']);
  });

  it('reports each path on its own', () => {
    expect(pathsPresent(['a', 'b', 'c'], 'C:/AP', (path) => path.endsWith('b'))).toEqual([false, true, false]);
  });

  it('never flags a value that cannot be a path', () => {
    const never = () => false;
    expect(pathsPresent(['', '   ', null, 5, true, 'a'.repeat(2000), 'bad\u0000path'], 'C:/AP', never)).toEqual([true, true, true, true, true, true, true]);
  });

  it('treats a failing check as "there", so a warning is never invented', () => {
    expect(
      pathsPresent(['x'], 'C:/AP', () => {
        throw new Error('denied');
      }),
    ).toEqual([true]);
  });

  it('looks at no more than the limit', () => {
    expect(pathsPresent(Array.from({ length: 500 }, () => 'x'), 'C:/AP', () => true)).toHaveLength(MAX_CHECKED_PATHS);
  });

  it('uses the folder of the host.yaml with that id', () => {
    const asked: string[] = [];
    const exists = (path: string) => {
      asked.push(path.replace(/\\/g, '/'));
      return true;
    };
    checkHostPaths(finding({ installRoot: 'C:/AP', sourceRoot: 'C:/src' }), 'source', ['output'], exists);
    expect(asked).toEqual(['C:/src/output']);
  });

  it('checks real files and folders', () => {
    const dir = temp();
    mkdirSync(join(dir, 'Players'));
    expect(pathsPresent(['Players', 'weights.yaml', join(dir, 'Players')], dir)).toEqual([true, false, true]);
  });
});

describe('host.yaml backups', () => {
  const write = (dir: string, name: string, text: string, ageMs = 0) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    const when = new Date(Date.now() - ageMs);
    utimesSync(path, when, when);
  };

  it('lists only host.yaml backups, newest first, and reads one by its listed name', async () => {
    const dir = temp();
    write(dir, 'host.yaml.2026-10-14T10-00-00-000Z.bak', 'old: 1\n', 60_000);
    write(dir, 'host.yaml.2026-10-14T11-00-00-000Z.bak', 'new: 2\n', 1_000);
    write(dir, 'host.yaml.2026-10-14T11-00-00-000Z-1.bak', 'same second: 3\n', 2_000);
    write(dir, 'player.yaml.2026-10-14T11-00-00-000Z.bak', 'not a host file\n');
    write(dir, 'host.yaml', 'the real file\n');
    write(dir, 'host.yaml.tmp-123', 'half written\n');
    const list = await listHostBackups(dir);
    expect(list.map((b) => b.name)).toEqual(['host.yaml.2026-10-14T11-00-00-000Z.bak', 'host.yaml.2026-10-14T11-00-00-000Z-1.bak', 'host.yaml.2026-10-14T10-00-00-000Z.bak']);
    expect(list[0]!.bytes).toBe(7);
    expect(await readHostBackup(dir, list[0]!.name)).toBe('new: 2\n');
  });

  it('is empty for a folder that is not there', async () => {
    expect(await listHostBackups(join(temp(), 'missing'))).toEqual([]);
  });

  it('refuses a name that is not listed, so no other file can be read', async () => {
    const dir = temp();
    write(dir, 'secret.txt', 'private');
    for (const name of ['secret.txt', '../secret.txt', 'host.yaml.2026-10-14T11-00-00-000Z.bak', 5, null, undefined]) {
      await expect(readHostBackup(dir, name)).rejects.toThrow(/not there any more/);
    }
  });

  it('finds the backup that a real save makes', async () => {
    const dir = temp();
    const backups = join(dir, 'backups');
    const root = join(dir, 'AP');
    mkdirSync(root);
    writeFileSync(join(root, 'host.yaml'), 'generator:\n  race: 0\n');
    const result = await writeHostFile(finding({ installRoot: root }), 'installed', 'generator:\n  race: 1\n', 'generator:\n  race: 0\n', backups);
    expect(result.backupPath).not.toBeNull();
    const [only] = await listHostBackups(backups);
    expect(only).toBeDefined();
    expect(await readHostBackup(backups, only!.name)).toBe('generator:\n  race: 0\n');
  });
});
