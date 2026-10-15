/** Which host.yaml: the one next to an installed Archipelago, or the one in a source folder. */
export type HostFileId = 'installed' | 'source';

export interface HostFileInfo {
  id: HostFileId;
  /** "Installed Archipelago" or "Archipelago source folder". */
  label: string;
  /** The full path, shown to the person. */
  path: string;
  exists: boolean;
}

export interface HostFileContents {
  id: HostFileId;
  path: string;
  text: string;
}

export interface HostWriteRequest {
  id: HostFileId;
  /** The new full text. */
  text: string;
  /** The text the window loaded; the save is refused if the file is different now. */
  expected: string;
}

export interface HostWriteResult {
  backupPath: string | null;
}

/** An earlier host.yaml that was kept as a backup when a change was saved. */
export interface HostBackup {
  /** The backup file's name, as listed. The window can only ask for a name that is in the list. */
  name: string;
  /** When it was kept (ISO). */
  at: string;
  bytes: number;
}
