import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

// The API key clients are built when their module loads, so each case stubs
// the environment and loads the routes fresh.
async function listProvidersWithKeys(keys: { anthropic?: string; gemini?: string }) {
  vi.resetModules();
  vi.stubEnv('ANTHROPIC_API_KEY', keys.anthropic ?? '');
  vi.stubEnv('GEMINI_API_KEY', keys.gemini ?? '');
  const { aiProvidersRoutes } = await import('./ai-providers.ts');
  const app = Fastify();
  await app.register(aiProvidersRoutes, { prefix: '/api/ai-providers' });
  const response = await app.inject({ method: 'GET', url: '/api/ai-providers' });
  return response.json<{ providers: string[] }>().providers;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/ai-providers', () => {
  it('lists no providers when no keys are set', async () => {
    expect(await listProvidersWithKeys({})).toEqual([]);
  });

  it('lists only the provider whose key is set', async () => {
    expect(await listProvidersWithKeys({ gemini: 'fake-gemini-key' })).toEqual(['gemini']);
  });

  it('lists both providers in AI_PROVIDERS order when both keys are set', async () => {
    expect(
      await listProvidersWithKeys({ anthropic: 'fake-claude-key', gemini: 'fake-gemini-key' }),
    ).toEqual(['claude', 'gemini']);
  });
});
