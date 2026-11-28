import type { FastifyInstance, FastifyReply } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { PassThrough } from 'stream';
import {
  AI_PROVIDERS,
  SUPPORTED_CHAT_CONTENT_BLOCK_TYPES,
  type ChatContentBlock,
  type ChatContentBlockType,
  type ChatMessage,
  type ChatRequest,
  type ChatStopReason,
  type ChatStreamEvent,
} from '@polka/shared';
import { anthropicClient } from '../lib/anthropic-client.ts';
import { geminiClient } from '../lib/gemini-client.ts';
import { streamGeminiReply } from '../lib/gemini-reply.ts';
import { providerUnavailableError, resolveAiProvider } from '../lib/ai-provider.ts';

const SYSTEM_PROMPT =
  'You are a helpful assistant built into Polka, a personal e-book reader app. Be concise and friendly. ' +
  'The chat UI renders plain text only, so never use markdown formatting (no **bold**, no # headings, no bullet/numbered lists with - or *).';

// One schema per supported block type, so a client can't send a block the
// server doesn't know how to pass to Claude. Typed as a Record over
// ChatContentBlockType, so a block type without a schema doesn't compile.
const chatContentBlockSchemas = {
  text: {
    type: 'object',
    required: ['type', 'text'],
    properties: {
      type: { const: 'text' },
      text: { type: 'string' },
    },
  },
} as const satisfies Record<ChatContentBlockType, object>;

// Mirrors ChatRequest.
const chatRequestBodySchema = {
  type: 'object',
  required: ['messages'],
  properties: {
    provider: { enum: AI_PROVIDERS.map((provider) => provider.code) },
    messages: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['role', 'content'],
        properties: {
          role: { enum: ['user', 'assistant'] },
          content: {
            type: 'array',
            items: {
              oneOf: SUPPORTED_CHAT_CONTENT_BLOCK_TYPES.map(
                (type) => chatContentBlockSchemas[type],
              ),
            },
          },
        },
      },
    },
  },
} as const;

function toAnthropicBlock(block: ChatContentBlock): Anthropic.TextBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    default: {
      const unsupportedType: never = block.type;
      throw new Error(`Unsupported chat content block type: ${String(unsupportedType)}`);
    }
  }
}

function isEmptyBlock(block: ChatContentBlock): boolean {
  switch (block.type) {
    case 'text':
      return block.text.trim() === '';
    default: {
      const unsupportedType: never = block.type;
      throw new Error(`Unsupported chat content block type: ${String(unsupportedType)}`);
    }
  }
}

// Empty blocks and messages (a refusal before any text, or a reply the client
// cut short) are dropped because the APIs reject empty text blocks and
// messages with no content.
export function withoutEmptyMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.flatMap(({ role, content }) => {
    const blocks = content.filter((block) => !isEmptyBlock(block));
    return blocks.length > 0 ? [{ role, content: blocks }] : [];
  });
}

export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return withoutEmptyMessages(messages).map(({ role, content }) => ({
    role,
    content: content.map(toAnthropicBlock),
  }));
}

// Also takes the beta stop reasons, for routes on the beta Messages API (e.g.
// explain, for refusal fallbacks).
export function toChatStopReason(
  stopReason: Anthropic.StopReason | Anthropic.Beta.BetaStopReason | null,
): ChatStopReason {
  switch (stopReason) {
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    // No tools or stop sequences are sent, so `tool_use`, `pause_turn` and
    // `stop_sequence` can't happen; anything else means the reply finished.
    default:
      return 'end_turn';
  }
}

/**
 * Stops the AI request when the client goes away. The client cancels a reply
 * by dropping the connection (leaving the chat, closing the explanation
 * sheet); without this, the model keeps generating, and billing, until the
 * reply ends. Listens on the response, not the request: a request emits
 * `close` as soon as its body has been read. The response also closes after a
 * normal finish, which `writableFinished` tells apart.
 */
export function abortOnDisconnect({
  reply,
  controller,
}: {
  reply: FastifyReply;
  controller: AbortController;
}) {
  reply.raw.once('close', () => {
    if (!reply.raw.writableFinished) {
      controller.abort();
    }
  });
}

// The subset of Anthropic's streaming message object that the routes read.
type ClaudeMessageStream = AsyncIterable<
  Anthropic.MessageStreamEvent | Anthropic.Beta.BetaRawMessageStreamEvent
> & {
  finalMessage(): Promise<{
    stop_reason: Anthropic.StopReason | Anthropic.Beta.BetaStopReason | null;
  }>;
};

/**
 * Turns a Claude message stream into the chat stream events. Only text blocks
 * are forwarded. The reply also holds thinking blocks (this model thinks by
 * default), which are Claude's internal reasoning and not part of the answer.
 * No tools are offered, so no other block types can appear.
 */
export async function* streamClaudeReply(
  stream: ClaudeMessageStream,
): AsyncGenerator<ChatStreamEvent> {
  for await (const event of stream) {
    if (event.type === 'content_block_start' && event.content_block.type === 'text') {
      yield { type: 'block_start', block: { type: 'text', text: event.content_block.text } };
    } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'text_delta', text: event.delta.text };
    }
  }

  const finalMessage = await stream.finalMessage();
  yield { type: 'message_end', stopReason: toChatStopReason(finalMessage.stop_reason) };
}

export function writeStreamEvent(body: PassThrough, event: ChatStreamEvent) {
  body.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function chatRoutes(app: FastifyInstance) {
  app.post<{ Body: ChatRequest }>(
    '/',
    { schema: { body: chatRequestBodySchema } },
    async (req, reply) => {
      const provider = resolveAiProvider(req.body.provider);
      const unavailableError = providerUnavailableError(provider);
      if (unavailableError) {
        return reply.code(500).send({ error: unavailableError });
      }

      const messages = withoutEmptyMessages(req.body.messages);
      // Claude Opus 5 doesn't accept a conversation that ends on an assistant
      // turn, so reject it here with a clear error instead of mid-stream.
      if (messages.at(-1)?.role !== 'user') {
        return reply.code(400).send({ error: 'The conversation must end with a user message' });
      }

      // A PassThrough piped via reply.send() keeps this on Fastify's normal reply
      // lifecycle (so the @fastify/cors onSend hook still runs on the streamed
      // response) while still letting us write chunks as they arrive from Claude.
      // reply.hijack() + reply.raw would skip that hook and break CORS.
      const body = new PassThrough();
      void reply
        .header('Content-Type', 'text/event-stream')
        .header('Cache-Control', 'no-cache')
        .send(body);

      const controller = new AbortController();
      abortOnDisconnect({ reply, controller });

      try {
        const events =
          provider === 'gemini'
            ? streamGeminiReply({
                client: geminiClient!,
                system: SYSTEM_PROMPT,
                messages,
                maxOutputTokens: 4096,
                signal: controller.signal,
              })
            : streamClaudeReply(
                anthropicClient!.messages.stream(
                  {
                    model: 'claude-opus-5',
                    max_tokens: 4096,
                    system: SYSTEM_PROMPT,
                    messages: toAnthropicMessages(messages),
                  },
                  { signal: controller.signal },
                ),
              );
        for await (const event of events) {
          writeStreamEvent(body, event);
        }
      } catch (err) {
        // Aborted because the client left; there's no one to tell.
        if (controller.signal.aborted) {
          return;
        }
        writeStreamEvent(body, {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        body.end();
      }
    },
  );
}
