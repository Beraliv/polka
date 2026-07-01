import type { SMBConfig, FileEntry } from '@polka/shared';
import { store } from '../store/books.ts';

function apiUrl(path: string, serverUrl = store.serverUrl): string {
  return `${serverUrl}${path}`;
}

export async function testSMB({ config, serverUrl }: { config: SMBConfig; serverUrl?: string }): Promise<void> {
  const res = await fetch(apiUrl('/api/smb/test', serverUrl ?? store.serverUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const { error } = await res.json() as { error: string };
    throw new Error(error);
  }
}

export async function listSMBFiles(config: SMBConfig, path = ''): Promise<FileEntry[]> {
  const res = await fetch(apiUrl('/api/smb/files'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, path }),
  });
  if (!res.ok) throw new Error('Failed to list SMB files');
  return res.json() as Promise<FileEntry[]>;
}

export async function downloadSMBFile(config: SMBConfig, path: string): Promise<ArrayBuffer> {
  const res = await fetch(apiUrl('/api/smb/file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, path }),
  });
  if (!res.ok) throw new Error('Failed to download file from SMB');
  return res.arrayBuffer();
}
