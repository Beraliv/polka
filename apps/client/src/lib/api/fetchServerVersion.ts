import { z } from 'zod';
import { apiUrl } from './apiUrl.ts';

const versionResponseSchema = z.object({
  version: z.string(),
});

export async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl('/api/version'));
    if (!res.ok) return null;
    const { version } = versionResponseSchema.parse(await res.json());
    return version;
  } catch {
    return null;
  }
}
