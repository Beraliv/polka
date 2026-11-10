import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { chatRoutes, toAnthropicMessages, toChatStopReason } from './chat.ts';

describe('toAnthropicMessages', () => {
  it('converts text blocks', () => {
    expect(
      toAnthropicMessages([{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]),
    ).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]);
  });

  it('drops empty blocks and messages left with no content', () => {
    expect(
      toAnthropicMessages([
        { role: 'user', content: [{ type: 'text', text: 'First' }] },
        { role: 'assistant', content: [{ type: 'text', text: '  ' }] },
        { role: 'assistant', content: [] },
        { role: 'user', content: [{ type: 'text', text: 'Second' }] },
      ]),
    ).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'First' }] },
      { role: 'user', content: [{ type: 'text', text: 'Second' }] },
    ]);
  });
});

describe('toChatStopReason', () => {
  it.each([
    ['end_turn', 'end_turn'],
    ['max_tokens', 'max_tokens'],
    ['model_context_window_exceeded', 'max_tokens'],
    ['refusal', 'refusal'],
    [null, 'end_turn'],
  ] as const)('maps %s to %s', (stopReason, expected) => {
    expect(toChatStopReason(stopReason)).toBe(expected);
  });
});

describe('POST /api/chat', () => {
  async function postChat(body: object) {
    const app = Fastify();
    await app.register(chatRoutes, { prefix: '/api/chat' });
    return app.inject({ method: 'POST', url: '/api/chat', payload: body });
  }

  it('rejects content blocks other than text', async () => {
    const response = await postChat({
      messages: [{ role: 'user', content: [{ type: 'card', text: 'A book' }] }],
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects plain-string content', async () => {
    const response = await postChat({ messages: [{ role: 'user', content: 'Hello' }] });

    expect(response.statusCode).toBe(400);
  });
});
