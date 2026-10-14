import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

export const MAX_YAML_BYTES = 2 * 1024 * 1024;

/** A problem with a file that is safe to show to the user as-is. */
export class FileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileError';
  }
}

export async function readYamlFile(path: string): Promise<string> {
  const extension = extname(path).toLowerCase();
  if (extension !== '.yaml' && extension !== '.yml') {
    throw new FileError('Only .yaml and .yml files can be opened.');
  }
  const info = await stat(path);
  if (!info.isFile()) throw new FileError('That is not a file.');
  if (info.size > MAX_YAML_BYTES) throw new FileError('That file is too large to be a player YAML.');
  return (await readFile(path)).toString('utf8').replace(/^\uFEFF/, '');
}

async function copyToUniqueBackup(path: string, backupDir: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const target = join(backupDir, `${basename(path)}.${stamp}${suffix}.bak`);
    try {
      await copyFile(path, target, constants.COPYFILE_EXCL);
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new FileError('Could not choose a name for the backup file.');
}

/**
 * Saves without ever leaving a half-written file: the previous contents are copied to a backup
 * first, then the new text is written to a temporary file and moved into place.
 */
export async function saveTextSafely(
  path: string,
  text: string,
  backupDir: string,
): Promise<{ backupPath: string | null }> {
  let backupPath: string | null = null;
  // Only "not found" means there is nothing to back up; any other problem (permissions, a locked
  // file) must stop the save rather than overwrite a file that could not even be examined.
  const existing = await stat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing?.isFile()) {
    await mkdir(backupDir, { recursive: true });
    backupPath = await copyToUniqueBackup(path, backupDir);
  }
  const temp = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temp, text, 'utf8');
    if ((await readFile(temp, 'utf8')) !== text) {
      throw new FileError('The file could not be verified after writing, so the original was left untouched.');
    }
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
  return { backupPath };
}
