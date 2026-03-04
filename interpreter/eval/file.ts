import path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import type { BaseMlldNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import type { FileDirectiveNode, FilesDirectiveNode, GitFilesSourceNode } from '@core/types/file';
import type { WorkspaceValue } from '@core/types/workspace';
import { createObjectVariable } from '@core/types/variable';
import { isWorkspaceValue } from '@core/types/workspace';
import { MlldDirectiveError } from '@core/errors';
import { getKeychainProvider } from '@core/resolvers/builtin/KeychainResolver';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { evaluate, interpolate } from '../core/interpreter';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { asData, isStructuredValue } from '../utils/structured-value';
import { materializeDisplayValue } from '../utils/display-materialization';
import { executeWrite } from './write-executor';

const execFile = promisify(execFileCallback);

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

interface GitHydrationSource {
  url: string;
  auth?: string;
  branch?: string;
  path?: string;
  depth: number;
  sanitizedSource: string;
}

interface GitHydratedFile {
  relativePath: string;
  content: string;
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

function isGitFilesSourceNode(node: BaseMlldNode | undefined): node is GitFilesSourceNode {
  return Boolean(node) && node.type === 'GitFilesSource';
}

function extractRemoteHost(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      const parsed = new URL(trimmed);
      return parsed.hostname || undefined;
    }
  } catch {
    // fall through to SSH-like syntax checks.
  }

  const sshMatch = trimmed.match(/^[^@]+@([^:]+):/);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  if (trimmed.startsWith('git@')) {
    const host = trimmed.slice(4).split(':')[0];
    return host || undefined;
  }

  return undefined;
}

function sanitizeRemoteUrl(remoteUrl: string): string {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    // Remove inline credentials for scp-like forms if present.
    return trimmed.replace(/\/\/[^/@]+@/, '//');
  }
}

function matchesHostPattern(host: string, pattern: string): boolean {
  const normalizedHost = host.trim().toLowerCase();
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern === '*') {
    return true;
  }

  const withoutScheme = normalizedPattern.replace(/^[a-z]+:\/\//, '');
  const slashIndex = withoutScheme.indexOf('/');
  const hostPattern = slashIndex >= 0 ? withoutScheme.slice(0, slashIndex) : withoutScheme;
  if (!hostPattern) {
    return false;
  }

  if (hostPattern.startsWith('*.')) {
    const suffix = hostPattern.slice(2);
    return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
  }

  return normalizedHost === hostPattern || normalizedHost.endsWith(`.${hostPattern}`);
}

function enforceGitNetworkPolicy(
  env: Environment,
  remoteUrl: string,
  location: unknown
): void {
  const host = extractRemoteHost(remoteUrl);
  if (!host) {
    // Local path clones are filesystem operations and do not require network.
    return;
  }

  const scopedConfig = env.getScopedEnvironmentConfig();
  const netConfig = (scopedConfig as Record<string, unknown> | undefined)?.net;
  if (netConfig === undefined) {
    return;
  }

  if (typeof netConfig === 'string') {
    if (netConfig.trim().toLowerCase() === 'none') {
      throw new MlldDirectiveError(
        `Network access denied by box.net policy for git source '${sanitizeRemoteUrl(remoteUrl)}'.`,
        'files',
        { location, context: { host } }
      );
    }
    return;
  }

  if (!netConfig || typeof netConfig !== 'object') {
    return;
  }

  const allowRaw = (netConfig as Record<string, unknown>).allow;
  if (!Array.isArray(allowRaw)) {
    return;
  }
  const allow = allowRaw.map(value => String(value ?? '').trim()).filter(Boolean);
  if (allow.length === 0) {
    throw new MlldDirectiveError(
      `Network access denied by box.net.allow for git source '${sanitizeRemoteUrl(remoteUrl)}'.`,
      'files',
      { location, context: { host } }
    );
  }

  const allowed = allow.some(pattern => matchesHostPattern(host, pattern));
  if (!allowed) {
    throw new MlldDirectiveError(
      `Host '${host}' is not allowed by box.net.allow for git hydration.`,
      'files',
      { location, context: { host, allow } }
    );
  }
}

async function resolveOptionString(
  optionNodes: BaseMlldNode[] | undefined,
  env: Environment,
  context: EvaluationContext | undefined,
  key: string,
  location: unknown
): Promise<string | undefined> {
  if (!optionNodes || optionNodes.length === 0) {
    return undefined;
  }
  const resolved = await resolveExpressionValue(optionNodes, env, context);
  if (resolved === null || resolved === undefined) {
    return undefined;
  }
  if (typeof resolved !== 'string') {
    throw new MlldDirectiveError(`git ${key} option must resolve to a string.`, 'files', {
      location,
      context: { key, value: resolved }
    });
  }
  const trimmed = resolved.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function resolveOptionNumber(
  optionNodes: BaseMlldNode[] | undefined,
  env: Environment,
  context: EvaluationContext | undefined,
  key: string,
  location: unknown
): Promise<number | undefined> {
  if (!optionNodes || optionNodes.length === 0) {
    return undefined;
  }
  const resolved = await resolveExpressionValue(optionNodes, env, context);
  let numeric: number;
  if (typeof resolved === 'number') {
    numeric = resolved;
  } else if (typeof resolved === 'string' && resolved.trim().length > 0) {
    numeric = Number.parseInt(resolved.trim(), 10);
  } else {
    throw new MlldDirectiveError(`git ${key} option must resolve to a positive integer.`, 'files', {
      location,
      context: { key, value: resolved }
    });
  }

  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    throw new MlldDirectiveError(`git ${key} option must resolve to a positive integer.`, 'files', {
      location,
      context: { key, value: resolved }
    });
  }
  return numeric;
}

function resolveKeychainRef(ref: string): { service: string; account: string } | null {
  const trimmed = ref.trim();
  if (!trimmed.startsWith('keychain:')) {
    return null;
  }
  const payload = trimmed.slice('keychain:'.length);
  const separator = payload.indexOf('/');
  if (separator <= 0 || separator >= payload.length - 1) {
    return null;
  }
  return {
    service: payload.slice(0, separator),
    account: payload.slice(separator + 1)
  };
}

async function resolveExplicitGitAuthToken(authValue: string | undefined): Promise<string | undefined> {
  if (!authValue) {
    return undefined;
  }
  const keychainRef = resolveKeychainRef(authValue);
  if (!keychainRef) {
    return authValue;
  }

  const provider = getKeychainProvider();
  const keychainValue = await provider.get(keychainRef.service, keychainRef.account);
  if (!keychainValue) {
    throw new Error(`No keychain value found for ${keychainRef.service}/${keychainRef.account}`);
  }
  return keychainValue;
}

async function resolveGitAuthToken(
  env: Environment,
  remoteUrl: string,
  explicitAuth: string | undefined
): Promise<string | undefined> {
  if (explicitAuth) {
    return resolveExplicitGitAuthToken(explicitAuth);
  }

  const host = extractRemoteHost(remoteUrl);
  if (!host || !host.toLowerCase().endsWith('github.com')) {
    return undefined;
  }

  try {
    const provider = getKeychainProvider();
    const githubToken = await provider.get('mlld-cli', 'github-token');
    return githubToken ?? undefined;
  } catch {
    return undefined;
  }
}

async function resolveGitHydrationSource(
  gitNode: GitFilesSourceNode,
  env: Environment,
  context: EvaluationContext | undefined,
  location: unknown
): Promise<GitHydrationSource> {
  const url = await resolveOptionString(gitNode.url, env, context, 'url', location);
  if (!url) {
    throw new MlldDirectiveError('git source requires a repository URL.', 'files', {
      location
    });
  }

  const options = gitNode.options ?? {};
  const branch = await resolveOptionString(options.branch, env, context, 'branch', location);
  const authOption = await resolveOptionString(options.auth, env, context, 'auth', location);
  const pathOption = await resolveOptionString(options.path, env, context, 'path', location);
  const depth = (await resolveOptionNumber(options.depth, env, context, 'depth', location)) ?? 1;

  const normalizedPath = pathOption
    ? normalizeRelativePath(pathOption, 'files', { allowEmpty: true, location })
    : undefined;

  enforceGitNetworkPolicy(env, url, location);
  const auth = await resolveGitAuthToken(env, url, authOption);

  return {
    url,
    auth,
    branch,
    path: normalizedPath,
    depth,
    sanitizedSource: sanitizeRemoteUrl(url)
  };
}

async function runGitCommand(
  args: string[],
  envVars?: Record<string, string>
): Promise<void> {
  await execFile('git', args, {
    env: envVars ? { ...process.env, ...envVars } : process.env
  });
}

async function cloneGitRepository(
  source: GitHydrationSource,
  cloneRoot: string
): Promise<string> {
  const cloneArgs = ['clone', '--depth', String(source.depth)];
  if (source.branch) {
    cloneArgs.push('--branch', source.branch, '--single-branch');
  }

  const isHttpRemote = /^https?:\/\//i.test(source.url);
  if (source.auth && isHttpRemote) {
    cloneArgs.unshift('-c', `http.extraHeader=Authorization: Bearer ${source.auth}`);
  }
  cloneArgs.push(source.url, cloneRoot);

  await runGitCommand(cloneArgs);
  return cloneRoot;
}

async function collectGitFiles(rootDir: string): Promise<GitHydratedFile[]> {
  const files: GitHydratedFile[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = normalizePathSeparators(path.relative(rootDir, absolutePath));

      if (entry.isSymbolicLink()) {
        console.warn(`[files git] Skipping symlink: ${relativePath}`);
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const data = await fs.readFile(absolutePath);
      if (data.includes(0)) {
        console.warn(`[files git] Skipping binary file: ${relativePath}`);
        continue;
      }

      files.push({
        relativePath,
        content: data.toString('utf8')
      });
    }
  }

  await walk(rootDir);
  return files;
}

function buildGitWriteDescriptor(sanitizedSource: string): SecurityDescriptor {
  const sourceLabel = `src:git:${sanitizedSource}`;
  return makeSecurityDescriptor({
    taint: ['src:git'],
    labels: ['src:git'],
    sources: [sourceLabel]
  });
}

async function hydrateFilesFromGitSource(
  gitNode: GitFilesSourceNode,
  concreteTarget: {
    workspace?: WorkspaceValue;
    basePath: string;
    useWorkspacePaths: boolean;
  },
  env: Environment,
  context: EvaluationContext | undefined,
  location: unknown
): Promise<void> {
  const source = await resolveGitHydrationSource(gitNode, env, context, location);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-git-hydrate-'));
  const descriptor = buildGitWriteDescriptor(source.sanitizedSource);

  try {
    await cloneGitRepository(source, tempRoot);

    const contentRoot = source.path ? path.join(tempRoot, source.path) : tempRoot;
    const contentRootExists = await fs.stat(contentRoot).then(stat => stat.isDirectory()).catch(() => false);
    if (!contentRootExists) {
      throw new MlldDirectiveError(
        `git path '${source.path}' was not found in repository.`,
        'files',
        { location, context: { source: source.sanitizedSource, path: source.path } }
      );
    }

    const hydratedFiles = await collectGitFiles(contentRoot);
    const workspace = concreteTarget.workspace;
    const basePath = concreteTarget.basePath;

    for (const hydratedFile of hydratedFiles) {
      const normalizedName = normalizeRelativePath(hydratedFile.relativePath, 'files', {
        location
      });
      const combinedRelativePath = normalizeRelativePath(
        path.posix.join(basePath, normalizedName),
        'files',
        { location }
      );

      if (concreteTarget.useWorkspacePaths && workspace) {
        const targetPath = workspaceFilePath(combinedRelativePath, env);
        markProjectedWorkspacePath(workspace, targetPath, 'files', location);
        await executeWrite({
          env,
          targetPath,
          content: hydratedFile.content,
          descriptor,
          fileSystem: workspace.fs,
          sourceLocation: location as any,
          metadata: {
            directive: 'files',
            source: 'git',
            remote: source.sanitizedSource
          }
        });
        continue;
      }

      const absoluteTargetPath = resolveHostWritePath(combinedRelativePath, env);
      await executeWrite({
        env,
        targetPath: absoluteTargetPath,
        content: hydratedFile.content,
        descriptor,
        sourceLocation: location as any,
        metadata: {
          directive: 'files',
          source: 'git',
          remote: source.sanitizedSource
        }
      });
    }
  } catch (error) {
    if (error instanceof MlldDirectiveError) {
      throw error;
    }
    const details = error instanceof Error ? error.message : String(error);
    throw new MlldDirectiveError(
      `Failed to hydrate files from git source '${source.sanitizedSource}': ${details}`,
      'files',
      { location }
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
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
  const concreteTarget = await resolveConcreteTarget(target, env, 'files', directive.location, {
    allowEmptyPath: true
  });

  const maybeGitSource = entriesNodes.length === 1 ? entriesNodes[0] : undefined;
  if (isGitFilesSourceNode(maybeGitSource)) {
    await hydrateFilesFromGitSource(
      maybeGitSource,
      concreteTarget,
      env,
      context,
      directive.location
    );
    return { value: '', env };
  }

  const entries = await resolveFilesEntries(entriesNodes, env, context, directive.location);
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
