import type { SMBConfig } from '@polka/shared';
import { apiUrl } from './apiUrl.ts';

export async function downloadSMBFile(config: SMBConfig, path: string): Promise<ArrayBuffer> {
  const res = await fetch(apiUrl('/api/smb/file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, path }),
  });
  if (!res.ok) throw new Error('Failed to download file from SMB');
  return res.arrayBuffer();
}
