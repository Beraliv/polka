import type { ChatMessage, ChatStopReason, ExplainRequest } from '@polka/shared';
import { explainPassage, type ExplainPassageOptions } from './api/explainPassage.ts';
import { applyChatStreamEvent } from './chat/applyChatStreamEvent.ts';

export type ExplanationStatus = 'pending' | 'done' | 'error';

export type Explanation = {
  passage: string;
  // Built from the stream exactly like a chat reply, so it renders with the
  // same component and skips block types this client doesn't know.
  reply: ChatMessage;
  status: ExplanationStatus;
  // Set once the reply ends: whether it was complete, cut off or declined.
  stopReason: ChatStopReason | null;
  errorMessage: string | null;
};

export type ExplanationListener = (explanation: Explanation | null) => void;

type FetchExplanation = (options: ExplainPassageOptions) => Promise<void>;

/**
 * Owns the explanation of a selected passage: requesting it from the server,
 * building the reply as it streams in, and closing it. Plain TypeScript with
 * no UI framework — create-explanation-manager.ts binds it to Solid.
 */
export class ExplanationManager {
  #currentExplanation: Explanation | null = null;
  // The request in flight. Closing or starting another explanation aborts it,
  // and its late events are dropped, so an old reply never lands in a newer
  // sheet.
  #currentRequest: AbortController | null = null;
  readonly #listeners = new Set<ExplanationListener>();
  readonly #fetchExplanation: FetchExplanation;

  constructor(fetchExplanation: FetchExplanation = explainPassage) {
    this.#fetchExplanation = fetchExplanation;
  }

  get explanation(): Explanation | null {
    return this.#currentExplanation;
  }

  /** Calls `listener` on every change; returns an unsubscribe function. */
  subscribe(listener: ExplanationListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async explain(request: ExplainRequest): Promise<void> {
    this.#currentRequest?.abort();
    const controller = new AbortController();
    this.#currentRequest = controller;
    const isCurrent = () => this.#currentRequest === controller;

    this.#setExplanation({
      passage: request.passage,
      reply: { role: 'assistant', content: [] },
      status: 'pending',
      stopReason: null,
      errorMessage: null,
    });

    try {
      await this.#fetchExplanation({
        request,
        signal: controller.signal,
        onEvent: (event) => {
          const current = this.#currentExplanation;
          if (!isCurrent() || !current) {
            return;
          }
          if (event.type === 'message_end') {
            this.#setExplanation({ ...current, status: 'done', stopReason: event.stopReason });
            return;
          }
          this.#setExplanation({ ...current, reply: applyChatStreamEvent(current.reply, event) });
        },
      });
      // A stream that ends without `message_end` (e.g. the connection
      // dropped) still finishes, with whatever text arrived.
      const current = this.#currentExplanation;
      if (isCurrent() && current?.status === 'pending') {
        this.#setExplanation({ ...current, status: 'done' });
      }
    } catch (error) {
      const current = this.#currentExplanation;
      // A closed or replaced request rejects with an AbortError; that's
      // expected, not a failure to show.
      if (!isCurrent() || !current) {
        return;
      }
      console.error('[ExplanationManager] Failed to explain the passage:', error);
      this.#setExplanation({
        ...current,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (isCurrent()) {
        this.#currentRequest = null;
      }
    }
  }

  close(): void {
    this.#currentRequest?.abort();
    this.#currentRequest = null;
    this.#setExplanation(null);
  }

  #setExplanation(next: Explanation | null): void {
    if (next === this.#currentExplanation) {
      return;
    }
    this.#currentExplanation = next;
    for (const listener of this.#listeners) {
      listener(next);
    }
  }
}
