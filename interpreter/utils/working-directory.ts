import path from 'path';
import os from 'os';
import type { ContentNodeArray, SourceLocation } from '@core/types';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { MlldError, ErrorSeverity } from '@core/errors';
import type { Environment } from '../env/Environment';
import { resolveWorkspaceFromVariable } from './workspace-reference';

export interface WorkingDirectoryOptions {
  sourceLocation?: SourceLocation;
  directiveType?: string;
}

export type WorkingDirectoryResult =
  | { type: 'path'; path: string; workspacePushed: false }
  | { type: 'workspace'; workspacePushed: true }
  | { type: 'none'; workspacePushed: false };

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

async function validateAndNormalizeWorkingDirectory(
  candidate: string,
  env: Environment,
  options: WorkingDirectoryOptions
): Promise<string> {
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

function extractSingleVariableName(workingDir: ContentNodeArray | string | undefined): string | undefined {
  if (!Array.isArray(workingDir) || workingDir.length !== 1) {
    return undefined;
  }
  const node = workingDir[0] as Record<string, unknown> | undefined;
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  if (node.type === 'VariableReference' && typeof node.identifier === 'string') {
    return node.identifier;
  }
  if (
    node.type === 'VariableReferenceWithTail' &&
    node.variable &&
    typeof (node.variable as Record<string, unknown>).identifier === 'string'
  ) {
    return (node.variable as Record<string, unknown>).identifier as string;
  }
  if (node.type === 'TemplateVariable') {
    if (typeof node.identifier === 'string') {
      return node.identifier;
    }
    if (typeof node.name === 'string') {
      return node.name;
    }
  }
  return undefined;
}

export async function resolveWorkingDirectory(
  workingDir: ContentNodeArray | string | undefined,
  env: Environment,
  options: WorkingDirectoryOptions = {}
): Promise<WorkingDirectoryResult> {
  if (!workingDir || (Array.isArray(workingDir) && workingDir.length === 0)) {
    return { type: 'none', workspacePushed: false };
  }

  const variableName = extractSingleVariableName(workingDir);
  if (variableName) {
    const workspace = await resolveWorkspaceFromVariable(variableName, env);
    if (workspace) {
      env.pushActiveWorkspace(workspace);
      return { type: 'workspace', workspacePushed: true };
    }
  }

  const rawPath =
    typeof workingDir === 'string'
      ? workingDir
      : await interpolate(workingDir, env, InterpolationContext.FilePath);

  const candidate = rawPath.trim();

  // Empty string or "." means "use current working directory"
  // This allows reusable functions where dir is optional
  if (!candidate || candidate === '.') {
    return { type: 'none', workspacePushed: false };
  }

  const normalized = await validateAndNormalizeWorkingDirectory(candidate, env, options);
  return {
    type: 'path',
    path: normalized,
    workspacePushed: false
  };
}

export async function executeInWorkingDirectory<T>(
  workingDir: ContentNodeArray | string | undefined,
  env: Environment,
  execute: (resolvedPath?: string) => Promise<T>,
  options: WorkingDirectoryOptions = {}
): Promise<T> {
  const resolved = await resolveWorkingDirectory(workingDir, env, options);
  try {
    const resolvedPath = resolved.type === 'path' ? resolved.path : undefined;
    return await execute(resolvedPath);
  } finally {
    if (resolved.workspacePushed) {
      env.popActiveWorkspace();
    }
  }
}
