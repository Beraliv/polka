import type { Progress } from '@polka/shared';
import { ProgressDB } from './polka-db.ts';
import { store } from '../store/books.ts';
import { throttle } from './throttle.ts';

const progressCache: Record<string, Progress> = {};

const LEGACY_PREFIX = 'polka:progress:';

let pendingSync: Progress | null = null;

function postProgress(progress: Progress, keepalive = false): void {
  fetch(`${store.serverUrl}/api/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
    keepalive,
  }).catch(() => {
    // Remote sync is best-effort; failure is silent
  });
}

const SYNC_INTERVAL_MS = 10_000;

const throttledSync = throttle((progress: Progress) => {
  postProgress(progress);
  pendingSync = null;
}, SYNC_INTERVAL_MS);

function syncRemote(progress: Progress): void {
  pendingSync = progress;
  throttledSync(progress);
}

// A tab can be backgrounded or closed before the throttle window above
// elapses — especially on iOS Safari — silently dropping the final reading
// position. `keepalive` lets the flush request survive the teardown.
function flushPendingSync(): void {
  if (pendingSync === null) {
    return;
  }
  const progress = pendingSync;
  pendingSync = null;
  postProgress(progress, true);
}

export async function initProgress(): Promise<void> {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingSync();
    }
  });
  window.addEventListener('pagehide', flushPendingSync);

  const progressArray = await ProgressDB.download();

  if (progressArray.length === 0) {
    // One-time migration from localStorage
    const migrated: Progress[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LEGACY_PREFIX)) {
        continue;
      }
      try {
        migrated.push(JSON.parse(localStorage.getItem(key)!) as Progress);
      } catch {
        // ignore corrupt entries
      }
    }
    for (const progress of migrated) {
      await ProgressDB.upload(progress);
      progressCache[progress.bookId] = progress;
    }
    for (const key of migrated.map((progressEntry) => LEGACY_PREFIX + progressEntry.bookId)) {
      localStorage.removeItem(key);
    }
  } else {
    for (const progress of progressArray) {
      progressCache[progress.bookId] = progress;
    }
  }
}

export function saveProgress(progress: Progress): void {
  progressCache[progress.bookId] = progress;
  void ProgressDB.upload(progress);
  syncRemote(progress);
}

export function loadProgress(bookId: string): Progress | null {
  return progressCache[bookId] ?? null;
}

export function allProgress(): Progress[] {
  return Object.values(progressCache);
}

const REMOTE_PROGRESS_TIMEOUT_MS = 10_000;

export async function loadRemoteProgress(bookId: string): Promise<Progress | null> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REMOTE_PROGRESS_TIMEOUT_MS);
  try {
    const res = await fetch(`${store.serverUrl}/api/progress/${bookId}`, {
      signal: abortController.signal,
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as Progress;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function progressFraction(progress: Progress | null): number {
  if (!progress || progress.totalPages <= 1) {
    return 0;
  }
  return (progress.currentPage - 1) / (progress.totalPages - 1);
}

// Callers about to persist a progress record (e.g. HomePage's SMB-select
// flow, to record a fresh smbPath) must use this instead of local progress
// alone: on a device with no local record for the book yet, defaulting
// page/percent to 0 would overwrite real progress on the server with a
// zeroed-out one, since the server does a full-file overwrite, not a merge.
export async function resolveBestProgress(bookId: string): Promise<Progress | null> {
  const local = loadProgress(bookId);
  const remote = await loadRemoteProgress(bookId);
  if (remote === null) {
    return local;
  }
  if (local === null) {
    return remote;
  }
  return progressFraction(remote) > progressFraction(local) ? remote : local;
}
