import { z } from 'zod';
import type { SMBConfig } from '@polka/shared';
import { store } from '../../store/books.ts';
import { apiUrl } from './apiUrl.ts';

const errorResponseSchema = z.object({
  error: z.string(),
});

export async function testSMB({ config, serverUrl }: { config: SMBConfig; serverUrl?: string }): Promise<void> {
  const res = await fetch(apiUrl('/api/smb/test', serverUrl ?? store.serverUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const { error } = errorResponseSchema.parse(await res.json());
    throw new Error(error);
  }
}
