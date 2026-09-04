import { z } from 'zod';
import { apiUrl } from './apiUrl.ts';

const errorResponseSchema = z.object({
  error: z.string(),
});

export async function deleteSMBConfig(serverUrl?: string): Promise<void> {
  const res = await fetch(apiUrl('/api/smb/config', serverUrl), { method: 'DELETE' });
  if (!res.ok) {
    const { error } = errorResponseSchema.parse(await res.json());
    throw new Error(error);
  }
}
