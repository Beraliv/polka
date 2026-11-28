import type { FastifyInstance } from 'fastify';
import type { AiProvidersResponse } from '@polka/shared';
import { listConfiguredAiProviders } from '../lib/ai-provider.ts';

export async function aiProvidersRoutes(app: FastifyInstance) {
  app.get('/', async (): Promise<AiProvidersResponse> => ({
    providers: listConfiguredAiProviders(),
  }));
}
