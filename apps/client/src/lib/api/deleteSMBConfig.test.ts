// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteSMBConfig } from './deleteSMBConfig.ts';

vi.mock('../../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deleteSMBConfig', () => {
  it('sends a DELETE request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await deleteSMBConfig();

    expect(fetchMock).toHaveBeenCalledWith('http://store-server.test/api/smb/config', {
      method: 'DELETE',
    });
  });

  it('throws the server error message when deletion fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'boom' }) }),
    );

    await expect(deleteSMBConfig()).rejects.toThrow('boom');
  });
});
