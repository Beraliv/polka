import { describe, expect, it } from 'vitest';
import {
  isAnyAiProviderAvailable,
  resolveEffectiveAiProvider,
} from './resolve-effective-ai-provider.ts';

describe('resolveEffectiveAiProvider', () => {
  it('keeps the stored choice while it is available', () => {
    expect(
      resolveEffectiveAiProvider({
        storedProvider: 'gemini',
        availableProviders: ['claude', 'gemini'],
      }),
    ).toBe('gemini');
  });

  it('uses the only available provider when the stored choice has no key', () => {
    expect(
      resolveEffectiveAiProvider({ storedProvider: 'claude', availableProviders: ['gemini'] }),
    ).toBe('gemini');
  });

  it('falls back in AI_PROVIDERS order, whatever order the server listed them', () => {
    expect(
      resolveEffectiveAiProvider({
        storedProvider: 'claude',
        availableProviders: ['gemini', 'claude'],
      }),
    ).toBe('claude');
  });

  it('keeps the stored choice while the list is unknown', () => {
    expect(resolveEffectiveAiProvider({ storedProvider: 'gemini', availableProviders: null })).toBe(
      'gemini',
    );
  });

  it('keeps the stored choice when no provider is available', () => {
    expect(resolveEffectiveAiProvider({ storedProvider: 'gemini', availableProviders: [] })).toBe(
      'gemini',
    );
  });
});

describe('isAnyAiProviderAvailable', () => {
  it.each([
    [null, false],
    [[], false],
    [['gemini'], true],
    [['claude', 'gemini'], true],
  ] as const)('is true for %j only when a provider is listed (%s)', (providers, expected) => {
    expect(isAnyAiProviderAvailable(providers ? [...providers] : null)).toBe(expected);
  });
});
