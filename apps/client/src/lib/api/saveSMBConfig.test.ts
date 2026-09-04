// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveSMBConfig } from './saveSMBConfig.ts';

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

const config = {
  ip: '192.168.1.10',
  port: 445,
  username: 'reader',
  password: 'secret',
  share: 'books',
};
const summary = {
  ip: config.ip,
  port: config.port,
  username: config.username,
  share: config.share,
};

describe('saveSMBConfig', () => {
  it('POSTs the config and returns the summary', async () => {
    const fetchMock = mockFetchResponse({ ok: true, body: summary });

    await expect(saveSMBConfig({ config })).resolves.toEqual(summary);

    expect(fetchMock).toHaveBeenCalledWith('http://store-server.test/api/smb/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  });

  it('throws the server error message when saving fails', async () => {
    mockFetchResponse({ ok: false, body: { error: 'password required' } });

    await expect(saveSMBConfig({ config: {} })).rejects.toThrow('password required');
  });
});
