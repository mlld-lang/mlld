import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';

export type SignerTier = 'user' | 'agent' | 'system';

export interface IdentityResolutionContext {
  tier?: SignerTier;
  projectRoot: string;
  fileSystem?: IFileSystemService;
  scriptName?: string;
  scriptPath?: string;
  identity?: string;
  env?: NodeJS.ProcessEnv;
  gitUserResolver?: (cwd: string) => string | undefined;
}

function normalizeExplicitIdentity(identity: unknown): string | undefined {
  if (typeof identity !== 'string') {
    return undefined;
  }

  const normalized = identity.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function applyUserPrefix(identity: string): string {
  const normalized = identity.trim();
  if (normalized.length === 0) {
    return 'user:unknown';
  }
  if (/^(user|agent|system):/.test(normalized)) {
    return normalized;
  }
  return `user:${normalized}`;
}

function deriveScriptName(context: IdentityResolutionContext): string {
  if (typeof context.scriptName === 'string' && context.scriptName.trim().length > 0) {
    return context.scriptName.trim();
  }

  if (typeof context.scriptPath !== 'string' || context.scriptPath.trim().length === 0) {
    return 'mlld';
  }

  const basename = path.basename(context.scriptPath.trim());
  const stripped = basename
    .replace(/\.(mld|mlld)\.(md|markdown|xml)$/i, '')
    .replace(/\.(mld|mlld)$/i, '')
    .replace(/\.(md|markdown|xml)$/i, '');

  return stripped.trim().length > 0 ? stripped.trim() : 'mlld';
}

async function readIdentityFromSigConfig(
  projectRoot: string,
  fileSystem: IFileSystemService
): Promise<string | undefined> {
  const configPath = path.join(projectRoot, '.sig', 'config.json');
  const exists = await fileSystem.exists(configPath).catch(() => false);
  if (!exists) {
    return undefined;
  }

  try {
    const raw = await fileSystem.readFile(configPath);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sign =
      parsed.sign && typeof parsed.sign === 'object'
        ? (parsed.sign as Record<string, unknown>)
        : undefined;
    const identity = normalizeExplicitIdentity(sign?.identity);
    return identity ? applyUserPrefix(identity) : undefined;
  } catch {
    return undefined;
  }
}

function defaultGitUserResolver(cwd: string): string | undefined {
  try {
    const value = execFileSync('git', ['config', 'user.name'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveUserIdentity(
  context: Omit<IdentityResolutionContext, 'tier' | 'scriptName' | 'scriptPath'>
): Promise<string> {
  const explicit = normalizeExplicitIdentity(context.identity);
  if (explicit) {
    return applyUserPrefix(explicit);
  }

  const fileSystem = context.fileSystem ?? new NodeFileSystem();
  const fromConfig = await readIdentityFromSigConfig(context.projectRoot, fileSystem);
  if (fromConfig) {
    return fromConfig;
  }

  const gitUser = context.gitUserResolver?.(context.projectRoot) ?? defaultGitUserResolver(context.projectRoot);
  if (typeof gitUser === 'string' && gitUser.trim().length > 0) {
    return applyUserPrefix(gitUser);
  }

  const envUser = normalizeExplicitIdentity(context.env?.USER);
  if (envUser) {
    return applyUserPrefix(envUser);
  }

  return 'user:unknown';
}

export async function resolveIdentity(context: IdentityResolutionContext): Promise<string> {
  const explicit = normalizeExplicitIdentity(context.identity);
  if (explicit) {
    return explicit;
  }

  const tier = context.tier ?? 'agent';
  switch (tier) {
    case 'system':
      return 'system:mlld';
    case 'user':
      return await resolveUserIdentity(context);
    case 'agent':
    default:
      return `agent:${deriveScriptName(context)}`;
  }
}
