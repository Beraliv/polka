import type { ChatStreamEvent, ExplainRequest } from '@polka/shared';
import { apiUrl } from './apiUrl.ts';
import { readChatEventStream } from './readChatEventStream.ts';

export interface ExplainPassageOptions {
  request: ExplainRequest;
  onEvent: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
}

// Streams Claude's explanation of a passage, in the same events as a chat
// reply.
export async function explainPassage({
  request,
  onEvent,
  signal,
}: ExplainPassageOptions): Promise<void> {
  const response = await fetch(apiUrl('/api/explain'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  await readChatEventStream(response, onEvent);
}
