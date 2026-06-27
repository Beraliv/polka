import type { Progress } from '@polka/shared';

const PREFIX = 'polka:progress:';

export function saveProgress(progress: Progress): void {
  localStorage.setItem(PREFIX + progress.bookId, JSON.stringify(progress));
  syncRemote(progress);
}

export function loadProgress(bookId: string): Progress | null {
  const raw = localStorage.getItem(PREFIX + bookId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Progress;
  } catch {
    return null;
  }
}

export function allProgress(): Progress[] {
  const result: Progress[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      result.push(JSON.parse(localStorage.getItem(key)!) as Progress);
    } catch {
      // ignore corrupt entries
    }
  }
  return result;
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
