import type { FastifyInstance } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { PassThrough } from 'stream';
import {
  SUPPORTED_CHAT_CONTENT_BLOCK_TYPES,
  type ChatContentBlock,
  type ChatContentBlockType,
  type ChatMessage,
  type ChatRequest,
  type ChatStopReason,
  type ChatStreamEvent,
} from '@polka/shared';

const SYSTEM_PROMPT =
  'You are a helpful assistant built into Polka, a personal e-book reader app. Be concise and friendly. ' +
  'The chat UI renders plain text only, so never use markdown formatting (no **bold**, no # headings, no bullet/numbered lists with - or *).';

// Constructed once at startup — the SDK reads ANTHROPIC_API_KEY from the
// environment itself, so a missing key is only detectable by trying.
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

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
// cut short) are dropped because the API rejects empty text blocks and
// messages with no content.
export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.flatMap(({ role, content }) => {
    const blocks = content.filter((block) => !isEmptyBlock(block)).map(toAnthropicBlock);
    return blocks.length > 0 ? [{ role, content: blocks }] : [];
  });
}

export function toChatStopReason(stopReason: Anthropic.StopReason | null): ChatStopReason {
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

function writeStreamEvent(body: PassThrough, event: ChatStreamEvent) {
  body.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function chatRoutes(app: FastifyInstance) {
  app.post<{ Body: ChatRequest }>(
    '/',
    { schema: { body: chatRequestBodySchema } },
    async (req, reply) => {
      if (!client) {
        return reply.code(500).send({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
      }

      const messages = toAnthropicMessages(req.body.messages);
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

      try {
        const stream = client.messages.stream({
          model: 'claude-opus-5',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages,
        });

        for await (const event of stream) {
          // Only text blocks are forwarded. The reply also holds thinking blocks
          // (this model thinks by default), which are Claude's internal reasoning
          // and not part of the answer. No tools are offered, so no other block
          // types can appear.
          if (event.type === 'content_block_start' && event.content_block.type === 'text') {
            writeStreamEvent(body, {
              type: 'block_start',
              block: { type: 'text', text: event.content_block.text },
            });
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            writeStreamEvent(body, { type: 'text_delta', text: event.delta.text });
          }
        }

        const finalMessage = await stream.finalMessage();
        writeStreamEvent(body, {
          type: 'message_end',
          stopReason: toChatStopReason(finalMessage.stop_reason),
        });
      } catch (err) {
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
