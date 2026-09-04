// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SMBConfigSummary } from '@polka/shared';

const fetchSMBConfigMock = vi.fn();
const saveSMBConfigMock = vi.fn();
const deleteSMBConfigMock = vi.fn();

vi.mock('../lib/api', () => ({
  fetchSMBConfig: (...args: unknown[]) => fetchSMBConfigMock(...args),
  saveSMBConfig: (...args: unknown[]) => saveSMBConfigMock(...args),
  deleteSMBConfig: (...args: unknown[]) => deleteSMBConfigMock(...args),
}));

const summary: SMBConfigSummary = {
  ip: '192.168.1.10',
  port: 445,
  username: 'reader',
  share: 'books',
};

let setItemSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  fetchSMBConfigMock.mockReset();
  saveSMBConfigMock.mockReset();
  deleteSMBConfigMock.mockReset();
  setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function calledWithSmbKey(spy: ReturnType<typeof vi.spyOn>): boolean {
  return spy.mock.calls.some(
    ([key]) => typeof key === 'string' && key.toLowerCase().includes('smb'),
  );
}

describe('BookStore SMB status', () => {
  it('loadSMBStatus fetches the config from the server and never touches localStorage', async () => {
    const { store, BookStore } = await import('./books.ts');
    fetchSMBConfigMock.mockResolvedValue(summary);

    await BookStore.loadSMBStatus();

    expect(store.smbStatus).toEqual(summary);
    expect(calledWithSmbKey(setItemSpy)).toBe(false);
  });

  it('saveSMBConfig sends the config to the server and stores only the returned summary', async () => {
    const { store, BookStore } = await import('./books.ts');
    saveSMBConfigMock.mockResolvedValue(summary);
    const config = {
      ip: summary.ip,
      username: summary.username,
      share: summary.share,
      password: 'secret',
    };

    await BookStore.saveSMBConfig(config);

    expect(saveSMBConfigMock).toHaveBeenCalledWith({ config });
    expect(store.smbStatus).toEqual(summary);
    expect(calledWithSmbKey(setItemSpy)).toBe(false);
  });

  it('deleteSMBConfig clears the server config and the local status without writing to localStorage', async () => {
    const { store, BookStore } = await import('./books.ts');
    fetchSMBConfigMock.mockResolvedValue(summary);
    deleteSMBConfigMock.mockResolvedValue(undefined);
    await BookStore.loadSMBStatus();
    expect(store.smbStatus).toEqual(summary);

    await BookStore.deleteSMBConfig();

    expect(deleteSMBConfigMock).toHaveBeenCalled();
    expect(store.smbStatus).toBeNull();
    expect(calledWithSmbKey(setItemSpy)).toBe(false);
  });
});

describe('legacy SMB localStorage cleanup', () => {
  it('purges the pre-fix polka:smb key on load', async () => {
    localStorage.setItem(
      'polka:smb',
      JSON.stringify({
        ip: '1.2.3.4',
        port: 445,
        username: 'x',
        password: 'secret',
        share: 'books',
      }),
    );

    await import('./books.ts');

    expect(localStorage.getItem('polka:smb')).toBeNull();
  });
});
