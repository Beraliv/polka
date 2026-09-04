import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import type { SMBConfig, SMBConfigSummary } from '@polka/shared';
import { encryptSecret, decryptSecret } from './smb-config-crypto.ts';

const SMB_CONFIG_DIR = process.env.SMB_CONFIG_PATH ?? join(process.cwd(), 'data', 'smb');

// The password never touches disk in raw form — it's AES-256-GCM encrypted
// with encryptSecret/decryptSecret before being written here.
type PersistedSMBConfig = Omit<SMBConfig, 'password'> & { encryptedPassword: string };

function configFile(): string {
  return join(SMB_CONFIG_DIR, 'config.json');
}

async function ensureDir() {
  await mkdir(SMB_CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export async function readSMBConfig(): Promise<SMBConfig | null> {
  let data: string;
  try {
    data = await readFile(configFile(), 'utf-8');
  } catch {
    return null;
  }
  const { encryptedPassword, ...rest } = JSON.parse(data) as PersistedSMBConfig;
  const password = await decryptSecret(SMB_CONFIG_DIR, encryptedPassword);
  return { ...rest, password };
}

export async function writeSMBConfig(config: SMBConfig): Promise<void> {
  await ensureDir();
  const { password, ...rest } = config;
  const encryptedPassword = await encryptSecret(SMB_CONFIG_DIR, password);
  const persisted: PersistedSMBConfig = { ...rest, encryptedPassword };
  await writeFile(configFile(), JSON.stringify(persisted, null, 2), { mode: 0o600 });
}

export async function deleteSMBConfigFile(): Promise<void> {
  try {
    await unlink(configFile());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

export function toSummary(config: SMBConfig): SMBConfigSummary {
  const { password: _password, ...summary } = config;
  return summary;
}

type ResolveSMBConfigOptions = {
  incoming?: Partial<SMBConfig>;
  persisted: SMBConfig | null;
  defaults?: Omit<SMBConfig, 'password'>;
};

export function resolveSMBConfig({
  incoming,
  persisted,
  defaults = {
    ip: '',
    port: 445,
    username: '',
    share: '',
  },
}: ResolveSMBConfigOptions): SMBConfig | null {
  const password = incoming?.password || persisted?.password;
  if (!password) {
    return null;
  }
  return {
    ip: incoming?.ip || persisted?.ip || defaults.ip,
    port: incoming?.port || persisted?.port || defaults.port,
    username: incoming?.username || persisted?.username || defaults.username,
    share: incoming?.share || persisted?.share || defaults.share,
    password,
  };
}
