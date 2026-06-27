import type { FastifyInstance } from 'fastify';
import type { SMBConfig } from '@polka/shared';
import { testConnection, listFiles, readFile } from '../lib/smb-client.ts';

type SmbBody = SMBConfig & { path?: string };

export async function smbRoutes(app: FastifyInstance) {
  app.post<{ Body: SmbBody }>('/test', async (req, reply) => {
    try {
      await testConnection(req.body);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      return reply.code(400).send({ error: String(err) });
    }
  });

  app.post<{ Body: SmbBody }>('/files', async (req, reply) => {
    try {
      const path = req.body.path ?? '';
      const files = await listFiles(req.body, path);
      return reply.send(files);
    } catch (err) {
      return reply.code(400).send({ error: String(err) });
    }
  });

  app.post<{ Body: SmbBody }>('/file', async (req, reply) => {
    const path = req.body.path ?? '';
    if (!path) return reply.code(400).send({ error: 'path required' });
    try {
      const buffer = await readFile(req.body, path);
      const ext = path.toLowerCase().split('.').pop();
      const mime = ext === 'epub' ? 'application/epub+zip' : 'application/octet-stream';
      reply.header('Content-Type', mime);
      reply.header('Content-Disposition', `attachment; filename="${path.split('\\').pop()}"`);
      return reply.send(buffer);
    } catch (err) {
      return reply.code(400).send({ error: String(err) });
    }
  });
}
