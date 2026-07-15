import { z } from 'zod';
import type { SMBConfig, FileEntry } from '@polka/shared';
import { apiUrl } from './apiUrl.ts';

const fileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  size: z.number().optional(),
}) satisfies z.ZodType<FileEntry>;

const fileEntryListSchema = z.array(fileEntrySchema);

export async function listSMBFiles(config: SMBConfig, path = ''): Promise<FileEntry[]> {
  const res = await fetch(apiUrl('/api/smb/files'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, path }),
  });
  if (!res.ok) throw new Error('Failed to list SMB files');
  return fileEntryListSchema.parse(await res.json());
}
