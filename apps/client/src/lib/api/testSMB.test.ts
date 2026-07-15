// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SMBConfig } from '@polka/shared';
import { testSMB } from './testSMB.ts';

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

describe('testSMB', () => {
  it('resolves when the server accepts the connection', async () => {
    const fetchMock = mockFetchResponse({ ok: true });

    await expect(testSMB({ config, serverUrl: 'http://nas.local:3001' })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('http://nas.local:3001/api/smb/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  });

  it('throws the server error message when the connection fails', async () => {
    mockFetchResponse({ ok: false, body: { error: 'Access denied' } });

    await expect(testSMB({ config })).rejects.toThrow('Access denied');
  });
});
