import type { Edit } from '../model/edits';

export type Severity = 'error' | 'warning';

/** One click that makes a problem go away. Applied as a single undo step. */
export interface Fix {
  label: string;
  edits: Edit[];
  /** Throws something the person wrote away. These are offered one at a time and never included in "apply all". */
  destructive?: boolean;
}

/** The fix "apply all" uses for an issue: the first one that does not throw anything away. */
export function bestFix(issue: Issue): Fix | undefined {
  return issue.fixes.find((fix) => fix.destructive !== true);
}

export interface Issue {
  /** Stable for the same problem, so lists do not jump around. */
  id: string;
  severity: Severity;
  /** What kind of problem, for tests and for the helper. */
  code: string;
  game: string | null;
  option: string | null;
  /** A plain sentence: what is wrong and what Archipelago will do about it. */
  message: string;
  fixes: Fix[];
  /** rules: found by reading the YAML. engine: the world itself refused these settings. */
  source: 'rules' | 'engine';
}
