import { z } from 'zod';
import { isAiProviderCode, type AiProviderCode } from '@polka/shared';
import { apiUrl } from './apiUrl.ts';

const aiProvidersResponseSchema = z.object({
  providers: z.array(z.string()),
});

// Returns null when the server can't be asked, so the caller can tell
// "unknown" apart from "none configured". Unrecognised names are dropped, as
// a newer server may list providers this client doesn't know.
export async function fetchAiProviders(): Promise<AiProviderCode[] | null> {
  try {
    const res = await fetch(apiUrl('/api/ai-providers'));
    if (!res.ok) {
      return null;
    }
    const { providers } = aiProvidersResponseSchema.parse(await res.json());
    return providers.filter(isAiProviderCode);
  } catch {
    return null;
  }
}
