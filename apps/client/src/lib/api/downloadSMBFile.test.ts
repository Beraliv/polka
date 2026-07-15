// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SMBConfig } from '@polka/shared';
import { downloadSMBFile } from './downloadSMBFile.ts';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadSMBFile', () => {
  it('returns the file contents as an ArrayBuffer', async () => {
    const fileContents = new ArrayBuffer(8);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fileContents),
    }));

    await expect(downloadSMBFile(config, '/books/war-and-peace.epub')).resolves.toBe(fileContents);
  });

  it('throws when the server responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(downloadSMBFile(config, '/books/missing.epub')).rejects.toThrow('Failed to download file from SMB');
  });
});
