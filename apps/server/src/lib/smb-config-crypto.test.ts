import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

let tempDir: string;

async function loadCrypto() {
  return import('./smb-config-crypto.ts');
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'polka-smb-crypto-'));
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext value', async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto();

    const ciphertext = await encryptSecret(tempDir, 'super-secret-password');

    expect(ciphertext).not.toContain('super-secret-password');
    await expect(decryptSecret(tempDir, ciphertext)).resolves.toBe('super-secret-password');
  });

  it('decrypting the same ciphertext twice produces the same result', async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto();

    const ciphertext = await encryptSecret(tempDir, 'super-secret-password');

    const first = await decryptSecret(tempDir, ciphertext);
    const second = await decryptSecret(tempDir, ciphertext);

    expect(first).toBe('super-secret-password');
    expect(second).toBe('super-secret-password');
    expect(first).toBe(second);
  });

  it('produces different ciphertext for the same plaintext (random IV)', async () => {
    const { encryptSecret } = await loadCrypto();

    const first = await encryptSecret(tempDir, 'super-secret-password');
    const second = await encryptSecret(tempDir, 'super-secret-password');

    expect(first).not.toBe(second);
  });

  it('auto-generates and persists a key file when no env key is set', async () => {
    const { encryptSecret } = await loadCrypto();

    await encryptSecret(tempDir, 'super-secret-password');

    const keyHex = await readFile(join(tempDir, 'key'), 'utf-8');
    expect(keyHex.trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reuses the persisted key across calls so previously encrypted values still decrypt', async () => {
    const { encryptSecret } = await loadCrypto();

    const ciphertext = await encryptSecret(tempDir, 'super-secret-password');
    vi.resetModules();
    const { decryptSecret: decryptAfterReload } = await import('./smb-config-crypto.ts');

    await expect(decryptAfterReload(tempDir, ciphertext)).resolves.toBe('super-secret-password');
  });

  it('prefers SMB_CONFIG_ENCRYPTION_KEY over the local key file when set', async () => {
    const { encryptSecret } = await loadCrypto();
    vi.stubEnv('SMB_CONFIG_ENCRYPTION_KEY', 'operator-supplied-passphrase');

    const ciphertext = await encryptSecret(tempDir, 'super-secret-password');

    // No key file should be written when an operator key is supplied.
    await expect(readFile(join(tempDir, 'key'), 'utf-8')).rejects.toThrow();

    vi.resetModules();
    vi.stubEnv('SMB_CONFIG_ENCRYPTION_KEY', 'operator-supplied-passphrase');
    const { decryptSecret: decryptWithSameKey } = await import('./smb-config-crypto.ts');
    await expect(decryptWithSameKey(tempDir, ciphertext)).resolves.toBe('super-secret-password');
  });

  it('fails to decrypt when the env key changes between encrypt and decrypt', async () => {
    const { encryptSecret } = await loadCrypto();
    vi.stubEnv('SMB_CONFIG_ENCRYPTION_KEY', 'first-passphrase');

    const ciphertext = await encryptSecret(tempDir, 'super-secret-password');

    vi.resetModules();
    vi.stubEnv('SMB_CONFIG_ENCRYPTION_KEY', 'different-passphrase');
    const { decryptSecret: decryptWithWrongKey } = await import('./smb-config-crypto.ts');

    await expect(decryptWithWrongKey(tempDir, ciphertext)).rejects.toThrow();
  });

  it('fails to decrypt tampered ciphertext (authentication failure)', async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto();

    const ciphertext = await encryptSecret(tempDir, 'super-secret-password');
    const tampered = Buffer.from(ciphertext, 'base64');
    tampered[tampered.length - 1] ^= 0xff;

    await expect(decryptSecret(tempDir, tampered.toString('base64'))).rejects.toThrow();
  });
});
