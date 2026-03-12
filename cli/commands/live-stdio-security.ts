import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PersistentContentStore, type ContentSignature } from '@disreguard/sig';
import { appendAuditEvent } from '@core/security/AuditLogger';
import {
  buildFileSigningMetadata,
  resolveIdentity,
  resolveUserIdentity,
  SigService,
  type FileSigningMetadata,
  type FileVerifyResult
} from '@core/security';
import { createSigContextWithFS } from '@core/security/sig-adapter';
import { PathContextBuilder } from '@core/services/PathContextService';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { getCommandContext } from '../utils/command-context';

interface ResolvedFileTarget {
  projectRoot: string;
  currentDir: string;
  filePath: string;
}

export interface LiveSigFileOptions {
  path: string;
  basePath?: string;
  identity?: string;
  metadata?: Record<string, unknown>;
  fileSystem: IFileSystemService;
}

export interface LiveSignContentOptions {
  content: string;
  identity: string;
  id?: string;
  metadata?: Record<string, string>;
  basePath?: string;
  fileSystem: IFileSystemService;
}

export interface ExecutionFileWriterOptions {
  requestId: string | number;
  scriptPath: string;
  fileSystem: IFileSystemService;
}

async function ensureDirectoryExists(
  fileSystem: IFileSystemService,
  targetPath: string
): Promise<void> {
  try {
    await fileSystem.mkdir(path.dirname(targetPath), { recursive: true });
  } catch {
    // Directory may already exist.
  }
}

async function resolveFileTarget(
  targetPath: string,
  basePath: string | undefined,
  fileSystem: IFileSystemService
): Promise<ResolvedFileTarget> {
  const context = await getCommandContext({ startPath: basePath });
  if (path.isAbsolute(targetPath)) {
    return {
      projectRoot: context.projectRoot,
      currentDir: context.currentDir,
      filePath: path.resolve(targetPath)
    };
  }

  const fromCurrent = path.resolve(context.currentDir, targetPath);
  if (await fileSystem.exists(fromCurrent).catch(() => false)) {
    return {
      projectRoot: context.projectRoot,
      currentDir: context.currentDir,
      filePath: fromCurrent
    };
  }

  const fromRoot = path.resolve(context.projectRoot, targetPath);
  return {
    projectRoot: context.projectRoot,
    currentDir: context.currentDir,
    filePath: await fileSystem.exists(fromRoot).catch(() => false) ? fromRoot : fromCurrent
  };
}

function normalizeContentMetadata(
  metadata?: Record<string, string>
): Record<string, string> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value.length > 0)
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildExecutionSignatureMetadata(
  requestId: string | number,
  scriptPath: string,
  taint: string[]
): FileSigningMetadata {
  return {
    ...(buildFileSigningMetadata(taint) ?? {}),
    provenance: {
      sourceType: 'mlld_execution',
      sourceId: String(requestId),
      scriptPath
    }
  };
}

export async function liveSignFile(
  options: LiveSigFileOptions
): Promise<FileVerifyResult> {
  const resolved = await resolveFileTarget(options.path, options.basePath, options.fileSystem);
  const sigService = new SigService(resolved.projectRoot, options.fileSystem);
  const identity =
    options.identity ??
    (await resolveUserIdentity({
      projectRoot: resolved.projectRoot,
      fileSystem: options.fileSystem
    }));

  await sigService.init();
  await sigService.sign(resolved.filePath, identity, options.metadata);
  return await sigService.check(resolved.filePath);
}

export async function liveVerifyFile(
  options: Pick<LiveSigFileOptions, 'path' | 'basePath' | 'fileSystem'>
): Promise<FileVerifyResult> {
  const resolved = await resolveFileTarget(options.path, options.basePath, options.fileSystem);
  const sigService = new SigService(resolved.projectRoot, options.fileSystem);
  return await sigService.check(resolved.filePath);
}

export async function liveSignContent(
  options: LiveSignContentOptions
): Promise<ContentSignature> {
  if (typeof options.identity !== 'string' || options.identity.trim().length === 0) {
    throw new Error('sig:sign-content identity is required');
  }

  const context = await getCommandContext({ startPath: options.basePath });
  const store = new PersistentContentStore(
    createSigContextWithFS(context.projectRoot, options.fileSystem)
  );
  const metadata = normalizeContentMetadata(options.metadata);

  return await store.sign(options.content, {
    id: options.id?.trim() || randomUUID(),
    identity: options.identity.trim(),
    ...(metadata ? { metadata } : {})
  });
}

export async function createExecutionFileWriter(
  options: ExecutionFileWriterOptions
): Promise<(targetPath: string, content: string) => Promise<FileVerifyResult>> {
  const pathContext = await PathContextBuilder.fromFile(options.scriptPath, options.fileSystem, {
    invocationDirectory: process.cwd()
  });
  const projectRoot = pathContext.projectRoot;
  const fileDirectory = pathContext.fileDirectory;
  const signerIdentity = await resolveIdentity({
    tier: 'agent',
    projectRoot,
    fileSystem: options.fileSystem,
    scriptPath: options.scriptPath
  });
  const sigService = new SigService(projectRoot, options.fileSystem);
  await sigService.init();

  return async (targetPath: string, content: string): Promise<FileVerifyResult> => {
    const resolvedPath = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(fileDirectory, targetPath);
    const existedBefore = await options.fileSystem.exists(resolvedPath).catch(() => false);
    await ensureDirectoryExists(options.fileSystem, resolvedPath);
    await options.fileSystem.writeFile(resolvedPath, content);

    const taint = ['untrusted'];
    await appendAuditEvent(options.fileSystem, projectRoot, {
      event: 'write',
      path: resolvedPath,
      changeType: existedBefore ? 'modified' : 'created',
      taint,
      writer: `live:file-write:${String(options.requestId)}`
    });

    try {
      await sigService.sign(
        resolvedPath,
        signerIdentity,
        buildExecutionSignatureMetadata(options.requestId, options.scriptPath, taint)
      );
    } catch (error: any) {
      await appendAuditEvent(options.fileSystem, projectRoot, {
        event: 'sign-error',
        path: resolvedPath,
        detail: error?.message ?? 'Unknown signing error'
      });
    }

    return await sigService.check(resolvedPath);
  };
}
