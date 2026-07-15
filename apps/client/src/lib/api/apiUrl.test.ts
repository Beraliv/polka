// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { apiUrl } from './apiUrl.ts';

vi.mock('../../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

describe('apiUrl', () => {
  it('builds the URL from the explicit server URL', () => {
    expect(apiUrl('/api/version', 'http://nas.local:3001')).toBe('http://nas.local:3001/api/version');
  });

  it('falls back to the store server URL when none is given', () => {
    expect(apiUrl('/api/version')).toBe('http://store-server.test/api/version');
  });
});
