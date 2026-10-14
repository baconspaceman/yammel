import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { FolderYaml } from '../shared/api';
import { FileError, MAX_YAML_BYTES, saveTextSafely } from './files';

/** Enough for a starter YAML for every custom game, or every player in a large multi-player file. Each file is still limited in size. */
export const MAX_FOLDER_FILES = 300;
export const MAX_FOLDER_TOTAL_BYTES = 32 * 1024 * 1024;

const MAX_NAME_LENGTH = 81;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.()'-]{0,76}\.ya?ml$/i;
const RESERVED_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function isSafeFileName(fileName: string): boolean {
  if (fileName.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(fileName)) return false;
  const base = fileName.replace(/\.ya?ml$/i, '');
  if (base.endsWith(' ') || base.endsWith('.')) return false;
  // Windows treats "con.txt.yaml" like "con", so only the part before the first dot is checked.
  if (RESERVED_NAME.test(base.split('.')[0] ?? '')) return false;
  return true;
}

/** Checks the list sent by the window. Returns fresh copies of just the two fields, or null if anything is off. */
export function parseFolderFiles(value: unknown): FolderYaml[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FOLDER_FILES) return null;
  const result: FolderYaml[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const record = item as Record<string, unknown>;
    const fileName = record['fileName'];
    const text = record['text'];
    if (typeof fileName !== 'string' || typeof text !== 'string') return null;
    if (!isSafeFileName(fileName)) return null;
    const size = Buffer.byteLength(text, 'utf8');
    total += size;
    if (size > MAX_YAML_BYTES || total > MAX_FOLDER_TOTAL_BYTES) return null;
    const key = fileName.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    result.push({ fileName, text });
  }
  return result;
}

/** Returns fileName if free, otherwise "name (2).ext", "name (3).ext", ... */
export function freeFileName(fileName: string, isTaken: (name: string) => boolean): string {
  if (!isTaken(fileName)) return fileName;
  const ext = extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  for (let n = 2; n < 1002; n += 1) {
    const candidate = `${base} (${n})${ext}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new FileError('Could not choose a name for a file.');
}

/**
 * Writes each file into the folder without overwriting anything. A name is skipped to the next free
 * "(n)" variant if it exists already or was already used earlier in this call (compared case-insensitively).
 */
export async function writeYamlFolder(folder: string, files: FolderYaml[], backupDir: string): Promise<string[]> {
  const isFolder = await stat(folder).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (!isFolder) throw new FileError('That is not a folder.');

  const taken = new Set((await readdir(folder)).map((name) => name.toLowerCase()));
  const isTaken = (name: string): boolean => taken.has(name.toLowerCase());

  const written: string[] = [];
  for (const file of files) {
    const name = freeFileName(file.fileName, isTaken);
    taken.add(name.toLowerCase());
    const path = join(folder, name);
    try {
      await saveTextSafely(path, file.text, backupDir);
    } catch (error) {
      if (written.length === 0) throw error;
      const reason = error instanceof FileError ? error.message : 'the file operation failed';
      throw new FileError(`Saved ${written.length} of ${files.length} files, then it stopped: ${reason}`);
    }
    written.push(path);
  }
  return written;
}
