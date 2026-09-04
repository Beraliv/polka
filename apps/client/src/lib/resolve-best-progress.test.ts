// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@polka/shared';

vi.mock('../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

function localProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    bookId: 'book-1',
    bookName: 'Local Copy',
    currentPage: 10,
    totalPages: 100,
    percent: 10,
    lastRead: 1,
    finished: false,
    ...overrides,
  };
}

async function setup(options: { local: Progress | null; remote: Progress | null | 'error' }) {
  vi.resetModules();
  vi.doMock('./polka-db.ts', () => ({
    ProgressDB: {
      download: vi.fn().mockResolvedValue(options.local ? [options.local] : []),
      upload: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  }));
  const fetchMock =
    options.remote === 'error'
      ? vi.fn().mockResolvedValue({ ok: false })
      : vi.fn().mockResolvedValue({
          ok: options.remote !== null,
          json: () => Promise.resolve(options.remote),
        });
  vi.stubGlobal('fetch', fetchMock);

  const mod = await import('./progress.ts');
  await mod.initProgress();
  return mod;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('./polka-db.ts');
});

describe('resolveBestProgress', () => {
  it('returns local when there is no remote progress', async () => {
    const local = localProgress();
    const { resolveBestProgress } = await setup({ local, remote: null });

    await expect(resolveBestProgress('book-1')).resolves.toEqual(local);
  });

  it('returns remote when there is no local progress', async () => {
    const remote = localProgress({ bookName: 'Remote Copy', currentPage: 50 });
    const { resolveBestProgress } = await setup({ local: null, remote });

    await expect(resolveBestProgress('book-1')).resolves.toEqual(remote);
  });

  it('returns null when neither local nor remote progress exists', async () => {
    const { resolveBestProgress } = await setup({ local: null, remote: null });

    await expect(resolveBestProgress('book-1')).resolves.toBeNull();
  });

  it('prefers remote when it is further along than local', async () => {
    const local = localProgress({ currentPage: 10, totalPages: 100 });
    const remote = localProgress({ bookName: 'Remote Copy', currentPage: 80, totalPages: 100 });
    const { resolveBestProgress } = await setup({ local, remote });

    await expect(resolveBestProgress('book-1')).resolves.toEqual(remote);
  });

  it('prefers local when it is further along than remote', async () => {
    const local = localProgress({ currentPage: 80, totalPages: 100 });
    const remote = localProgress({ bookName: 'Remote Copy', currentPage: 10, totalPages: 100 });
    const { resolveBestProgress } = await setup({ local, remote });

    await expect(resolveBestProgress('book-1')).resolves.toEqual(local);
  });

  it('prefers local on a tie', async () => {
    const local = localProgress({ currentPage: 80, totalPages: 100 });
    const remote = localProgress({ bookName: 'Remote Copy', currentPage: 80, totalPages: 100 });
    const { resolveBestProgress } = await setup({ local, remote });

    await expect(resolveBestProgress('book-1')).resolves.toEqual(local);
  });

  it('falls back to local when the remote fetch fails', async () => {
    const local = localProgress();
    const { resolveBestProgress } = await setup({ local, remote: 'error' });

    await expect(resolveBestProgress('book-1')).resolves.toEqual(local);
  });
});
