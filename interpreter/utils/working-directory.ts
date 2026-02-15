import path from 'path';
import os from 'os';
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

  // Empty string or "." means "use current working directory"
  // This allows reusable functions where dir is optional
  if (!candidate || candidate === '.') {
    return undefined;
  }

  const expandedCandidate = candidate === '~' || candidate.startsWith('~/')
    ? path.join(os.homedir(), candidate === '~' ? '' : candidate.slice(2))
    : candidate;

  if (/^[a-zA-Z]:[\\/]/.test(expandedCandidate) || expandedCandidate.startsWith('\\\\')) {
    throw createWorkingDirError('Working directory must use absolute Unix-style paths.', expandedCandidate, env, options);
  }

  if (!path.posix.isAbsolute(expandedCandidate)) {
    throw createWorkingDirError('Working directory must start with "/".', expandedCandidate, env, options);
  }

  const normalized = path.posix.normalize(expandedCandidate);
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
