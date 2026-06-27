import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { smbRoutes } from './routes/smb.ts';
import { progressRoutes } from './routes/progress.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: { level: 'info' } });

await app.register(cors, { origin: true });

// Serve client build in production
const clientBuildPath = join(__dirname, '../../client/dist');
await app.register(staticFiles, {
  root: clientBuildPath,
  wildcard: false,
});

await app.register(smbRoutes, { prefix: '/api/smb' });
await app.register(progressRoutes, { prefix: '/api/progress' });

// SPA fallback — serve index.html for unknown routes in production
app.setNotFoundHandler(async (_req, reply) => {
  return reply.sendFile('index.html');
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });
console.log(`Server listening on http://${host}:${port}`);
