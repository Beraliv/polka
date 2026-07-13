// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { throttle } from './throttle.ts';

const INTERVAL_MS = 10_000;

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('invokes the callback immediately on the first call', () => {
    const callback = vi.fn();
    const throttledCallback = throttle(callback, INTERVAL_MS);

    throttledCallback('first');

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('first');
  });

  it('does NOT invoke the callback again within the interval', () => {
    const callback = vi.fn();
    const throttledCallback = throttle(callback, INTERVAL_MS);

    throttledCallback('first');
    vi.advanceTimersByTime(INTERVAL_MS - 1);
    throttledCallback('second');

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('invokes the callback with the latest arguments once the interval expires', () => {
    const callback = vi.fn();
    const throttledCallback = throttle(callback, INTERVAL_MS);

    throttledCallback('first');
    vi.advanceTimersByTime(1_000);
    throttledCallback('second');
    throttledCallback('third');

    vi.advanceTimersByTime(INTERVAL_MS);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith('third');
  });

  it('coalesces many calls within one interval into a single trailing invocation', () => {
    const callback = vi.fn();
    const throttledCallback = throttle(callback, INTERVAL_MS);

    throttledCallback(1);
    for (let callIndex = 2; callIndex <= 10; callIndex++) {
      vi.advanceTimersByTime(100);
      throttledCallback(callIndex);
    }
    vi.advanceTimersByTime(INTERVAL_MS);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(10);
  });

  it('invokes immediately again after a full idle interval', () => {
    const callback = vi.fn();
    const throttledCallback = throttle(callback, INTERVAL_MS);

    throttledCallback('first');
    vi.advanceTimersByTime(INTERVAL_MS);
    throttledCallback('second');

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith('second');
  });

  it('starts a new throttle window after a trailing invocation', () => {
    const callback = vi.fn();
    const throttledCallback = throttle(callback, INTERVAL_MS);

    throttledCallback('first');
    vi.advanceTimersByTime(1_000);
    throttledCallback('second');
    // Trailing invocation of "second" fires at INTERVAL_MS after "first"
    vi.advanceTimersByTime(INTERVAL_MS - 1_000);
    expect(callback).toHaveBeenCalledTimes(2);

    // A call right after the trailing invocation is throttled again
    throttledCallback('third');
    expect(callback).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenLastCalledWith('third');
  });

  it('passes multiple arguments through to the callback', () => {
    const callback = vi.fn();
    const throttledCallback = throttle(callback, INTERVAL_MS);

    throttledCallback('bookId', 42);

    expect(callback).toHaveBeenCalledWith('bookId', 42);
  });
});
