// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { ChatStreamEvent, ExplainRequest } from '@polka/shared';
import type { ExplainPassageOptions } from './api/explainPassage.ts';
import { ExplanationManager } from './explanation-manager.ts';

vi.mock('../store/books.ts', () => ({
  store: { serverUrl: 'http://store-server.test' },
}));

const request: ExplainRequest = {
  passage: 'Все смешалось в доме Облонских.',
  bookName: 'Анна Каренина',
  author: 'Лев Толстой',
  language: 'en',
};

function replyingWith(events: ChatStreamEvent[]) {
  return vi.fn(async ({ onEvent }: ExplainPassageOptions) => {
    for (const event of events) {
      onEvent(event);
    }
  });
}

// A fetch that only settles when the test says so, like a slow network. Each
// call is kept, so a test can play events into an older, replaced request.
type PendingRequest = {
  options: ExplainPassageOptions;
  finish: () => void;
  fail: (error: Error) => void;
};

function controllableFetch() {
  const requests: PendingRequest[] = [];
  const fetchExplanation = vi.fn(
    (options: ExplainPassageOptions) =>
      new Promise<void>((resolve, reject) => {
        requests.push({ options, finish: resolve, fail: reject });
      }),
  );
  return { fetchExplanation, requests };
}

describe('ExplanationManager', () => {
  it('builds the reply from the stream and marks it done with its stop reason', async () => {
    const manager = new ExplanationManager(
      replyingWith([
        { type: 'block_start', block: { type: 'text', text: '' } },
        { type: 'text_delta', text: 'Everything was ' },
        { type: 'text_delta', text: 'in confusion.' },
        { type: 'message_end', stopReason: 'end_turn' },
      ]),
    );

    await manager.explain(request);

    expect(manager.explanation).toEqual({
      passage: request.passage,
      reply: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Everything was in confusion.' }],
      },
      status: 'done',
      stopReason: 'end_turn',
      errorMessage: null,
    });
  });

  it('shows the passage as pending before any text arrives', () => {
    const network = controllableFetch();
    const manager = new ExplanationManager(network.fetchExplanation);

    void manager.explain(request);

    expect(manager.explanation).toMatchObject({ passage: request.passage, status: 'pending' });
    expect(network.fetchExplanation).toHaveBeenCalledWith(expect.objectContaining({ request }));
  });

  it('keeps the passage and reports the error when the request fails', async () => {
    const network = controllableFetch();
    const manager = new ExplanationManager(network.fetchExplanation);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const explaining = manager.explain(request);
    network.requests[0]?.fail(new Error('ANTHROPIC_API_KEY is not configured on the server'));
    await explaining;

    expect(manager.explanation).toMatchObject({
      passage: request.passage,
      status: 'error',
      errorMessage: 'ANTHROPIC_API_KEY is not configured on the server',
    });
  });

  it('aborts the request on close and ignores its late events and errors', async () => {
    const network = controllableFetch();
    const manager = new ExplanationManager(network.fetchExplanation);
    const listener = vi.fn();
    manager.subscribe(listener);

    const explaining = manager.explain(request);
    const [pending] = network.requests;
    manager.close();
    pending?.options.onEvent({ type: 'block_start', block: { type: 'text', text: 'Late' } });
    pending?.fail(new DOMException('Aborted', 'AbortError'));
    await explaining;

    expect(pending?.options.signal?.aborted).toBe(true);
    expect(manager.explanation).toBeNull();
    expect(listener.mock.calls.at(-1)).toEqual([null]);
  });

  it('replaces an explanation still streaming with a new one', async () => {
    const network = controllableFetch();
    const manager = new ExplanationManager(network.fetchExplanation);

    void manager.explain(request);
    void manager.explain({ ...request, passage: 'Счастливые семьи похожи.' });
    const [first] = network.requests;
    first?.options.onEvent({ type: 'block_start', block: { type: 'text', text: 'Stale' } });

    expect(first?.options.signal?.aborted).toBe(true);
    expect(manager.explanation).toMatchObject({
      passage: 'Счастливые семьи похожи.',
      reply: { content: [] },
    });
  });
});
