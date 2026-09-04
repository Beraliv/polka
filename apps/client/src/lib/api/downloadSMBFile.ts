import { apiUrl } from './apiUrl.ts';

export async function downloadSMBFile(path: string): Promise<ArrayBuffer> {
  const res = await fetch(apiUrl('/api/smb/file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    throw new Error('Failed to download file from SMB');
  }
  return res.arrayBuffer();
}
