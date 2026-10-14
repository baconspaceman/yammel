import type { Edit } from '../model/edits';

/** A change the helper suggests. Nothing is applied until the person clicks Apply, and one proposal is one undo step. */
export interface Proposal {
  id: string;
  /** Short, in words a person would use: "Turn on Death Link". */
  title: string;
  /** What changes, or why. */
  detail?: string;
  edits: Edit[];
}

/** Where in the editor to look: the helper can point at an option instead of changing it. */
export interface Pointer {
  game: string;
  option: string;
  label: string;
}

/** What a helper answers. The same shape comes from the offline guide and from every AI provider. */
export interface Reply {
  text: string;
  proposals: Proposal[];
  pointers: Pointer[];
  /** Short things the person could say next. */
  followUps: string[];
  /** Who answered: "guide" for the built-in one, or a provider id. */
  source: string;
}

export const EMPTY_REPLY: Omit<Reply, 'text' | 'source'> = { proposals: [], pointers: [], followUps: [] };

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}
