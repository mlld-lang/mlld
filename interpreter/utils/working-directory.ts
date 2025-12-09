import path from 'path';
import type { ContentNodeArray, SourceLocation } from '@core/types';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { MlldError, ErrorSeverity } from '@core/errors';
import type { Environment } from '../env/Environment';

export interface WorkingDirectoryOptions {
  sourceLocation?: SourceLocation;
  directiveType?: string;
}

function createWorkingDirError(
  message: string,
  workingDirectory: string,
  env: Environment,
  options: WorkingDirectoryOptions
): MlldError {
  return new MlldError(message, {
    code: 'INVALID_WORKING_DIRECTORY',
    severity: ErrorSeverity.Recoverable,
    sourceLocation: options.sourceLocation,
    env,
    details: {
      workingDirectory,
      directiveType: options.directiveType
    }
  });
}

export async function resolveWorkingDirectory(
  workingDir: ContentNodeArray | string | undefined,
  env: Environment,
  options: WorkingDirectoryOptions = {}
): Promise<string | undefined> {
  if (!workingDir || (Array.isArray(workingDir) && workingDir.length === 0)) {
    return undefined;
  }

  const rawPath =
    typeof workingDir === 'string'
      ? workingDir
      : await interpolate(workingDir, env, InterpolationContext.FilePath);

  const candidate = rawPath.trim();
  if (!candidate) {
    throw createWorkingDirError('Working directory cannot be empty.', candidate, env, options);
  }

  if (candidate.startsWith('~')) {
    throw createWorkingDirError('Working directory cannot use "~" expansion.', candidate, env, options);
  }

  if (/^[a-zA-Z]:[\\/]/.test(candidate) || candidate.startsWith('\\\\')) {
    throw createWorkingDirError('Working directory must use absolute Unix-style paths.', candidate, env, options);
  }

  if (!path.posix.isAbsolute(candidate)) {
    throw createWorkingDirError('Working directory must start with "/".', candidate, env, options);
  }

  const normalized = path.posix.normalize(candidate);
  const fs = env.getFileSystemService();

  if (!(await fs.exists(normalized))) {
    throw createWorkingDirError('Working directory does not exist.', normalized, env, options);
  }

  const isDirectory = await fs.isDirectory(normalized);
  if (!isDirectory) {
    throw createWorkingDirError('Working directory must be a directory.', normalized, env, options);
  }

  return normalized;
}
