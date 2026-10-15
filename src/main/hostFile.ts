import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseDocument, isMap } from 'yaml';
import type { ArchipelagoFinding } from '../shared/api';
import type { HostFileContents, HostFileId, HostFileInfo, HostWriteResult } from '../shared/host';
import { FileError, saveTextSafely } from './files';

export const MAX_HOST_BYTES = 1024 * 1024;

/** The host.yaml files this machine has. Paths come only from what was detected, never from the window. */
export function hostCandidates(finding: ArchipelagoFinding, exists: (path: string) => boolean = existsSync): HostFileInfo[] {
  const out: HostFileInfo[] = [];
  if (finding.installRoot !== null) {
    const path = join(finding.installRoot, 'host.yaml');
    out.push({ id: 'installed', label: 'Installed Archipelago', path, exists: exists(path) });
  }
  if (finding.sourceRoot !== null) {
    const path = join(finding.sourceRoot, 'host.yaml');
    out.push({ id: 'source', label: 'Archipelago source folder', path, exists: exists(path) });
  }
  return out;
}

function pathFor(finding: ArchipelagoFinding, id: HostFileId): HostFileInfo {
  const found = hostCandidates(finding).find((candidate) => candidate.id === id);
  if (found === undefined) throw new FileError('That host.yaml could not be found on this computer.');
  return found;
}

/** Turns a low-level file error into one plain sentence. */
export function hostErrorMessage(error: unknown, path: string): string {
  if (error instanceof FileError) return error.message;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EACCES' || code === 'EPERM') {
    return `Windows did not allow changing ${path}. If Archipelago is installed in a protected folder, close this app and open it as administrator, or make the change in a text editor.`;
  }
  if (code === 'EBUSY') return `${path} is in use by another program. Close Archipelago and try again.`;
  if (code === 'ENOENT') return `${path} is not there any more.`;
  return `Could not use ${path}: ${error instanceof Error ? error.message : String(error)}`;
}

export async function readHostFile(finding: ArchipelagoFinding, id: HostFileId): Promise<HostFileContents> {
  const info = pathFor(finding, id);
  try {
    const details = await stat(info.path);
    if (!details.isFile()) throw new FileError('That is not a file.');
    if (details.size > MAX_HOST_BYTES) throw new FileError('That host.yaml is too large to be a real one.');
    return { id, path: info.path, text: (await readFile(info.path)).toString('utf8').replace(/^﻿/, '') };
  } catch (error) {
    throw new FileError(hostErrorMessage(error, info.path));
  }
}

/**
 * Writes a changed host.yaml. Refuses when the file was changed by something else since it was
 * read, when the new text is too big or no longer a list of settings, and always makes a backup first.
 */
export async function writeHostFile(finding: ArchipelagoFinding, id: HostFileId, text: string, expected: string, backupDir: string): Promise<HostWriteResult> {
  const info = pathFor(finding, id);
  if (Buffer.byteLength(text, 'utf8') > MAX_HOST_BYTES) throw new FileError('That host.yaml is too large to be a real one.');
  const parsed = parseDocument(text, { version: '1.1' });
  if (parsed.errors.length > 0 || !isMap(parsed.contents)) throw new FileError('The changed host.yaml could not be read back, so nothing was written.');
  try {
    const raw = (await readFile(info.path)).toString('utf8');
    const hadBom = raw.startsWith('﻿');
    if (raw.replace(/^﻿/, '') !== expected) throw new FileError('host.yaml was changed by something else since you opened it. Reload it, then make your change again.');
    // A byte-order mark was hidden from the window when the file was read; it goes back so the save changes only what was shown.
    return await saveTextSafely(info.path, hadBom ? `﻿${text}` : text, backupDir);
  } catch (error) {
    throw new FileError(hostErrorMessage(error, info.path));
  }
}

/** The most paths one check looks at, and the longest each may be. */
export const MAX_CHECKED_PATHS = 200;
const MAX_CHECKED_LENGTH = 1024;

/**
 * For each path from a host.yaml, whether something is there. Relative paths are read from the folder that holds
 * the host.yaml, which is where Archipelago runs from. Nothing is opened or listed, only asked about, and a value that
 * cannot be a path (empty, too long, not text) counts as "there" so it is never flagged.
 */
export function pathsPresent(values: readonly unknown[], hostFolder: string, exists: (path: string) => boolean = existsSync): boolean[] {
  return values.slice(0, MAX_CHECKED_PATHS).map((value) => {
    if (typeof value !== 'string') return true;
    const text = value.trim();
    if (text === '' || text.length > MAX_CHECKED_LENGTH || text.includes('\u0000')) return true;
    try {
      return exists(isAbsolute(text) ? text : resolve(hostFolder, text));
    } catch {
      return true;
    }
  });
}

/** Which of these paths exist, for the host.yaml with this id. The window never names any file but the values it already shows. */
export function checkHostPaths(finding: ArchipelagoFinding, id: HostFileId, values: readonly unknown[], exists?: (path: string) => boolean): boolean[] {
  const info = pathFor(finding, id);
  return pathsPresent(values, dirname(info.path), exists);
}

