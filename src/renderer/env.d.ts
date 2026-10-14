/// <reference types="vite/client" />

import type { EditorApi } from '../shared/api';

declare global {
  interface Window {
    /** Added by src/preload; the only door to the main process. */
    api: EditorApi;
  }
}

export {};
