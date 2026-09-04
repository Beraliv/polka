import { z } from 'zod';
import type { SMBConfigSummary } from '@polka/shared';
import { apiUrl } from './apiUrl.ts';

const errorResponseSchema = z.object({
  error: z.string(),
});

const smbConfigSummarySchema = z.object({
  ip: z.string(),
  port: z.number(),
  username: z.string(),
  share: z.string(),
}) satisfies z.ZodType<SMBConfigSummary>;

export async function fetchSMBConfig(serverUrl?: string): Promise<SMBConfigSummary | null> {
  const res = await fetch(apiUrl('/api/smb/config', serverUrl));
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const { error } = errorResponseSchema.parse(await res.json());
    throw new Error(error);
  }
  return smbConfigSummarySchema.parse(await res.json());
}
