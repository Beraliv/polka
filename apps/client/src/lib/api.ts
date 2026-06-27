import type { SMBConfig, FileEntry } from '@polka/shared';

export async function testSMB(config: SMBConfig): Promise<void> {
  const res = await fetch('/api/smb/test', {
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
  const res = await fetch('/api/smb/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, path }),
  });
  if (!res.ok) throw new Error('Failed to list SMB files');
  return res.json() as Promise<FileEntry[]>;
}

export async function downloadSMBFile(config: SMBConfig, path: string): Promise<ArrayBuffer> {
  const res = await fetch('/api/smb/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, path }),
  });
  if (!res.ok) throw new Error('Failed to download file from SMB');
  return res.arrayBuffer();
}
