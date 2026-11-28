import { FinishReason, type Content, type GoogleGenAI } from '@google/genai';
import type { ChatMessage, ChatStopReason, ChatStreamEvent } from '@polka/shared';

// The newest Gemini model at the strongest tier, matching how Claude is used
// for the reply. Pick a cheaper tier here if cost matters more than answer quality.
export const GEMINI_MODEL = 'gemini-4-carbon';

// Finish reasons where Gemini stopped because of its content policy, the
// equivalent of Claude's `refusal` stop reason.
const REFUSAL_FINISH_REASONS: ReadonlySet<FinishReason> = new Set([
  FinishReason.SAFETY,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
]);

export function toGeminiStopReason(finishReason: FinishReason | undefined): ChatStopReason {
  if (finishReason === FinishReason.MAX_TOKENS) {
    return 'max_tokens';
  }
  if (finishReason && REFUSAL_FINISH_REASONS.has(finishReason)) {
    return 'refusal';
  }
  return 'end_turn';
}

function toGeminiContents(messages: ChatMessage[]): Content[] {
  return messages.map(({ role, content }) => ({
    role: role === 'assistant' ? 'model' : 'user',
    parts: content.map((block) => ({ text: block.text })),
  }));
}

/**
 * Streams a Gemini reply as the same events Claude's reply produces, so the
 * client reads both the same way. Thinking parts are internal reasoning and
 * are skipped, as with Claude's thinking blocks.
 */
export async function* streamGeminiReply({
  client,
  system,
  messages,
  maxOutputTokens,
  signal,
}: {
  client: GoogleGenAI;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
}): AsyncGenerator<ChatStreamEvent> {
  const chunks = await client.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: toGeminiContents(messages),
    config: { systemInstruction: system, maxOutputTokens, abortSignal: signal },
  });

  let hasTextBlock = false;
  let stopReason: ChatStopReason = 'end_turn';
  for await (const chunk of chunks) {
    // A blocked prompt comes back with no candidate at all, so the refusal
    // is read from the feedback rather than the finish reason.
    if (chunk.promptFeedback?.blockReason) {
      stopReason = 'refusal';
    }
    const candidate = chunk.candidates?.[0];
    if (candidate?.finishReason) {
      stopReason = toGeminiStopReason(candidate.finishReason);
    }
    for (const part of candidate?.content?.parts ?? []) {
      if (part.thought || !part.text) {
        continue;
      }
      // The first text opens the block, as Claude's content_block_start does,
      // so every later delta has a block to append to.
      if (!hasTextBlock) {
        hasTextBlock = true;
        yield { type: 'block_start', block: { type: 'text', text: '' } };
      }
      yield { type: 'text_delta', text: part.text };
    }
  }

  yield { type: 'message_end', stopReason };
}
