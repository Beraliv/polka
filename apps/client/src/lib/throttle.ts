export function throttle<Args extends unknown[]>(
  callback: (...args: Args) => void,
  intervalMs: number,
): (...args: Args) => void {
  let lastInvocationTime = 0;
  let pendingArgs: Args | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args) => {
    const elapsedSinceLastInvocation = Date.now() - lastInvocationTime;

    if (elapsedSinceLastInvocation >= intervalMs) {
      lastInvocationTime = Date.now();
      callback(...args);
      return;
    }

    // Within the throttle window: remember the latest arguments and invoke
    // once the window expires, so the final call is never dropped.
    pendingArgs = args;
    if (pendingTimer !== undefined) return;

    pendingTimer = setTimeout(() => {
      pendingTimer = undefined;
      if (pendingArgs !== null) {
        const argsToInvoke = pendingArgs;
        pendingArgs = null;
        lastInvocationTime = Date.now();
        callback(...argsToInvoke);
      }
    }, intervalMs - elapsedSinceLastInvocation);
  };
}
