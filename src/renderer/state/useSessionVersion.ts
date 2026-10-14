import { useCallback, useSyncExternalStore } from 'react';
import type { EditorSession } from './session';

const noop = () => undefined;

/** Re-renders the calling component whenever the session changes. */
export function useSessionVersion(session: EditorSession | null): number {
  const subscribe = useCallback(
    (onChange: () => void) => (session === null ? noop : session.subscribe(onChange)),
    [session],
  );
  return useSyncExternalStore(subscribe, () => session?.version ?? 0);
}
