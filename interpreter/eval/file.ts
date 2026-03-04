import path from 'node:path';
import type { BaseMlldNode } from '@core/types';
import type { FileDirectiveNode, FilesDirectiveNode } from '@core/types/file';
import type { WorkspaceValue } from '@core/types/workspace';
import { createObjectVariable } from '@core/types/variable';
import { isWorkspaceValue } from '@core/types/workspace';
import { MlldDirectiveError } from '@core/errors';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { evaluate, interpolate } from '../core/interpreter';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { asData, isStructuredValue } from '../utils/structured-value';
import { materializeDisplayValue } from '../utils/display-materialization';
import { executeWrite } from './write-executor';

const WORKSPACE_VARIABLE_SOURCE = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
} as const;

const projectedWorkspacePaths = new WeakMap<VirtualFS, Set<string>>();

interface ParsedProjectionTarget {
  type: 'path' | 'resolver';
  path?: BaseMlldNode[];
  resolver?: string;
  resolverPath?: string;
}

interface NormalizedFileEntry {
  name: string;
  content: string;
  description?: string;
}

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}

function isAbsoluteLike(value: string): boolean {
  if (value.startsWith('/')) {
    return true;
  }
  return /^[A-Za-z]:[\\/]/.test(value);
}

function normalizeRelativePath(
  rawPath: string,
  directiveKind: 'file' | 'files',
  opts?: { allowEmpty?: boolean; location?: unknown }
): string {
  const allowEmpty = opts?.allowEmpty === true;
  const trimmed = normalizePathSeparators(String(rawPath ?? '').trim());
  if (!trimmed) {
    if (allowEmpty) {
      return '';
    }
    throw new MlldDirectiveError(`${directiveKind} target path cannot be empty.`, directiveKind, {
      location: opts?.location
    });
  }
  if (isAbsoluteLike(trimmed)) {
    throw new MlldDirectiveError(
      `${directiveKind} only supports relative paths. Absolute paths are not allowed.`,
      directiveKind,
      { location: opts?.location, context: { path: trimmed } }
    );
  }

  const normalized = path.posix.normalize(trimmed);
  if (normalized === '.' && allowEmpty) {
    return '';
  }
  const segments = normalized.split('/').filter(Boolean);
  if (segments.includes('..')) {
    throw new MlldDirectiveError(
      `${directiveKind} paths cannot contain '..' traversal.`,
      directiveKind,
      { location: opts?.location, context: { path: trimmed } }
    );
  }
  if (normalized === '.' || normalized.length === 0) {
    if (allowEmpty) {
      return '';
    }
    throw new MlldDirectiveError(`${directiveKind} target path cannot be empty.`, directiveKind, {
      location: opts?.location
    });
  }
  return normalized;
}

function parseProjectionTarget(
  directiveKind: 'file' | 'files',
  target: unknown,
  location?: unknown
): ParsedProjectionTarget {
  if (!target || typeof target !== 'object') {
    throw new MlldDirectiveError(`Invalid ${directiveKind} target.`, directiveKind, {
      location
    });
  }
  const record = target as Record<string, unknown>;
  const targetType = record.type;
  if (targetType === 'path') {
    const pathNodes = Array.isArray(record.path) ? (record.path as BaseMlldNode[]) : [];
    return {
      type: 'path',
      path: pathNodes
    };
  }
  if (targetType === 'resolver') {
    const resolver = typeof record.resolver === 'string' ? record.resolver.trim() : '';
    const resolverPath = typeof record.path === 'string' ? record.path : '';
    if (!resolver) {
      throw new MlldDirectiveError(`Invalid ${directiveKind} resolver target.`, directiveKind, {
        location
      });
    }
    return {
      type: 'resolver',
      resolver,
      resolverPath
    };
  }

  throw new MlldDirectiveError(`Invalid ${directiveKind} target type.`, directiveKind, {
    location
  });
}

async function resolveExpressionValue(
  nodes: BaseMlldNode[],
  env: Environment,
  context?: EvaluationContext
): Promise<unknown> {
  const expressionContext = context ? { ...context, isExpression: true } : { isExpression: true };
  const result = await evaluate(nodes, env, expressionContext);
  let value = result.value;
  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }
  if (isStructuredValue(value)) {
    value = asData(value);
  }
  return value;
}

async function resolvePathTarget(
  pathNodes: BaseMlldNode[] | undefined,
  env: Environment,
  directiveKind: 'file' | 'files',
  location?: unknown,
  allowEmpty?: boolean
): Promise<string> {
  if (!pathNodes || pathNodes.length === 0) {
    if (allowEmpty) {
      return '';
    }
    throw new MlldDirectiveError(`${directiveKind} target path cannot be empty.`, directiveKind, {
      location
    });
  }
  const interpolated = await interpolate(pathNodes, env);
  return normalizeRelativePath(String(interpolated ?? ''), directiveKind, {
    allowEmpty,
    location
  });
}

function workspaceFilePath(relativePath: string, env: Environment): string {
  const projectRoot = normalizePathSeparators(env.getProjectRoot() || '/');
  const normalized = normalizePathSeparators(relativePath);
  return path.posix.join(projectRoot, normalized);
}

function resolveHostWritePath(relativePath: string, env: Environment): string {
  let targetPath = normalizePathSeparators(relativePath);
  if (targetPath.startsWith('@base/') || targetPath.startsWith('@root/')) {
    const projectRoot = env.getProjectRoot();
    targetPath = path.join(projectRoot, targetPath.slice(6));
  }
  if (!path.isAbsolute(targetPath)) {
    targetPath = path.resolve(env.getFileDirectory(), targetPath);
  }
  return targetPath;
}

function markProjectedWorkspacePath(
  workspace: WorkspaceValue,
  targetPath: string,
  directiveKind: 'file' | 'files',
  location?: unknown
): void {
  let writtenPaths = projectedWorkspacePaths.get(workspace.fs);
  if (!writtenPaths) {
    writtenPaths = new Set<string>();
    projectedWorkspacePaths.set(workspace.fs, writtenPaths);
  }
  if (writtenPaths.has(targetPath)) {
    throw new MlldDirectiveError(
      `${directiveKind} cannot overwrite '${targetPath}' in the same workspace scope.`,
      directiveKind,
      { location }
    );
  }
  writtenPaths.add(targetPath);
}

async function resolveOrCreateResolverWorkspace(
  resolverName: string,
  env: Environment,
  directiveKind: 'file' | 'files',
  location?: unknown
): Promise<WorkspaceValue> {
  const existingLocal = env.getVariable(resolverName);
  if (existingLocal) {
    const existingValue = await extractVariableValue(existingLocal, env);
    if (!isWorkspaceValue(existingValue)) {
      throw new MlldDirectiveError(
        `@${resolverName} already exists and is not a workspace value.`,
        directiveKind,
        { location }
      );
    }
    return existingValue;
  }

  const existingResolver = await env.getResolverVariable(resolverName);
  if (existingResolver) {
    const existingValue = await extractVariableValue(existingResolver, env);
    if (!isWorkspaceValue(existingValue)) {
      throw new MlldDirectiveError(
        `@${resolverName} already exists and is not a workspace value.`,
        directiveKind,
        { location }
      );
    }
    return existingValue;
  }

  const workspace: WorkspaceValue = {
    type: 'workspace',
    fs: VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
  env.setVariable(
    resolverName,
    createObjectVariable(
      resolverName,
      workspace as unknown as Record<string, unknown>,
      true,
      WORKSPACE_VARIABLE_SOURCE,
      {
        internal: {
          isResolver: true,
          resolverName
        }
      }
    )
  );
  return workspace;
}

async function resolveFileContent(
  nodes: BaseMlldNode[],
  env: Environment,
  context?: EvaluationContext
): Promise<string> {
  const value = await resolveExpressionValue(nodes, env, context);
  return materializeDisplayValue(value, undefined, value).text;
}

async function resolveFilesEntries(
  nodes: BaseMlldNode[],
  env: Environment,
  context: EvaluationContext | undefined,
  location: unknown
): Promise<NormalizedFileEntry[]> {
  const value = await resolveExpressionValue(nodes, env, context);
  if (!Array.isArray(value)) {
    throw new MlldDirectiveError('files requires an array of file entry objects.', 'files', {
      location,
      context: { value }
    });
  }

  const entries: NormalizedFileEntry[] = [];
  for (const entryValue of value) {
    if (!entryValue || typeof entryValue !== 'object' || Array.isArray(entryValue)) {
      throw new MlldDirectiveError('files entries must be objects.', 'files', {
        location,
        context: { entry: entryValue }
      });
    }

    const record = entryValue as Record<string, unknown>;
    const descriptionRaw = record.desc;
    const description =
      descriptionRaw === undefined
        ? undefined
        : typeof descriptionRaw === 'string'
          ? descriptionRaw
          : (() => {
              throw new MlldDirectiveError('files entry desc must be a string.', 'files', {
                location,
                context: { entry: entryValue }
              });
            })();

    const fileKeys = Object.keys(record).filter(key => key !== 'desc');
    if (fileKeys.length !== 1) {
      throw new MlldDirectiveError(
        'Each files entry must contain exactly one file key and optional desc.',
        'files',
        { location, context: { entry: entryValue } }
      );
    }

    const name = fileKeys[0] as string;
    const contentValue = record[name];
    const content = materializeDisplayValue(contentValue, undefined, contentValue).text;
    entries.push({ name, content, ...(description !== undefined ? { description } : {}) });
  }

  return entries;
}

async function resolveConcreteTarget(
  target: ParsedProjectionTarget,
  env: Environment,
  directiveKind: 'file' | 'files',
  location: unknown,
  opts?: { allowEmptyPath?: boolean }
): Promise<{
  workspace?: WorkspaceValue;
  basePath: string;
  useWorkspacePaths: boolean;
}> {
  if (target.type === 'resolver') {
    const workspace = await resolveOrCreateResolverWorkspace(
      target.resolver as string,
      env,
      directiveKind,
      location
    );
    const resolverBase = normalizeRelativePath(target.resolverPath ?? '', directiveKind, {
      allowEmpty: true,
      location
    });
    return {
      workspace,
      basePath: resolverBase,
      useWorkspacePaths: true
    };
  }

  const resolvedPath = await resolvePathTarget(
    target.path,
    env,
    directiveKind,
    location,
    opts?.allowEmptyPath
  );
  const activeWorkspace = env.getActiveWorkspace();
  return {
    workspace: activeWorkspace,
    basePath: resolvedPath,
    useWorkspacePaths: Boolean(activeWorkspace)
  };
}

export async function evaluateFile(
  directive: FileDirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const target = parseProjectionTarget('file', directive.values?.target, directive.location);
  const contentNodes = Array.isArray(directive.values?.content)
    ? (directive.values.content as BaseMlldNode[])
    : [];
  const content = await resolveFileContent(contentNodes, env, context);

  let relativePath: string;
  let workspace: WorkspaceValue | undefined;

  if (target.type === 'resolver') {
    workspace = await resolveOrCreateResolverWorkspace(
      target.resolver as string,
      env,
      'file',
      directive.location
    );
    relativePath = normalizeRelativePath(target.resolverPath ?? '', 'file', {
      location: directive.location
    });
  } else {
    relativePath = await resolvePathTarget(target.path, env, 'file', directive.location, false);
    workspace = env.getActiveWorkspace();
  }

  if (workspace) {
    const targetPath = workspaceFilePath(relativePath, env);
    markProjectedWorkspacePath(workspace, targetPath, 'file', directive.location);
    await executeWrite({
      env,
      targetPath,
      content,
      fileSystem: workspace.fs,
      sourceLocation: directive.location,
      metadata: {
        directive: 'file'
      }
    });
    return { value: '', env };
  }

  const absoluteTargetPath = resolveHostWritePath(relativePath, env);
  await executeWrite({
    env,
    targetPath: absoluteTargetPath,
    content,
    sourceLocation: directive.location,
    metadata: {
      directive: 'file'
    }
  });
  return { value: '', env };
}

export async function evaluateFiles(
  directive: FilesDirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const target = parseProjectionTarget('files', directive.values?.target, directive.location);
  const entriesNodes = Array.isArray(directive.values?.entries)
    ? (directive.values.entries as BaseMlldNode[])
    : [];
  const entries = await resolveFilesEntries(entriesNodes, env, context, directive.location);

  const concreteTarget = await resolveConcreteTarget(target, env, 'files', directive.location, {
    allowEmptyPath: true
  });
  const basePath = concreteTarget.basePath;
  const workspace = concreteTarget.workspace;

  for (const entry of entries) {
    const normalizedName = normalizeRelativePath(entry.name, 'files', {
      location: directive.location
    });
    const combinedRelativePath = normalizeRelativePath(
      path.posix.join(basePath, normalizedName),
      'files',
      { location: directive.location }
    );

    if (concreteTarget.useWorkspacePaths && workspace) {
      const targetPath = workspaceFilePath(combinedRelativePath, env);
      markProjectedWorkspacePath(workspace, targetPath, 'files', directive.location);
      await executeWrite({
        env,
        targetPath,
        content: entry.content,
        fileSystem: workspace.fs,
        sourceLocation: directive.location,
        metadata: {
          directive: 'files'
        }
      });
      if (entry.description) {
        workspace.descriptions.set(targetPath, entry.description);
      }
      continue;
    }

    const absoluteTargetPath = resolveHostWritePath(combinedRelativePath, env);
    await executeWrite({
      env,
      targetPath: absoluteTargetPath,
      content: entry.content,
      sourceLocation: directive.location,
      metadata: {
        directive: 'files'
      }
    });
  }

  return { value: '', env };
}
