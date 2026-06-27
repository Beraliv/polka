import type { FastifyInstance } from 'fastify';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { Progress } from '@polka/shared';

const PROGRESS_DIR = process.env.PROGRESS_PATH ?? join(process.cwd(), 'data', 'progress');

async function ensureDir() {
  await mkdir(PROGRESS_DIR, { recursive: true });
}

function progressFile(bookId: string): string {
  return join(PROGRESS_DIR, `${bookId}.json`);
}

export async function progressRoutes(app: FastifyInstance) {
  app.post<{ Body: Progress }>('/', async (req, reply) => {
    try {
      await ensureDir();
      await writeFile(progressFile(req.body.bookId), JSON.stringify(req.body, null, 2));
      return reply.code(204).send();
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  app.get<{ Params: { bookId: string } }>('/:bookId', async (req, reply) => {
    try {
      const data = await readFile(progressFile(req.params.bookId), 'utf-8');
      return reply.send(JSON.parse(data));
    } catch {
      return reply.code(404).send({ error: 'not found' });
    }
  });
}
