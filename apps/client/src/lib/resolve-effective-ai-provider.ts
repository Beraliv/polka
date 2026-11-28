import { AI_PROVIDERS, type AiProviderCode } from '@polka/shared';

export interface ResolveEffectiveAiProviderOptions {
  storedProvider: AiProviderCode;
  // null while the server hasn't answered yet.
  availableProviders: AiProviderCode[] | null;
}

/**
 * Whether any AI feature can work. The Chat icon, the Explain button and the
 * Chat page depend on this. Unknown (null) counts as no, so nothing is offered
 * before the server has answered.
 */
export function isAnyAiProviderAvailable(availableProviders: AiProviderCode[] | null): boolean {
  return (availableProviders?.length ?? 0) > 0;
}

/**
 * The provider a request should use. The stored choice wins while it is
 * available. Otherwise the first available provider is used, so a stored
 * choice for a missing key doesn't cause errors. The stored choice is kept
 * when the list is unknown or empty, which keeps the request as it was before
 * the list existed.
 */
export function resolveEffectiveAiProvider({
  storedProvider,
  availableProviders,
}: ResolveEffectiveAiProviderOptions): AiProviderCode {
  if (availableProviders === null || availableProviders.length === 0) {
    return storedProvider;
  }
  if (availableProviders.includes(storedProvider)) {
    return storedProvider;
  }
  // AI_PROVIDERS order, not the server's order, so the choice doesn't depend
  // on how the server sorts its list.
  return AI_PROVIDERS.map((provider) => provider.code).find((code) =>
    availableProviders.includes(code),
  )!;
}
