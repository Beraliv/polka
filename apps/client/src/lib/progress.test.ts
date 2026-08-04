// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRemoteProgress } from './progress.ts';

vi.mock('../store/books.ts', () => ({
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

function mockHangingFetch() {
  const fetchMock = vi.fn((_url: string, options?: { signal?: AbortSignal }) => {
    return new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('loadRemoteProgress', () => {
  it('returns the remote progress on a successful response', async () => {
    const progress = { bookId: 'book-1', currentPage: 5 };
    mockFetchResponse({ ok: true, body: progress });

    await expect(loadRemoteProgress('book-1')).resolves.toEqual(progress);
  });

  it('returns null when the response is not ok', async () => {
    mockFetchResponse({ ok: false });

    await expect(loadRemoteProgress('book-1')).resolves.toBeNull();
  });

  it('passes an abort signal through to fetch', async () => {
    const fetchMock = mockFetchResponse({ ok: true, body: { bookId: 'book-1' } });

    await loadRemoteProgress('book-1');

    const options = fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts and returns null once the request takes longer than 10s', async () => {
    vi.useFakeTimers();
    mockHangingFetch();

    const resultPromise = loadRemoteProgress('book-1');
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resultPromise).resolves.toBeNull();
  });

  it('does NOT abort a request that resolves before the timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = mockHangingFetch();

    void loadRemoteProgress('book-1');
    await vi.advanceTimersByTimeAsync(9_000);

    const options = fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(options.signal?.aborted).toBe(false);
  });
});
