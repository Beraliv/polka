import { AI_PROVIDERS, DEFAULT_AI_PROVIDER, type AiProviderCode } from '@polka/shared';
import { anthropicClient } from './anthropic-client.ts';
import { geminiClient } from './gemini-client.ts';

const API_KEY_NAME_BY_PROVIDER: Record<AiProviderCode, string> = {
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export function resolveAiProvider(requested: AiProviderCode | undefined): AiProviderCode {
  return requested ?? DEFAULT_AI_PROVIDER;
}

function isProviderConfigured(provider: AiProviderCode): boolean {
  return provider === 'gemini' ? geminiClient !== null : anthropicClient !== null;
}

/** The error to send when the chosen provider has no API key, or null when it can answer. */
export function providerUnavailableError(provider: AiProviderCode): string | null {
  return isProviderConfigured(provider)
    ? null
    : `${API_KEY_NAME_BY_PROVIDER[provider]} is not configured on the server`;
}

/** The providers that can answer, in AI_PROVIDERS order. Uses the same check as providerUnavailableError. */
export function listConfiguredAiProviders(): AiProviderCode[] {
  return AI_PROVIDERS.map((provider) => provider.code).filter(isProviderConfigured);
}
