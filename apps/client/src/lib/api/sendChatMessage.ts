import type { ChatMessage, ChatRequest, ChatStreamEvent } from '@polka/shared';
import { apiUrl } from './apiUrl.ts';
import { readChatEventStream } from './readChatEventStream.ts';

interface SendChatMessageOptions {
  messages: ChatMessage[];
  onEvent: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
}

// The server streams Server-Sent Events (see ChatStreamEvent) so the reply can
// render token-by-token instead of waiting for the full response.
export async function sendChatMessage({
  messages,
  onEvent,
  signal,
}: SendChatMessageOptions): Promise<void> {
  const request: ChatRequest = { messages };
  const response = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  await readChatEventStream(response, onEvent);
}
