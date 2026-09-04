// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

vi.mock('./polka-db.ts', () => ({
  ProgressDB: {
    download: vi.fn().mockResolvedValue([]),
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

const baseProgress = {
  bookId: 'book-1',
  bookName: 'Test Book',
  currentPage: 1,
  totalPages: 10,
  percent: 10,
  lastRead: 0,
  finished: false,
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('flushing a pending remote sync on page hide/unload', () => {
  it('sends a keepalive request for a sync the throttle window has not fired yet, and is a no-op once flushed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { initProgress, saveProgress } = await import('./progress.ts');
    await initProgress();

    // Needed so the next call below lands inside the throttle window rather
    // than being a leading-edge call itself.
    saveProgress(baseProgress);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).keepalive).toBeFalsy();
    fetchMock.mockClear();

    // A second call inside the 10s throttle window is deferred — a closed or
    // backgrounded page won't wait around for that timer to fire, so this is
    // exactly what flushPendingSync() must catch.
    saveProgress({ ...baseProgress, currentPage: 2 });
    expect(fetchMock).not.toHaveBeenCalled();

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://store-server.test/api/progress');
    expect(options.keepalive).toBe(true);
    expect(JSON.parse(options.body as string)).toEqual({ ...baseProgress, currentPage: 2 });

    // Nothing pending anymore, so a second hide event does nothing.
    fetchMock.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('also flushes on pagehide', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { initProgress, saveProgress } = await import('./progress.ts');
    await initProgress();

    saveProgress(baseProgress);
    fetchMock.mockClear();
    saveProgress({ ...baseProgress, currentPage: 3 });

    window.dispatchEvent(new Event('pagehide'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).keepalive).toBe(true);
  });

  it('does nothing on visibilitychange when the page is visible, not hidden', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { initProgress, saveProgress } = await import('./progress.ts');
    await initProgress();

    saveProgress(baseProgress);
    fetchMock.mockClear();
    saveProgress({ ...baseProgress, currentPage: 2 });

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
