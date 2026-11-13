import type { FastifyInstance } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { PassThrough } from 'stream';
import { EXPLANATION_LANGUAGES, type ExplainRequest } from '@polka/shared';
import { anthropicClient } from '../lib/anthropic-client.ts';
import { abortOnDisconnect, toChatStopReason, writeStreamEvent } from './chat.ts';

// Kept short, and asking for a short answer, because the reader is waiting:
// replies stream token by token, so output length decides how long it takes.
const SYSTEM_PROMPT =
  'You are built into Polka, an e-book reader. Explain the passage the reader selected: what it means and the ' +
  'context it needs from the book (who is speaking, what is happening, references, unusual or archaic words). ' +
  'If you do not know the book, say so in one sentence and explain the passage from its own text. Do not reveal ' +
  'anything that happens later in the book. Answer in the language the reader asks for, in at most two short ' +
  'paragraphs of plain text, without markdown.';

// A selection can't extend past the visible page(s), so even a two-page
// spread stays well under this; the limit only stops oversized requests.
const MAX_PASSAGE_LENGTH = 10_000;
const MAX_BOOK_FIELD_LENGTH = 500;

// Mirrors ExplainRequest.
const explainRequestBodySchema = {
  type: 'object',
  required: ['passage', 'bookName', 'language'],
  properties: {
    passage: { type: 'string', minLength: 1, maxLength: MAX_PASSAGE_LENGTH },
    bookName: { type: 'string', maxLength: MAX_BOOK_FIELD_LENGTH },
    author: { type: 'string', maxLength: MAX_BOOK_FIELD_LENGTH },
    language: { enum: EXPLANATION_LANGUAGES.map((language) => language.code) },
  },
} as const;

export function buildExplainPrompt({
  passage,
  bookName,
  author,
  language,
}: ExplainRequest): string {
  const languageName =
    EXPLANATION_LANGUAGES.find((candidate) => candidate.code === language)?.englishName ??
    'English'; // aligned with DEFAULT_EXPLANATION_LANGUAGE
  const bookLines = [
    `Book: ${bookName.trim() || 'unknown'}`,
    `Author: ${author?.trim() || 'unknown'}`,
  ];
  return [
    ...bookLines,
    `Explain in: ${languageName}`,
    '',
    `<passage>\n${passage.trim()}\n</passage>`,
  ].join('\n');
}

export async function explainRoutes(app: FastifyInstance) {
  app.post<{ Body: ExplainRequest }>(
    '/',
    { schema: { body: explainRequestBodySchema } },
    async (req, reply) => {
      if (!anthropicClient) {
        return reply.code(500).send({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
      }
      if (req.body.passage.trim() === '') {
        return reply.code(400).send({ error: 'The passage to explain is empty' });
      }

      // Streamed through a PassThrough for the same reason as the chat route:
      // it keeps the @fastify/cors onSend hook on the response.
      const body = new PassThrough();
      void reply
        .header('Content-Type', 'text/event-stream')
        .header('Cache-Control', 'no-cache')
        .send(body);

      try {
        const stream = anthropicClient.beta.messages.stream({
          model: 'claude-opus-5-5',
          // Opus at low effort won a blind comparison with Sonnet 5.5 (low)
          // and Haiku 5.5 (medium) on passages from Anna Karenina: it was
          // the only one that never misattributed a speaker or scene. Low
          // effort keeps thinking short, so 4,000 tokens leaves room for a
          // two-paragraph answer and caps the cost of a call at about $0.08.
          max_tokens: 4000,
          output_config: { effort: 'low' },
          // A passage from a novel can touch on violence or medicine; if a
          // safety classifier declines it, the API retries on a fallback
          // model instead of leaving the reader with nothing.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildExplainPrompt(req.body) }],
        });
        // Closing the sheet cancels the request; stop Claude with it.
        abortOnDisconnect({ reply, stream });

        // Only text is forwarded, as in the chat route: thinking blocks are
        // internal reasoning, and fallback blocks only mark where another
        // model took over.
        for await (const event of stream) {
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
        // Aborted because the client left; there's no one to tell.
        if (err instanceof Anthropic.APIUserAbortError) {
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
