import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const routesDirectory = dirname(fileURLToPath(import.meta.url));

// Resolves to apps/server/package.json from src/routes, dist/routes, and the
// Docker image alike, since all keep the same depth below the package root.
const { version: serverVersion } = JSON.parse(
  readFileSync(join(routesDirectory, '../../package.json'), 'utf-8'),
) as { version: string };

export async function versionRoutes(app: FastifyInstance) {
  app.get('/', async () => ({ version: serverVersion }));
}
