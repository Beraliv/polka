import { FinishReason, ThinkingLevel, type Content, type GoogleGenAI } from '@google/genai';
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

// The experiment names thinking levels as strings in its candidate list; this
// is the one place they become the SDK's enum.
export function toGeminiThinkingLevel(level: 'LOW' | 'MEDIUM' | 'HIGH'): ThinkingLevel {
  return ThinkingLevel[level];
}

export type GeminiUsage = {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
};

/**
 * Streams a Gemini reply as the same events Claude's reply produces, so the
 * client reads both the same way. Thinking parts are internal reasoning and
 * are skipped, as with Claude's thinking blocks.
 *
 * `model` and `thinkingLevel` default to the chat setup; the Explain route and
 * the model experiment pass their own. `onUsage` receives the token counts of
 * the finished reply, for the experiment's cost and latency figures.
 */
export async function* streamGeminiReply({
  client,
  system,
  messages,
  maxOutputTokens,
  signal,
  model = GEMINI_MODEL,
  thinkingLevel,
  onUsage,
}: {
  client: GoogleGenAI;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  onUsage?: (usage: GeminiUsage) => void;
}): AsyncGenerator<ChatStreamEvent> {
  const chunks = await client.models.generateContentStream({
    model,
    contents: toGeminiContents(messages),
    config: {
      systemInstruction: system,
      maxOutputTokens,
      abortSignal: signal,
      // Left out entirely when unset, so the chat request is unchanged.
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
    },
  });

  let hasTextBlock = false;
  let stopReason: ChatStopReason = 'end_turn';
  // Gemini reports token counts on the chunks; the last report is the total.
  let latestUsageMetadata:
    | { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    | undefined;
  for await (const chunk of chunks) {
    if (chunk.usageMetadata) {
      latestUsageMetadata = chunk.usageMetadata;
    }
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

  onUsage?.({
    inputTokens: latestUsageMetadata?.promptTokenCount ?? 0,
    outputTokens: latestUsageMetadata?.candidatesTokenCount ?? 0,
    thinkingTokens: latestUsageMetadata?.thoughtsTokenCount ?? 0,
  });
  yield { type: 'message_end', stopReason };
}
