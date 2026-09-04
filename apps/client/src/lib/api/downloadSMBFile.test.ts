// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadSMBFile } from './downloadSMBFile.ts';

vi.mock('../../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadSMBFile', () => {
  it('sends only the path, no NAS config, in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal('fetch', fetchMock);

    await downloadSMBFile('/books/war-and-peace.epub');

    expect(fetchMock).toHaveBeenCalledWith('http://store-server.test/api/smb/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/books/war-and-peace.epub' }),
    });
  });

  it('returns the file contents as an ArrayBuffer', async () => {
    const fileContents = new ArrayBuffer(8);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(fileContents),
      }),
    );

    await expect(downloadSMBFile('/books/war-and-peace.epub')).resolves.toBe(fileContents);
  });

  it('throws when the server responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(downloadSMBFile('/books/missing.epub')).rejects.toThrow(
      'Failed to download file from SMB',
    );
  });
});
