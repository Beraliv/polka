import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { SMBConfig } from '@polka/shared';

let tempDir: string;

const testConnectionMock = vi.fn();
const listFilesMock = vi.fn();
const readFileMock = vi.fn();

vi.mock('../lib/smb-client.ts', () => ({
  testConnection: (...args: unknown[]) => testConnectionMock(...args),
  listFiles: (...args: unknown[]) => listFilesMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
}));

const config: SMBConfig = {
  ip: '192.168.1.10',
  port: 445,
  username: 'reader',
  password: 'secret',
  share: 'books',
};

async function buildApp(): Promise<FastifyInstance> {
  const { smbRoutes } = await import('./smb.ts');
  const app = Fastify();
  await app.register(smbRoutes, { prefix: '/api/smb' });
  return app;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'polka-smb-routes-'));
  vi.stubEnv('SMB_CONFIG_PATH', tempDir);
  vi.resetModules();
  testConnectionMock.mockReset();
  listFilesMock.mockReset();
  readFileMock.mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});

describe('GET /api/smb/config', () => {
  it('returns 404 when nothing is persisted', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/smb/config' });
    expect(res.statusCode).toBe(404);
  });

  it('returns the summary, without a password, after a config is saved', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/api/smb/config', payload: config });
    const res = await app.inject({ method: 'GET', url: '/api/smb/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ip: config.ip,
      port: config.port,
      username: config.username,
      share: config.share,
    });
  });
});

describe('POST /api/smb/config', () => {
  it('saves a new config and returns its summary without a password', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/smb/config', payload: config });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('password');
  });

  it('rejects when no password is available', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/smb/config',
      payload: { ip: config.ip, username: config.username, share: config.share },
    });
    expect(res.statusCode).toBe(400);
  });

  it('keeps the previous password when saving with a blank password', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/api/smb/config', payload: config });
    const res = await app.inject({
      method: 'POST',
      url: '/api/smb/config',
      payload: { ip: '10.0.0.5', username: config.username, share: config.share },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ip: '10.0.0.5',
      port: config.port,
      username: config.username,
      share: config.share,
    });

    testConnectionMock.mockResolvedValue(undefined);
    const testRes = await app.inject({ method: 'POST', url: '/api/smb/test', payload: {} });
    expect(testRes.statusCode).toBe(200);
    expect(testConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ password: config.password }),
    );
  });
});

describe('DELETE /api/smb/config', () => {
  it('deletes the config and is idempotent', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/api/smb/config', payload: config });
    const first = await app.inject({ method: 'DELETE', url: '/api/smb/config' });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({ method: 'DELETE', url: '/api/smb/config' });
    expect(second.statusCode).toBe(204);
    const getRes = await app.inject({ method: 'GET', url: '/api/smb/config' });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('POST /api/smb/test', () => {
  it('returns 400 when nothing is configured and no body is provided', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/smb/test', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('tests the persisted config when the body is empty', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/api/smb/config', payload: config });
    testConnectionMock.mockResolvedValue(undefined);
    const res = await app.inject({ method: 'POST', url: '/api/smb/test', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(testConnectionMock).toHaveBeenCalledWith(config);
  });
});

describe('POST /api/smb/files', () => {
  it('returns 400 when NAS is not configured', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/smb/files', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('lists files using the persisted config', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/api/smb/config', payload: config });
    listFilesMock.mockResolvedValue([{ name: 'book.epub', path: 'book.epub', isDirectory: false }]);
    const res = await app.inject({ method: 'POST', url: '/api/smb/files', payload: { path: '' } });
    expect(res.statusCode).toBe(200);
    expect(listFilesMock).toHaveBeenCalledWith(config, '');
  });
});

describe('POST /api/smb/file', () => {
  it('returns 400 when path is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/smb/file', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when NAS is not configured', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/smb/file',
      payload: { path: 'book.epub' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('streams the file using the persisted config', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/api/smb/config', payload: config });
    readFileMock.mockResolvedValue(Buffer.from('data'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/smb/file',
      payload: { path: 'book.epub' },
    });
    expect(res.statusCode).toBe(200);
    expect(readFileMock).toHaveBeenCalledWith(config, 'book.epub');
  });
});
