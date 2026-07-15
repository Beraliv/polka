// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchServerVersion } from './fetchServerVersion.ts';

vi.mock('../../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

function mockFetchResponse(response: { ok: boolean; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    json: () => Promise.resolve(response.body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchServerVersion', () => {
  it('returns the server version', async () => {
    mockFetchResponse({ ok: true, body: { version: '0.4.2' } });

    await expect(fetchServerVersion()).resolves.toBe('0.4.2');
  });

  it('returns null when the response payload has no version', async () => {
    mockFetchResponse({ ok: true, body: { unexpected: true } });

    await expect(fetchServerVersion()).resolves.toBeNull();
  });
});
