// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SMBConfig } from '@polka/shared';
import { listSMBFiles } from './listSMBFiles.ts';

vi.mock('../../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

const config: SMBConfig = {
  ip: '192.168.1.10',
  port: 445,
  username: 'reader',
  password: 'secret',
  share: 'books',
};

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

describe('listSMBFiles', () => {
  it('returns the parsed file entries', async () => {
    const entries = [
      { name: 'books', path: '/books', isDirectory: true },
      { name: 'war-and-peace.epub', path: '/books/war-and-peace.epub', isDirectory: false, size: 1024 },
    ];
    mockFetchResponse({ ok: true, body: entries });

    await expect(listSMBFiles(config)).resolves.toEqual(entries);
  });

  it('rejects when the response payload is not a list of file entries', async () => {
    mockFetchResponse({ ok: true, body: [{ name: 'broken-entry' }] });

    await expect(listSMBFiles(config)).rejects.toThrow();
  });
});
