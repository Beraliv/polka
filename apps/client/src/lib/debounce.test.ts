// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce.ts';

const WAIT_MS = 10_000;

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does NOT invoke the callback before the wait elapses', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    debouncedCallback('first');
    vi.advanceTimersByTime(WAIT_MS - 1);

    expect(callback).not.toHaveBeenCalled();
  });

  it('invokes the callback once the wait elapses', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    debouncedCallback('first');
    vi.advanceTimersByTime(WAIT_MS);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('first');
  });

  it('restarts the wait on every call and invokes once with the latest arguments', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    debouncedCallback('first');
    vi.advanceTimersByTime(WAIT_MS - 1);
    debouncedCallback('second');
    vi.advanceTimersByTime(WAIT_MS - 1);
    debouncedCallback('third');

    // The wait restarted on each call, so nothing has fired yet.
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WAIT_MS);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('third');
  });

  it('coalesces a burst of calls into a single invocation', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    for (let callIndex = 1; callIndex <= 10; callIndex++) {
      debouncedCallback(callIndex);
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(WAIT_MS);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(10);
  });

  it('invokes again for a second burst after the first has fired', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    debouncedCallback('first');
    vi.advanceTimersByTime(WAIT_MS);
    debouncedCallback('second');
    vi.advanceTimersByTime(WAIT_MS);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith('second');
  });

  it('cancel() drops the pending invocation', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    debouncedCallback('first');
    debouncedCallback.cancel();
    vi.advanceTimersByTime(WAIT_MS);

    expect(callback).not.toHaveBeenCalled();
  });

  it('works again after cancel()', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    debouncedCallback('first');
    debouncedCallback.cancel();
    debouncedCallback('second');
    vi.advanceTimersByTime(WAIT_MS);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('cancel() is a no-op when nothing is pending', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    expect(() => debouncedCallback.cancel()).not.toThrow();
  });

  it('passes multiple arguments through to the callback', () => {
    const callback = vi.fn();
    const debouncedCallback = debounce(callback, WAIT_MS);

    debouncedCallback('bookId', 42);
    vi.advanceTimersByTime(WAIT_MS);

    expect(callback).toHaveBeenCalledWith('bookId', 42);
  });
});
