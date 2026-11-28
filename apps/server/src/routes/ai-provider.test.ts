import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { explainRoutes } from './explain.ts';
import { chatRoutes } from './chat.ts';

// The test environment sets no API keys, so each provider reports as not
// configured and the routes answer before calling either service.
describe('AI provider selection', () => {
  async function postTo(prefix: 'explain' | 'chat', body: object) {
    const app = Fastify();
    await app.register(explainRoutes, { prefix: '/api/explain' });
    await app.register(chatRoutes, { prefix: '/api/chat' });
    return app.inject({ method: 'POST', url: `/api/${prefix}`, payload: body });
  }

  it('names the Gemini key when Gemini is chosen but not configured', async () => {
    const response = await postTo('chat', {
      provider: 'gemini',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'GEMINI_API_KEY is not configured on the server' });
  });

  it('names the Anthropic key by default, when no provider is sent', async () => {
    const response = await postTo('explain', {
      passage: 'Text.',
      bookName: 'Book',
      language: 'en',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'ANTHROPIC_API_KEY is not configured on the server',
    });
  });

  it('rejects a provider outside the supported list', async () => {
    const response = await postTo('chat', {
      provider: 'mistral',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    });

    expect(response.statusCode).toBe(400);
  });
});
