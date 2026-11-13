import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { buildExplainPrompt, explainRoutes } from './explain.ts';

describe('buildExplainPrompt', () => {
  it('names the book, author and language, and wraps the passage', () => {
    expect(
      buildExplainPrompt({
        passage: '  Все смешалось в доме Облонских.  ',
        bookName: 'Анна Каренина',
        author: 'Лев Толстой',
        language: 'es',
      }),
    ).toBe(
      [
        'Book: Анна Каренина',
        'Author: Лев Толстой',
        'Explain in: Spanish',
        '',
        '<passage>\nВсе смешалось в доме Облонских.\n</passage>',
      ].join('\n'),
    );
  });

  it('says unknown for a missing author or book name', () => {
    expect(buildExplainPrompt({ passage: 'Text.', bookName: ' ', language: 'en' })).toContain(
      'Book: unknown\nAuthor: unknown\n',
    );
  });
});

describe('POST /api/explain', () => {
  async function postExplain(body: object) {
    const app = Fastify();
    await app.register(explainRoutes, { prefix: '/api/explain' });
    return app.inject({ method: 'POST', url: '/api/explain', payload: body });
  }

  it('rejects a language outside the supported list', async () => {
    const response = await postExplain({ passage: 'Text.', bookName: 'Book', language: 'xx' });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an empty passage', async () => {
    const response = await postExplain({ passage: '', bookName: 'Book', language: 'en' });

    expect(response.statusCode).toBe(400);
  });
});
