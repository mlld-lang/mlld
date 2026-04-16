import path from 'node:path';
import {
  checkFile,
  createSigContext,
  formatHash,
  initProject,
  loadSig,
  resolveContainedPath,
  sha256,
  signFile,
  type CheckResult as SigCheckResult,
  type SigContext,
} from '@disreguard/sig';
import type { DataLabel } from '@core/types/security';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { createSigContextWithFS } from './sig-adapter';

export type FileIntegrityStatus = 'verified' | 'modified' | 'unsigned' | 'corrupted';

export interface FileVerifyResult {
  path: string;
  relativePath: string;
  status: FileIntegrityStatus;
  verified: boolean;
  signer: string | null;
  signedAt?: string;
  hash?: string;
  expectedHash?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface FileSigningMetadata {
  taint?: DataLabel[];
  provenance?: Record<string, unknown>;
  [key: string]: unknown;
}

function normalizeHash(value: string): string {
  return value.includes(':') ? value : formatHash(value);
}

function normalizeMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export class SigService {
  private readonly sigContext: SigContext;
  private readonly verificationCache = new Map<string, FileVerifyResult>();

  constructor(
    private readonly projectRoot: string,
    private readonly fileSystem?: IFileSystemService
  ) {
    this.sigContext = fileSystem
      ? createSigContextWithFS(projectRoot, fileSystem)
      : createSigContext(projectRoot);
  }

  async sign(
    filePath: string,
    identity: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await signFile(this.projectRoot, filePath, {
      identity,
      ...(this.sigContext ? { fs: this.sigContext.fs } : {}),
      ...(metadata ? { metadata } : {}),
    });
    this.invalidateCache(filePath);
  }

  async verify(filePath: string): Promise<FileVerifyResult> {
    const absolutePath = this.toAbsolutePath(filePath);
    const content = await this.readFile(absolutePath);
    return await this.verifyHash(absolutePath, sha256(content));
  }

  async verifyHash(filePath: string, contentHash: string): Promise<FileVerifyResult> {
    const normalizedPath = this.toAbsolutePath(filePath);
    const relativePath = this.toRelativePath(normalizedPath);
    const normalizedHash = normalizeHash(contentHash);
    const cacheKey = `${normalizedPath}:${normalizedHash}`;
    const cached = this.verificationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const ctx = this.getContext();
    const { signature, error } = await loadSig(ctx, relativePath);
    const result = !signature
      ? {
          path: normalizedPath,
          relativePath,
          status: error === 'corrupted' ? 'corrupted' : 'unsigned',
          verified: false,
          signer: null,
          hash: normalizedHash,
          ...(error === 'corrupted'
            ? { error: 'Signature file is corrupted or tampered with' }
            : { error: 'No signature found' }),
        }
      : signature.hash === normalizedHash
        ? {
            path: normalizedPath,
            relativePath,
            status: 'verified' as const,
            verified: true,
            signer: signature.signedBy,
            signedAt: signature.signedAt,
            hash: normalizedHash,
            expectedHash: signature.hash,
            ...(signature.metadata ? { metadata: signature.metadata } : {}),
          }
        : {
            path: normalizedPath,
            relativePath,
            status: 'modified' as const,
            verified: false,
            signer: signature.signedBy,
            signedAt: signature.signedAt,
            hash: normalizedHash,
            expectedHash: signature.hash,
            ...(signature.metadata ? { metadata: signature.metadata } : {}),
            error: 'Content has been modified since signing',
          };

    this.verificationCache.set(cacheKey, result);
    return result;
  }

  async check(filePath: string): Promise<FileVerifyResult> {
    const normalizedPath = this.toAbsolutePath(filePath);
    const relativePath = this.toRelativePath(normalizedPath);
    const result = await checkFile(this.projectRoot, normalizedPath, {
      ...(this.sigContext ? { fs: this.sigContext.fs } : {}),
    });
    return this.fromCheckResult(normalizedPath, relativePath, result);
  }

  async init(): Promise<void> {
    await initProject(this.projectRoot, {
      ...(this.sigContext ? { fs: this.sigContext.fs } : {}),
    });
  }

  invalidateCache(filePath: string): void {
    const normalizedPath = this.toAbsolutePath(filePath);
    const prefix = `${normalizedPath}:`;
    for (const key of Array.from(this.verificationCache.keys())) {
      if (key.startsWith(prefix)) {
        this.verificationCache.delete(key);
      }
    }
  }

  isExcluded(filePath: string): boolean {
    const relativePath = this.tryRelativePath(filePath);
    if (!relativePath) {
      return true;
    }

    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return (
      normalized === '.sig' ||
      normalized.startsWith('.sig/') ||
      normalized === '.llm/sec' ||
      normalized.startsWith('.llm/sec/') ||
      normalized === 'node_modules' ||
      normalized.startsWith('node_modules/')
    );
  }

  getVerificationCacheSnapshot(): Record<string, FileVerifyResult> {
    const snapshot: Record<string, FileVerifyResult> = {};
    for (const value of this.verificationCache.values()) {
      snapshot[value.path] = value;
    }
    return snapshot;
  }

  private getContext() {
    return this.sigContext;
  }

  private async readFile(filePath: string): Promise<string> {
    if (this.fileSystem) {
      return await this.fileSystem.readFile(filePath);
    }
    const fs = await import('node:fs/promises');
    return await fs.readFile(filePath, 'utf8');
  }

  private toAbsolutePath(filePath: string): string {
    const relativePath = this.toRelativePath(filePath);
    return path.resolve(this.projectRoot, relativePath);
  }

  private toRelativePath(filePath: string): string {
    return resolveContainedPath(this.projectRoot, filePath);
  }

  private tryRelativePath(filePath: string): string | null {
    try {
      return this.toRelativePath(filePath);
    } catch {
      return null;
    }
  }

  private fromCheckResult(
    absolutePath: string,
    relativePath: string,
    result: SigCheckResult
  ): FileVerifyResult {
    const signature = result.signature;
    const base = {
      path: absolutePath,
      relativePath,
      signer: signature?.signedBy ?? null,
      ...(signature?.signedAt ? { signedAt: signature.signedAt } : {}),
      ...(signature?.hash ? { expectedHash: signature.hash } : {}),
      ...(signature?.metadata ? { metadata: signature.metadata } : {}),
    };

    switch (result.status) {
      case 'signed':
        return {
          ...base,
          status: 'verified',
          verified: true,
          hash: signature?.hash,
        };
      case 'modified':
        return {
          ...base,
          status: 'modified',
          verified: false,
          error: 'Content has been modified since signing',
        };
      case 'corrupted':
        return {
          ...base,
          status: 'corrupted',
          verified: false,
          error: 'Signature file is corrupted or tampered with',
        };
      default:
        return {
          ...base,
          status: 'unsigned',
          verified: false,
          error: 'No signature found',
        };
    }
  }
}

export function buildFileSigningMetadata(
  taint: readonly string[]
): FileSigningMetadata | undefined {
  const normalizedTaint = Array.from(new Set(taint.map((label) => String(label).trim()).filter(Boolean)));
  return normalizeMetadata(
    normalizedTaint.length > 0
      ? {
          taint: normalizedTaint,
        }
      : undefined
  ) as FileSigningMetadata | undefined;
}
