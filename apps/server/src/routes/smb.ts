import type { FastifyInstance } from 'fastify';
import type { SMBConfig } from '@polka/shared';
import { testConnection, listFiles, readFile } from '../lib/smb-client.ts';
import {
  readSMBConfig,
  writeSMBConfig,
  deleteSMBConfigFile,
  resolveSMBConfig,
  toSummary,
} from '../lib/smb-config-store.ts';

type ConfigBody = Partial<SMBConfig>;
type PathBody = { path?: string };

export async function smbRoutes(app: FastifyInstance) {
  app.get('/config', async (_req, reply) => {
    const config = await readSMBConfig();
    if (!config) {
      return reply.code(404).send({ error: 'not configured' });
    }
    return reply.send(toSummary(config));
  });

  app.post<{ Body: ConfigBody }>('/config', async (req, reply) => {
    const persisted = await readSMBConfig();
    const resolved = resolveSMBConfig({ incoming: req.body, persisted });
    if (!resolved) {
      return reply.code(400).send({ error: 'password required' });
    }
    if (!resolved.ip || !resolved.username || !resolved.share) {
      return reply.code(400).send({ error: 'ip, username and share are required' });
    }
    await writeSMBConfig(resolved);
    return reply.send(toSummary(resolved));
  });

  app.delete('/config', async (_req, reply) => {
    await deleteSMBConfigFile();
    return reply.code(204).send();
  });

  app.post<{ Body: ConfigBody }>('/test', async (req, reply) => {
    try {
      const persisted = await readSMBConfig();
      const resolved = resolveSMBConfig({ incoming: req.body, persisted });
      if (!resolved) {
        return reply.code(400).send({ error: 'NAS not configured' });
      }
      await testConnection(resolved);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      return reply.code(400).send({ error: String(err) });
    }
  });

  app.post<{ Body: PathBody }>('/files', async (req, reply) => {
    try {
      const config = await readSMBConfig();
      if (!config) {
        return reply.code(400).send({ error: 'NAS not configured' });
      }
      const path = req.body.path ?? '';
      const files = await listFiles(config, path);
      return reply.send(files);
    } catch (err) {
      return reply.code(400).send({ error: String(err) });
    }
  });

  app.post<{ Body: PathBody }>('/file', async (req, reply) => {
    const path = req.body.path ?? '';
    if (!path) {
      return reply.code(400).send({ error: 'path required' });
    }
    try {
      const config = await readSMBConfig();
      if (!config) {
        return reply.code(400).send({ error: 'NAS not configured' });
      }
      const buffer = await readFile(config, path);
      const ext = path.toLowerCase().split('.').pop();
      const mime = ext === 'epub' ? 'application/epub+zip' : 'application/octet-stream';
      const filename = path.split('\\').pop() ?? '';
      const encodedFilename = encodeURIComponent(filename);
      reply.header('Content-Type', mime);
      reply.header(
        'Content-Disposition',
        `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodedFilename}`,
      );
      return reply.send(buffer);
    } catch (err) {
      return reply.code(400).send({ error: String(err) });
    }
  });
}
