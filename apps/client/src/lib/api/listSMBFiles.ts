import { z } from 'zod';
import type { FileEntry } from '@polka/shared';
import { apiUrl } from './apiUrl.ts';

const fileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  size: z.number().optional(),
}) satisfies z.ZodType<FileEntry>;

const fileEntryListSchema = z.array(fileEntrySchema);

export async function listSMBFiles(path = ''): Promise<FileEntry[]> {
  const res = await fetch(apiUrl('/api/smb/files'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    throw new Error('Failed to list SMB files');
  }
  return fileEntryListSchema.parse(await res.json());
}
