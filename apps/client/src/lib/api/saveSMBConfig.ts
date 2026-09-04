import { z } from 'zod';
import type { SMBConfig, SMBConfigSummary } from '@polka/shared';
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

export type SaveSMBConfigOptions = {
  config: Partial<SMBConfig>;
  serverUrl?: string;
};

export async function saveSMBConfig({
  config,
  serverUrl,
}: SaveSMBConfigOptions): Promise<SMBConfigSummary> {
  const res = await fetch(apiUrl('/api/smb/config', serverUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const { error } = errorResponseSchema.parse(await res.json());
    throw new Error(error);
  }
  return smbConfigSummarySchema.parse(await res.json());
}
