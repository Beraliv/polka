import type {
  AiProviderCode,
  ChatStopReason,
  ExplainRequest,
} from '../../packages/shared/src/index.ts';
import { anthropicClient } from '../../apps/server/src/lib/anthropic-client.ts';
import { geminiClient } from '../../apps/server/src/lib/gemini-client.ts';
import {
  EXPLAIN_MAX_OUTPUT_TOKENS,
  EXPLAIN_SYSTEM_PROMPT,
  buildClaudeExplainParams,
  buildExplainPrompt,
} from '../../apps/server/src/lib/explain-settings.ts';
import {
  streamGeminiReply,
  toGeminiThinkingLevel,
  type GeminiUsage,
} from '../../apps/server/src/lib/gemini-reply.ts';
import { streamClaudeReply } from '../../apps/server/src/routes/chat.ts';
import type { ModelCandidate } from './candidates.ts';

export type ExplainCallResult = {
  text: string;
  stopReason: ChatStopReason | 'error';
  errorMessage: string | null;
  latencyMs: number;
  timeToFirstTextMs: number | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
};

// Runs one Explain call the way the route does: same prompt, cap, effort or
// thinking level and, for Claude, the same fallbacks. The text is collected
// from the same stream transform the route uses, so what is scored is what
// the reader would see.
export async function runExplainCall({
  provider,
  candidate,
  request,
}: {
  provider: AiProviderCode;
  candidate: ModelCandidate;
  request: ExplainRequest;
}): Promise<ExplainCallResult> {
  const prompt = buildExplainPrompt(request);
  const startedAt = performance.now();
  const result: ExplainCallResult = {
    text: '',
    stopReason: 'error',
    errorMessage: null,
    latencyMs: 0,
    timeToFirstTextMs: null,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
  };

  const collectText = (text: string) => {
    if (result.timeToFirstTextMs === null) {
      result.timeToFirstTextMs = performance.now() - startedAt;
    }
    result.text += text;
  };

  try {
    if (provider === 'claude') {
      const stream = anthropicClient!.beta.messages.stream(
        buildClaudeExplainParams({
          prompt,
          setup: { model: candidate.model, effort: candidate.effort ?? 'low' },
        }),
      );
      for await (const event of streamClaudeReply(stream)) {
        if (event.type === 'block_start' && event.block.type === 'text') {
          collectText(event.block.text);
        } else if (event.type === 'text_delta') {
          collectText(event.text);
        } else if (event.type === 'message_end') {
          result.stopReason = event.stopReason;
        }
      }
      const finalMessage = await stream.finalMessage();
      result.inputTokens = finalMessage.usage.input_tokens;
      result.outputTokens = finalMessage.usage.output_tokens;
    } else {
      // Filled in by the stream's onUsage callback, after the last text.
      const reportedUsage: { value: GeminiUsage | null } = { value: null };
      const events = streamGeminiReply({
        client: geminiClient!,
        system: EXPLAIN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        maxOutputTokens: EXPLAIN_MAX_OUTPUT_TOKENS,
        model: candidate.model,
        thinkingLevel: toGeminiThinkingLevel(candidate.thinkingLevel ?? 'LOW'),
        signal: new AbortController().signal,
        onUsage: (usage) => {
          reportedUsage.value = usage;
        },
      });
      for await (const event of events) {
        if (event.type === 'block_start' && event.block.type === 'text') {
          collectText(event.block.text);
        } else if (event.type === 'text_delta') {
          collectText(event.text);
        } else if (event.type === 'message_end') {
          result.stopReason = event.stopReason;
        }
      }
      if (reportedUsage.value) {
        result.inputTokens = reportedUsage.value.inputTokens;
        result.outputTokens = reportedUsage.value.outputTokens;
        result.thinkingTokens = reportedUsage.value.thinkingTokens;
      }
    }
  } catch (caught) {
    result.errorMessage = caught instanceof Error ? caught.message : String(caught);
    result.stopReason = 'error';
  }

  result.latencyMs = performance.now() - startedAt;
  return result;
}
