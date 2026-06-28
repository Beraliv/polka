import SMB2Pkg from '@marsaud/smb2';
import type { SMBConfig, FileEntry } from '@polka/shared';

// @marsaud/smb2 is CJS; unwrap the default for ESM interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SMB2 = (SMB2Pkg as any).default ?? SMB2Pkg;

function createClient(config: SMBConfig) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return new SMB2({
    share: `\\\\${config.ip}\\${config.share}`,
    domain: '',
    username: config.username,
    password: config.password,
    port: config.port,
    autoCloseTimeout: 10000,
  });
}

export async function testConnection(config: SMBConfig): Promise<void> {
  const smb = createClient(config);
  try {
    await smb.readdir('');
  } finally {
    smb.disconnect();
  }
}

export async function listFiles(config: SMBConfig, path: string): Promise<FileEntry[]> {
  const smb = createClient(config);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = await smb.readdir(path, { stats: true }) as any[];
    return entries.map((entry) => ({
      name: entry.name as string,
      path: path ? `${path}\\${(entry.name as string)}` : (entry.name as string),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      isDirectory: entry.isDirectory() as boolean,
    }));
  } finally {
    smb.disconnect();
  }
}

export async function readFile(config: SMBConfig, path: string): Promise<Buffer> {
  const smb = createClient(config);
  try {
    return await smb.readFile(path);
  } finally {
    smb.disconnect();
  }
}
