import { useSyncExternalStore } from 'react';

/**
 * Simple view (the default) shows one clear control per option. Advanced view also shows the chances of weighted values,
 * Roll now and Lock. It is a per-viewer convenience, so it is kept in localStorage; if that is unavailable the choice lasts
 * for this run only. Nothing in a YAML depends on it.
 */

const KEY = 'yammel.advanced';
const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let advanced = readStored();

export function isAdvancedView(): boolean {
  return advanced;
}

export function setAdvancedView(on: boolean): void {
  advanced = on;
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // no storage here: the choice still holds until the app is closed
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True in the Advanced view. Components that use it re-render when the view changes. */
export function useAdvancedView(): boolean {
  return useSyncExternalStore(subscribe, isAdvancedView, () => false);
}
