import type { FastifyInstance } from 'fastify';
import { PassThrough } from 'stream';
import { AI_PROVIDERS, EXPLANATION_LANGUAGES, type ExplainRequest } from '@polka/shared';
import { anthropicClient } from '../lib/anthropic-client.ts';
import { geminiClient } from '../lib/gemini-client.ts';
import { streamGeminiReply } from '../lib/gemini-reply.ts';
import {
  EXPLAIN_GEMINI_SETUP,
  EXPLAIN_MAX_OUTPUT_TOKENS,
  EXPLAIN_CLAUDE_SETUP,
  EXPLAIN_SYSTEM_PROMPT,
  buildClaudeExplainParams,
  buildExplainPrompt,
} from '../lib/explain-settings.ts';
import { providerUnavailableError, resolveAiProvider } from '../lib/ai-provider.ts';
import { abortOnDisconnect, streamClaudeReply, writeStreamEvent } from './chat.ts';

// A selection can't extend past the visible page(s), so even a two-page
// spread stays well under this; the limit only stops oversized requests.
const MAX_PASSAGE_LENGTH = 10_000;
const MAX_BOOK_FIELD_LENGTH = 500;

// Mirrors ExplainRequest.
const explainRequestBodySchema = {
  type: 'object',
  required: ['passage', 'bookName', 'language'],
  properties: {
    provider: { enum: AI_PROVIDERS.map((provider) => provider.code) },
    passage: { type: 'string', minLength: 1, maxLength: MAX_PASSAGE_LENGTH },
    bookName: { type: 'string', maxLength: MAX_BOOK_FIELD_LENGTH },
    author: { type: 'string', maxLength: MAX_BOOK_FIELD_LENGTH },
    language: { enum: EXPLANATION_LANGUAGES.map((language) => language.code) },
  },
} as const;

export async function explainRoutes(app: FastifyInstance) {
  app.post<{ Body: ExplainRequest }>(
    '/',
    { schema: { body: explainRequestBodySchema } },
    async (req, reply) => {
      const provider = resolveAiProvider(req.body.provider);
      const unavailableError = providerUnavailableError(provider);
      if (unavailableError) {
        return reply.code(500).send({ error: unavailableError });
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

      const controller = new AbortController();
      // Closing the sheet cancels the request; stop the model with it.
      abortOnDisconnect({ reply, controller });

      try {
        const prompt = buildExplainPrompt(req.body);
        const events =
          provider === 'gemini'
            ? streamGeminiReply({
                client: geminiClient!,
                system: EXPLAIN_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
                maxOutputTokens: EXPLAIN_MAX_OUTPUT_TOKENS,
                model: EXPLAIN_GEMINI_SETUP.model,
                thinkingLevel: EXPLAIN_GEMINI_SETUP.thinkingLevel,
                signal: controller.signal,
              })
            : streamClaudeReply(
                anthropicClient!.beta.messages.stream(
                  buildClaudeExplainParams({ prompt, setup: EXPLAIN_CLAUDE_SETUP }),
                  { signal: controller.signal },
                ),
              );
        // Only text is forwarded, as in the chat route: fallback blocks only
        // mark where another model took over.
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
