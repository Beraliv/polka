import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
// Fixed salt for deriving a key from SMB_CONFIG_ENCRYPTION_KEY: this is a
// single application-level key, not a per-user password hash, so a static
// salt is an acceptable simplification here.
const KEY_DERIVATION_SALT = 'polka-smb-config-v1';

function keyFile(dir: string): string {
  return join(dir, 'key');
}

async function loadOrCreateKey(dir: string): Promise<Buffer> {
  const passphrase = process.env.SMB_CONFIG_ENCRYPTION_KEY;
  if (passphrase) {
    return scryptSync(passphrase, KEY_DERIVATION_SALT, KEY_LENGTH);
  }
  try {
    const hex = await readFile(keyFile(dir), 'utf-8');
    return Buffer.from(hex.trim(), 'hex');
  } catch {
    const key = randomBytes(KEY_LENGTH);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(keyFile(dir), key.toString('hex'), { mode: 0o600 });
    return key;
  }
}

export async function encryptSecret(dir: string, plaintext: string): Promise<string> {
  const key = await loadOrCreateKey(dir);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export async function decryptSecret(dir: string, payload: string): Promise<string> {
  const key = await loadOrCreateKey(dir);
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}
