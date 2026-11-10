import { describe, expect, it } from 'vitest';
import type { ChatContentBlock, ChatMessage } from '@polka/shared';
import { applyChatStreamEvent } from './applyChatStreamEvent.ts';

const emptyReply: ChatMessage = { role: 'assistant', content: [] };

describe('applyChatStreamEvent', () => {
  it('appends text deltas to the text block they follow', () => {
    let reply = applyChatStreamEvent(emptyReply, {
      type: 'block_start',
      block: { type: 'text', text: '' },
    });
    reply = applyChatStreamEvent(reply, { type: 'text_delta', text: 'Hello' });
    reply = applyChatStreamEvent(reply, { type: 'text_delta', text: ', world' });

    expect(reply.content).toEqual([{ type: 'text', text: 'Hello, world' }]);
  });

  it('starts a new block on each block_start', () => {
    let reply = applyChatStreamEvent(emptyReply, {
      type: 'block_start',
      block: { type: 'text', text: 'First' },
    });
    reply = applyChatStreamEvent(reply, {
      type: 'block_start',
      block: { type: 'text', text: '' },
    });
    reply = applyChatStreamEvent(reply, { type: 'text_delta', text: 'Second' });

    expect(reply.content).toEqual([
      { type: 'text', text: 'First' },
      { type: 'text', text: 'Second' },
    ]);
  });

  it('skips block types this client does not support yet', () => {
    // @ts-expect-error: unsupported block type
    const futureCardBlock: ChatContentBlock = { type: 'card', title: 'A book' };

    const reply = applyChatStreamEvent(emptyReply, { type: 'block_start', block: futureCardBlock });

    expect(reply.content).toEqual([]);
  });

  it('ignores a text delta when no text block is open', () => {
    const reply = applyChatStreamEvent(emptyReply, { type: 'text_delta', text: 'stray' });

    expect(reply).toBe(emptyReply);
  });
});
