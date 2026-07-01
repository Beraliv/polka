import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { smbRoutes } from './routes/smb.ts';
import { progressRoutes } from './routes/progress.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// @marsaud/smb2 uses ntlm which can throw synchronously in callbacks outside
// the route try/catch. Log and continue rather than crashing the server.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (SMB/NTLM):', err.message);
});

const app = Fastify({ logger: { level: 'info' } });

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map((s) => s.trim())
  : [];

await app.register(cors, {
  origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  methods: ['GET', 'POST', 'OPTIONS'],
});

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
