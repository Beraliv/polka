// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatStreamEvent } from '@polka/shared';
import { sendChatMessage } from './sendChatMessage.ts';

vi.mock('../../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

function toServerSentEvents(events: ChatStreamEvent[]): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

function mockStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
}

const userMessages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Hi' }] }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendChatMessage', () => {
  it('passes every stream event to onEvent, even when split across chunks', async () => {
    const events: ChatStreamEvent[] = [
      { type: 'block_start', block: { type: 'text', text: '' } },
      { type: 'text_delta', text: 'Hello' },
      { type: 'message_end', stopReason: 'end_turn' },
    ];
    const stream = toServerSentEvents(events);
    mockStreamResponse([stream.slice(0, 20), stream.slice(20)]);
    const onEvent = vi.fn();

    await sendChatMessage({ messages: userMessages, onEvent });

    expect(onEvent.mock.calls.map(([event]) => event)).toEqual(events);
  });

  it('throws the message of an error event', async () => {
    mockStreamResponse([toServerSentEvents([{ type: 'error', error: 'Overloaded' }])]);

    await expect(sendChatMessage({ messages: userMessages, onEvent: vi.fn() })).rejects.toThrow(
      'Overloaded',
    );
  });

  it('throws the error a rejected request returns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Bad request' }, { status: 400 })),
    );

    await expect(sendChatMessage({ messages: userMessages, onEvent: vi.fn() })).rejects.toThrow(
      'Bad request',
    );
  });
});
