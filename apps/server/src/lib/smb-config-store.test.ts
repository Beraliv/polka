import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { SMBConfig } from '@polka/shared';

let tempDir: string;

async function loadStore() {
  return import('./smb-config-store.ts');
}

const config: SMBConfig = {
  ip: '192.168.1.10',
  port: 445,
  username: 'reader',
  password: 'secret',
  share: 'books',
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'polka-smb-config-'));
  vi.stubEnv('SMB_CONFIG_PATH', tempDir);
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});

describe('readSMBConfig / writeSMBConfig / deleteSMBConfigFile', () => {
  it('returns null when nothing is persisted', async () => {
    const { readSMBConfig } = await loadStore();
    await expect(readSMBConfig()).resolves.toBeNull();
  });

  it('round-trips a config through write, read and delete', async () => {
    const { readSMBConfig, writeSMBConfig, deleteSMBConfigFile } = await loadStore();
    await writeSMBConfig(config);
    await expect(readSMBConfig()).resolves.toEqual(config);
    await deleteSMBConfigFile();
    await expect(readSMBConfig()).resolves.toBeNull();
  });

  it('is idempotent when deleting with nothing persisted', async () => {
    const { deleteSMBConfigFile } = await loadStore();
    await expect(deleteSMBConfigFile()).resolves.toBeUndefined();
  });
});

describe('encryption at rest', () => {
  it('never writes the password in raw form to config.json', async () => {
    const { writeSMBConfig } = await loadStore();
    await writeSMBConfig(config);

    const raw = await readFile(join(tempDir, 'config.json'), 'utf-8');

    expect(raw).not.toContain(config.password);
    expect(raw).toContain('encryptedPassword');
    expect(JSON.parse(raw)).not.toHaveProperty('password');
  });

  it('persists a local key file so an auto-generated key survives a restart', async () => {
    const { writeSMBConfig, readSMBConfig } = await loadStore();
    await writeSMBConfig(config);

    const keyHex = await readFile(join(tempDir, 'key'), 'utf-8');
    expect(keyHex.trim()).toMatch(/^[0-9a-f]{64}$/);

    vi.resetModules();
    const { readSMBConfig: readAfterRestart } = await import('./smb-config-store.ts');
    await expect(readAfterRestart()).resolves.toEqual(config);
    await expect(readSMBConfig()).resolves.toEqual(config);
  });

  it('fails to decrypt when config.json is tampered with', async () => {
    const { writeSMBConfig, readSMBConfig } = await loadStore();
    await writeSMBConfig(config);

    const configPath = join(tempDir, 'config.json');
    const persisted = JSON.parse(await readFile(configPath, 'utf-8')) as {
      encryptedPassword: string;
    };
    persisted.encryptedPassword = Buffer.from('tampered-ciphertext').toString('base64');
    const { writeFile } = await import('fs/promises');
    await writeFile(configPath, JSON.stringify(persisted));

    await expect(readSMBConfig()).rejects.toThrow();
  });
});

describe('toSummary', () => {
  it('strips the password', async () => {
    const { toSummary } = await loadStore();
    expect(toSummary(config)).toEqual({
      ip: config.ip,
      port: config.port,
      username: config.username,
      share: config.share,
    });
  });
});

describe('resolveSMBConfig', () => {
  it('builds a full config when a password is provided', async () => {
    const { resolveSMBConfig } = await loadStore();
    expect(resolveSMBConfig({ incoming: config, persisted: null })).toEqual(config);
  });

  it('keeps the persisted password and applies overrides when the incoming password is blank', async () => {
    const { resolveSMBConfig } = await loadStore();
    const result = resolveSMBConfig({
      incoming: { ip: '10.0.0.5', password: '' },
      persisted: config,
    });
    expect(result).toEqual({ ...config, ip: '10.0.0.5' });
  });

  it('returns null when the password is blank and nothing is persisted', async () => {
    const { resolveSMBConfig } = await loadStore();
    expect(resolveSMBConfig({ incoming: { ip: '10.0.0.5' }, persisted: null })).toBeNull();
  });
});
