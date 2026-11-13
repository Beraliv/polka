import type { ChatStreamEvent } from '@polka/shared';

// Reads a ChatStreamEvent stream (Server-Sent Events) from `POST /api/chat`
// or `POST /api/explain`. An `error` event is thrown rather than passed to
// `onEvent`, so callers handle failures before and during the stream in one
// place.
export async function readChatEventStream(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  if (!response.ok || !response.body) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorBody?.error ?? `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
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
