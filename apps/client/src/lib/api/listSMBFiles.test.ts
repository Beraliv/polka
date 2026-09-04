// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { listSMBFiles } from './listSMBFiles.ts';

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

describe('listSMBFiles', () => {
  it('sends only the path, no NAS config, in the request body', async () => {
    const fetchMock = mockFetchResponse({ ok: true, body: [] });

    await listSMBFiles('/books');

    expect(fetchMock).toHaveBeenCalledWith('http://store-server.test/api/smb/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/books' }),
    });
  });

  it('returns the parsed file entries', async () => {
    const entries = [
      { name: 'books', path: '/books', isDirectory: true },
      {
        name: 'war-and-peace.epub',
        path: '/books/war-and-peace.epub',
        isDirectory: false,
        size: 1024,
      },
    ];
    mockFetchResponse({ ok: true, body: entries });

    await expect(listSMBFiles()).resolves.toEqual(entries);
  });

  it('rejects when the response payload is not a list of file entries', async () => {
    mockFetchResponse({ ok: true, body: [{ name: 'broken-entry' }] });

    await expect(listSMBFiles()).rejects.toThrow();
  });
});
