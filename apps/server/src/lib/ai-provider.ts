import { DEFAULT_AI_PROVIDER, type AiProviderCode } from '@polka/shared';
import { anthropicClient } from './anthropic-client.ts';
import { geminiClient } from './gemini-client.ts';

const API_KEY_NAME_BY_PROVIDER: Record<AiProviderCode, string> = {
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export function resolveAiProvider(requested: AiProviderCode | undefined): AiProviderCode {
  return requested ?? DEFAULT_AI_PROVIDER;
}

/** The error to send when the chosen provider has no API key, or null when it can answer. */
export function providerUnavailableError(provider: AiProviderCode): string | null {
  const configured = provider === 'gemini' ? geminiClient !== null : anthropicClient !== null;
  return configured
    ? null
    : `${API_KEY_NAME_BY_PROVIDER[provider]} is not configured on the server`;
}
