import { describe, expect, it } from 'vitest';
import { FinishReason, type GoogleGenAI } from '@google/genai';
import type { ChatStreamEvent } from '@polka/shared';
import { streamGeminiReply, toGeminiStopReason } from './gemini-reply.ts';

// Only `models.generateContentStream` is used, so the fake supplies just that.
function fakeClient(chunks: unknown[]): GoogleGenAI {
  async function* iterate() {
    yield* chunks;
  }
  return {
    models: { generateContentStream: async () => iterate() },
  } as unknown as GoogleGenAI;
}

async function collect(chunks: unknown[]): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of streamGeminiReply({
    client: fakeClient(chunks),
    system: 'system',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  })) {
    events.push(event);
  }
  return events;
}

describe('toGeminiStopReason', () => {
  it.each([
    [FinishReason.STOP, 'end_turn'],
    [FinishReason.MAX_TOKENS, 'max_tokens'],
    [FinishReason.SAFETY, 'refusal'],
    [FinishReason.PROHIBITED_CONTENT, 'refusal'],
    [undefined, 'end_turn'],
  ] as const)('maps %s to %s', (finishReason, expected) => {
    expect(toGeminiStopReason(finishReason)).toBe(expected);
  });
});

describe('streamGeminiReply', () => {
  it('streams text as a block, skipping thoughts, and ends with the finish reason', async () => {
    const events = await collect([
      { candidates: [{ content: { parts: [{ text: 'Thinking…', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] },
      {
        candidates: [{ content: { parts: [{ text: ' there' }] }, finishReason: FinishReason.STOP }],
      },
    ]);

    expect(events).toEqual([
      { type: 'block_start', block: { type: 'text', text: '' } },
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ' there' },
      { type: 'message_end', stopReason: 'end_turn' },
    ]);
  });

  it('reports a blocked prompt as a refusal, with no text', async () => {
    const events = await collect([{ promptFeedback: { blockReason: 'SAFETY' } }]);

    expect(events).toEqual([{ type: 'message_end', stopReason: 'refusal' }]);
  });
});
