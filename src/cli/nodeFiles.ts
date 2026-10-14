import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import type { FilePort } from './types';

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * On Windows a few names (CON, PRN, AUX, NUL, COM1-9, LPT1-9, with or without an extension) are devices, not files: writing to
 * them either vanishes or creates a file that Explorer and cmd cannot delete. Every part of a path is checked.
 */
export function reservedNameProblem(path: string, platform: string = process.platform): string | null {
  if (platform !== 'win32') return null;
  for (const part of path.split(/[\\/]+/)) {
    if (RESERVED.test(part.split('.')[0] ?? '')) return `"${part}" is a reserved name on Windows and cannot be used as a file or folder name.`;
  }
  return null;
}

function checked(path: string): void {
  const problem = reservedNameProblem(path);
  if (problem !== null) throw new Error(problem);
}

/** The real file operations for the command line: new files are never overwritten unless asked, and a replace is all-or-nothing. */
export const nodeFiles: FilePort = {
  async readText(path) {
    checked(path);
    return (await readFile(path, 'utf8')).replace(/^﻿/, '');
  },
  async writeText(path, text, overwrite) {
    checked(path);
    if (!overwrite) {
      try {
        await writeFile(path, text, { encoding: 'utf8', flag: 'wx' });
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
        throw error;
      }
    }
    const temp = `${path}.tmp-${process.pid}`;
    try {
      await writeFile(temp, text, 'utf8');
      await rename(temp, path);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    return true;
  },
  async makeDir(path) {
    checked(path);
    await mkdir(path, { recursive: true });
  },
  async exists(path) {
    return stat(path).then(
      () => true,
      () => false,
    );
  },
};
