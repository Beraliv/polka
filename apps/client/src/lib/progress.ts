import type { Progress } from '@polka/shared';
import { ProgressDB } from './polka-db.ts';

const progressCache: Record<string, Progress> = {};

const LEGACY_PREFIX = 'polka:progress:';

export async function initProgress(): Promise<void> {
  const progressArray = await ProgressDB.download();

  if (progressArray.length === 0) {
    // One-time migration from localStorage
    const migrated: Progress[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LEGACY_PREFIX)) continue;
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
    for (const key of migrated.map((p) => LEGACY_PREFIX + p.bookId)) {
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

function syncRemote(progress: Progress): void {
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
  }).catch(() => {
    // Remote sync is best-effort; failure is silent
  });
}

export async function loadRemoteProgress(bookId: string): Promise<Progress | null> {
  try {
    const res = await fetch(`/api/progress/${bookId}`);
    if (!res.ok) return null;
    return (await res.json()) as Progress;
  } catch {
    return null;
  }
}
