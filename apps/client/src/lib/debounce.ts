type DebouncedFunction<Args extends unknown[]> = {
  (...args: Args): void;
  /** Drops the pending invocation, if any. */
  cancel: () => void;
};

export function debounce<Args extends unknown[]>(
  callback: (...args: Args) => void,
  waitMs: number,
): DebouncedFunction<Args> {
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  const debouncedCallback = (...args: Args) => {
    // Every call restarts the wait, so the callback only fires with the
    // latest arguments once calls have been quiet for the full wait.
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = undefined;
      callback(...args);
    }, waitMs);
  };

  debouncedCallback.cancel = () => {
    clearTimeout(pendingTimer);
    pendingTimer = undefined;
  };

  return debouncedCallback;
}
