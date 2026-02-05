import * as path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { HashUtils } from '@core/registry/utils/HashUtils';
import { appendAuditEvent } from './AuditLogger';

export type SignatureMethod = 'sha256';

export interface SignatureRecord {
  hash: string;
  method: SignatureMethod;
  signedby?: string;
  signedat: string;
}

export interface SignatureVerificationResult extends SignatureRecord {
  verified: boolean;
  template: string;
}

const DEFAULT_METHOD: SignatureMethod = 'sha256';

function normalizeMethod(method: unknown, hash: unknown): SignatureMethod | null {
  if (method === 'sha256') {
    return 'sha256';
  }
  if (typeof hash === 'string') {
    const prefix = hash.split(':', 1)[0];
    if (prefix === 'sha256') {
      return 'sha256';
    }
  }
  return null;
}

function normalizeHash(method: SignatureMethod, hash: string): string {
  if (hash.startsWith(`${method}:`)) {
    return hash;
  }
  return `${method}:${hash}`;
}

export class SignatureStore {
  private readonly fileSystem: IFileSystemService;
  private readonly baseDir: string;
  private readonly projectRoot: string;

  constructor(fileSystem: IFileSystemService, projectRoot: string) {
    this.fileSystem = fileSystem;
    this.projectRoot = projectRoot;
    this.baseDir = path.join(projectRoot, '.mlld', 'sec', 'sigs');
  }

  async sign(
    varName: string,
    content: string,
    options?: { method?: SignatureMethod; signedby?: string; signedat?: string }
  ): Promise<SignatureRecord> {
    const method = options?.method ?? DEFAULT_METHOD;
    if (method !== 'sha256') {
      throw new Error(`Unsupported signing method: ${method}`);
    }
    const hash = normalizeHash(method, HashUtils.hash(content));
    const record: SignatureRecord = {
      hash,
      method,
      signedby: options?.signedby,
      signedat: options?.signedat ?? new Date().toISOString()
    };

    await this.fileSystem.writeFile(this.contentPath(varName), content);
    await this.fileSystem.writeFile(this.signaturePath(varName), JSON.stringify(record, null, 2));
    await appendAuditEvent(this.fileSystem, this.projectRoot, {
      event: 'sign',
      var: this.formatAuditVarName(varName),
      hash: record.hash,
      by: record.signedby
    });
    return record;
  }

  async signIfChanged(
    varName: string,
    content: string,
    options?: { method?: SignatureMethod; signedby?: string; signedat?: string }
  ): Promise<SignatureRecord> {
    const method = options?.method ?? DEFAULT_METHOD;
    if (method !== 'sha256') {
      throw new Error(`Unsupported signing method: ${method}`);
    }
    const nextHash = this.computeHash(method, content);
    const existing = await this.readSignature(varName);
    if (existing && existing.hash === nextHash) {
      const contentPath = this.contentPath(varName);
      if (!(await this.fileSystem.exists(contentPath))) {
        await this.fileSystem.writeFile(contentPath, content);
      }
      return existing;
    }
    return this.sign(varName, content, { ...options, method });
  }

  async verify(
    varName: string,
    content?: string,
    options?: { caller?: string }
  ): Promise<SignatureVerificationResult> {
    const signature = await this.readSignature(varName);
    const template = await this.readContent(varName);

    if (!signature || template === null) {
      return {
        hash: signature?.hash ?? '',
        method: signature?.method ?? DEFAULT_METHOD,
        signedby: signature?.signedby,
        signedat: signature?.signedat ?? '',
        template: template ?? '',
        verified: false
      };
    }

    const expectedHash = this.computeHash(signature.method, template);
    const signatureMatches = expectedHash === signature.hash;
    const contentMatches =
      typeof content === 'string'
        ? this.computeHash(signature.method, content) === signature.hash
        : true;

    const result: SignatureVerificationResult = {
      ...signature,
      template,
      verified: signatureMatches && contentMatches
    };
    await appendAuditEvent(this.fileSystem, this.projectRoot, {
      event: 'verify',
      var: this.formatAuditVarName(varName),
      result: result.verified,
      caller: options?.caller
    });
    return result;
  }

  private async readSignature(varName: string): Promise<SignatureRecord | null> {
    const sigPath = this.signaturePath(varName);
    if (!(await this.fileSystem.exists(sigPath))) {
      return null;
    }
    try {
      const raw = await this.fileSystem.readFile(sigPath);
      const parsed = JSON.parse(raw) as Partial<SignatureRecord>;
      const method = normalizeMethod(parsed.method, parsed.hash) ?? DEFAULT_METHOD;
      const hash = typeof parsed.hash === 'string' ? normalizeHash(method, parsed.hash) : '';
      const signedat = typeof parsed.signedat === 'string' ? parsed.signedat : '';
      const signedby = typeof parsed.signedby === 'string' ? parsed.signedby : undefined;
      if (!hash) {
        return null;
      }
      return { hash, method, signedby, signedat };
    } catch {
      return null;
    }
  }

  private async readContent(varName: string): Promise<string | null> {
    const contentPath = this.contentPath(varName);
    if (!(await this.fileSystem.exists(contentPath))) {
      return null;
    }
    try {
      return await this.fileSystem.readFile(contentPath);
    } catch {
      return null;
    }
  }

  private computeHash(method: SignatureMethod, content: string): string {
    if (method !== 'sha256') {
      throw new Error(`Unsupported signing method: ${method}`);
    }
    return normalizeHash(method, HashUtils.hash(content));
  }

  private signaturePath(varName: string): string {
    return path.join(this.baseDir, `${varName}.sig`);
  }

  private contentPath(varName: string): string {
    return path.join(this.baseDir, `${varName}.content`);
  }

  private formatAuditVarName(varName: string): string {
    return varName.startsWith('@') ? varName : `@${varName}`;
  }
}
