import { join } from 'node:path';
import { createSigContext } from '@disreguard/sig';
import type { ContentVerifyResult, SigContext, SigFS } from '@disreguard/sig';
import type { Environment } from '@interpreter/env/Environment';
import type { IFileSystemService } from '@services/fs/IFileSystemService';

export interface NormalizedVerifyResult {
  verified: boolean;
  template?: string;
  hash?: string;
  signedBy?: string;
  signedAt?: string;
  error?: string;
}

function makeEnoent(path: string, operation: string): Error {
  const error = new Error(`ENOENT: no such file or directory, ${operation} '${path}'`) as Error & {
    code?: string;
    path?: string;
  };
  error.code = 'ENOENT';
  error.path = path;
  return error;
}

export function createSigFS(fs: IFileSystemService): SigFS {
  return {
    async readFile(path: string, _encoding: 'utf8'): Promise<string> {
      return fs.readFile(path);
    },
    async writeFile(path: string, content: string, _encoding: 'utf8'): Promise<void> {
      await fs.writeFile(path, content);
    },
    async appendFile(path: string, content: string, _encoding: 'utf8'): Promise<void> {
      await fs.appendFile(path, content);
    },
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      await fs.mkdir(path, options);
    },
    async readdir(path: string, _options: { withFileTypes: true }) {
      const names = await fs.readdir(path);
      return await Promise.all(
        names.map(async (name) => {
          const isDirectory = await fs.isDirectory(join(path, name));
          return {
            name,
            isDirectory: (): boolean => isDirectory,
          };
        })
      );
    },
    async unlink(path: string): Promise<void> {
      if (fs.unlink) {
        await fs.unlink(path);
        return;
      }
      if (fs.rm) {
        await fs.rm(path);
        return;
      }
      throw makeEnoent(path, 'unlink');
    },
    async access(path: string): Promise<void> {
      if (fs.access) {
        await fs.access(path);
        return;
      }
      const exists = await fs.exists(path);
      if (!exists) {
        throw makeEnoent(path, 'access');
      }
    },
  };
}

export function createSigContextForEnv(env: Environment): SigContext {
  return createSigContext(env.getProjectRoot(), {
    fs: createSigFS(env.getFileSystemService()),
  });
}

export function normalizeContentVerifyResult(result: ContentVerifyResult): NormalizedVerifyResult {
  if (!result.verified) {
    return {
      verified: false,
      error: result.error || 'Verification failed',
    };
  }

  return {
    verified: true,
    ...(result.content !== undefined ? { template: result.content } : {}),
    ...(result.signature?.hash ? { hash: result.signature.hash } : {}),
    ...(result.signature?.signedBy ? { signedBy: result.signature.signedBy } : {}),
    ...(result.signature?.signedAt ? { signedAt: result.signature.signedAt } : {}),
  };
}
