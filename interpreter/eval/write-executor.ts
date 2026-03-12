import * as path from 'path';
import type { SourceLocation } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { Environment } from '@interpreter/env/Environment';
import { enforceFileIntegrity, enforceFilesystemAccess } from '@interpreter/policy/filesystem-policy';
import { logFileWriteEvent } from '@interpreter/utils/audit-log';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import { VirtualFS } from '@services/fs/VirtualFS';

export type WriteMode = 'write' | 'append';

export interface ExecuteWriteOptions {
  env: Environment;
  targetPath: string;
  content: string;
  mode?: WriteMode;
  sourceLocation?: SourceLocation;
  descriptor?: SecurityDescriptor;
  fileSystem?: IFileSystemService;
  metadata?: Record<string, unknown>;
}

function resolveWriteFileSystem(
  env: Environment,
  explicitFileSystem?: IFileSystemService
): IFileSystemService {
  if (explicitFileSystem) {
    return explicitFileSystem;
  }

  const workspaceFs = env.getActiveWorkspace()?.fs;
  if (workspaceFs) {
    return workspaceFs;
  }

  return env.getFileSystemService();
}

async function ensureDirectoryExists(
  fileSystem: IFileSystemService,
  targetPath: string
): Promise<void> {
  const dirPath = path.dirname(targetPath);
  try {
    await fileSystem.mkdir(dirPath, { recursive: true });
  } catch {
    // Directory may already exist.
  }
}

export async function executeWrite({
  env,
  targetPath,
  content,
  mode = 'write',
  sourceLocation,
  descriptor,
  fileSystem,
  metadata
}: ExecuteWriteOptions): Promise<void> {
  enforceFilesystemAccess(env, 'write', targetPath, sourceLocation);
  enforceFileIntegrity(env, targetPath, env.getSignerIdentity(), sourceLocation);

  const targetFileSystem = resolveWriteFileSystem(env, fileSystem);
  const hostFileSystem = env.getFileSystemService();
  const suppressDefaultHostEffectWrite = targetFileSystem !== hostFileSystem;
  const existedBefore = await targetFileSystem.exists(targetPath).catch(() => false);
  await ensureDirectoryExists(targetFileSystem, targetPath);

  if (mode === 'append') {
    await targetFileSystem.appendFile(targetPath, content);
  } else {
    await targetFileSystem.writeFile(targetPath, content);
  }

  const changeType: 'created' | 'modified' = existedBefore ? 'modified' : 'created';
  const directiveName = typeof metadata?.directive === 'string' ? metadata.directive : undefined;
  const writer = directiveName ? `directive:${directiveName}` : undefined;

  await logFileWriteEvent(env, targetPath, descriptor, {
    changeType,
    writer
  });

  const sigService = env.getSigService();
  if (sigService) {
    const signingContext = {
      identity: env.getSignerIdentity(),
      taint: descriptorToInputTaint(descriptor)
    };

    if (targetFileSystem instanceof VirtualFS) {
      env.registerSigAwareFileSystem(targetFileSystem);
      if (!sigService.isExcluded(targetPath)) {
        targetFileSystem.setSigningContext(targetPath, signingContext);
      }
    } else if (
      env.canDirectlySignFileSystem(targetFileSystem) &&
      !sigService.isExcluded(targetPath)
    ) {
      await env.signFileIntegrity(targetPath, signingContext);
    }
  }

  env.emitEffect('file', content, {
    path: targetPath,
    source: sourceLocation,
    mode,
    metadata: {
      ...(metadata ?? {}),
      suppressDefaultHostEffectWrite
    }
  });
}
