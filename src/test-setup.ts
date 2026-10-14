import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Component tests run in jsdom (set per file); remove what each test rendered.
afterEach(() => {
  cleanup();
});
