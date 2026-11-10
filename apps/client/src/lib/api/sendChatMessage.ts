import type { ChatMessage, ChatRequest, ChatStreamEvent } from '@polka/shared';
import { apiUrl } from './apiUrl.ts';

interface SendChatMessageOptions {
  messages: ChatMessage[];
  onEvent: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
}

// The server streams Server-Sent Events (see ChatStreamEvent) so the reply can
// render token-by-token instead of waiting for the full response. An `error`
// event is thrown rather than passed to `onEvent`, so callers handle failures
// before and during the stream in one place.
export async function sendChatMessage({
  messages,
  onEvent,
  signal,
}: SendChatMessageOptions): Promise<void> {
  const request: ChatRequest = { messages };
  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    const errorBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorBody?.error ?? `Chat request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    const rawEvents = buffer.split('\n\n');
    buffer = rawEvents.pop() ?? '';

    for (const rawEvent of rawEvents) {
      const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) {
        continue;
      }
      const event = JSON.parse(dataLine.slice('data: '.length)) as ChatStreamEvent;
      if (event.type === 'error') {
        throw new Error(event.error);
      }
      onEvent(event);
    }
  }
}
