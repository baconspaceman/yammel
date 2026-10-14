import type { YamlDocument } from '../../model/document';
import type { Edit } from '../../model/edits';

/**
 * One open YAML: the document, its undo/redo history, and where it is saved.
 * Views read from it and re-render when it notifies; they never keep their own copy of values.
 */
export class EditorSession {
  private current: YamlDocument;
  private past: YamlDocument[] = [];
  private future: YamlDocument[] = [];
  private savedText: string;
  private listeners = new Set<() => void>();
  private path: string | null;

  /** Changes on every change, so React can tell when to re-render. */
  version = 0;

  constructor(
    doc: YamlDocument,
    filePath: string | null = null,
    private readonly maxHistory = 200,
  ) {
    this.current = doc;
    this.path = filePath;
    this.savedText = doc.toString();
  }

  get doc(): YamlDocument {
    return this.current;
  }

  get text(): string {
    return this.current.toString();
  }

  get filePath(): string | null {
    return this.path;
  }

  get dirty(): boolean {
    return this.current.toString() !== this.savedText;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** All-or-nothing. Throws EditError (and changes nothing) if any edit is refused. */
  apply(edits: Edit[]): void {
    const next = this.current.clone();
    next.applyAll(edits);
    if (next.toString() === this.current.toString()) return;
    this.past.push(this.current);
    if (this.past.length > this.maxHistory) this.past.shift();
    this.future = [];
    this.current = next;
    this.changed();
  }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.current);
    this.current = previous;
    this.changed();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.current);
    this.current = next;
    this.changed();
  }

  /** `savedText` is exactly what was written, which may be older than the text now on screen. */
  markSaved(path: string, savedText: string): void {
    this.path = path;
    this.savedText = savedText;
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }
}
