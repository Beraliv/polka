// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSMBConfig } from './fetchSMBConfig.ts';

vi.mock('../../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

function mockFetchResponse(response: { ok: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: () => Promise.resolve(response.body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSMBConfig', () => {
  it('returns the parsed summary when configured', async () => {
    const summary = { ip: '192.168.1.10', port: 445, username: 'reader', share: 'books' };
    mockFetchResponse({ ok: true, body: summary });

    await expect(fetchSMBConfig()).resolves.toEqual(summary);
  });

  it('returns null when the server responds 404 (not configured)', async () => {
    mockFetchResponse({ ok: false, status: 404 });

    await expect(fetchSMBConfig()).resolves.toBeNull();
  });

  it('throws the server error message for other failures', async () => {
    mockFetchResponse({ ok: false, status: 500, body: { error: 'boom' } });

    await expect(fetchSMBConfig()).rejects.toThrow('boom');
  });
});
