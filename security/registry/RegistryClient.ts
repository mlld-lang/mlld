import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { ImportApproval } from '@security/import';
import { ImmutableCache } from '@security/cache';
import { URLValidator } from '@security/url';
import { IMMUTABLE_SECURITY_PATTERNS } from '@security/policy/patterns';

// GitHub Gist API Response Types
interface GistFile {
  filename: string;
  type: string;
  language: string | null;
  raw_url: string;
  size: number;
  truncated: boolean;
  content: string;
}

interface GistHistory {
  version: string;
  committed_at: string;
  change_status: {
    total: number;
    additions: number;
    deletions: number;
  };
  url: string;
}

interface GistResponse {
  id: string;
  html_url: string;
  files: Record<string, GistFile>;
  history: GistHistory[];
  created_at: string;
  updated_at: string;
  description: string;
  owner: {
    login: string;
    id: number;
  };
}

// Type guards for API responses
function isGistFile(obj: unknown): obj is GistFile {
  return typeof obj === 'object' && 
         obj !== null &&
         'filename' in obj &&
         typeof (obj as GistFile).filename === 'string';
}

function isGistResponse(obj: unknown): obj is GistResponse {
  return typeof obj === 'object' && 
         obj !== null &&
         'id' in obj &&
         'files' in obj &&
         'history' in obj &&
         Array.isArray((obj as GistResponse).history) &&
         (obj as GistResponse).history.length > 0 &&
         typeof (obj as GistResponse).history[0].version === 'string';
}

export interface RegistryImport {
  resolved: string;
  integrity: string;
  gistRevision?: string;
  approvedAt: string;
  approvedBy: string;
}

export interface LockFileData {
  version: string;
  imports: Record<string, RegistryImport>;
}

/**
 * Registry client that implements the lock file and caching strategy
 * from REGISTRY-DESIGN.md
 */
export class RegistryClient {
  private lockFile: LockFile;
  private cache: ImmutableCache;
  private importApproval: ImportApproval;
  private urlValidator: URLValidator;
  
  constructor(projectPath: string) {
    this.lockFile = new LockFile(path.join(projectPath, '.mlld', 'mlld.lock.json'));
    this.cache = new ImmutableCache(projectPath);
    this.importApproval = new ImportApproval(projectPath);
    this.urlValidator = new URLValidator();
  }
  
  /**
   * Resolve an import path following the lock file workflow
   */
  async resolve(importPath: string): Promise<string> {
    // 1. Check lock file first
    const locked = await this.lockFile.getImport(importPath);
    if (locked) {
      // Try cache
      const cached = await this.cache.get(locked.resolved, locked.integrity);
      if (cached) {
        return cached;
      }
      // Fetch specific locked version
      return this.fetchLocked(importPath, locked);
    }
    
    // 2. New import - fetch, approve, and lock
    if (importPath.startsWith('mlld://gist/')) {
      return this.fetchAndLockGist(importPath);
    }
    if (importPath.startsWith('mlld://registry/')) {
      return this.fetchAndLockFromRegistry(importPath);
    }
    
    // 3. Regular URL imports (backward compatibility)
    if (importPath.startsWith('http://') || importPath.startsWith('https://')) {
      return this.fetchAndLockURL(importPath);
    }
    
    throw new Error(`Unsupported import path: ${importPath}`);
  }
  
  /**
   * Fetch and lock a GitHub Gist import
   */
  private async fetchAndLockGist(path: string): Promise<string> {
    const [, , username, gistId] = path.split('/');
    
    // Validate username isn't trying to access system paths
    if (IMMUTABLE_SECURITY_PATTERNS.protectedReadPaths.some(p => username.includes(p))) {
      throw new Error(`Security: Invalid gist username`);
    }
    
    // Fetch gist metadata
    const response = await fetch(`https://api.github.com/gists/${gistId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch gist: ${response.statusText}`);
    }
    
    const gistData = await response.json();
    
    // Validate the response structure
    if (!isGistResponse(gistData)) {
      throw new Error('Invalid gist response from GitHub API');
    }
    
    const gist = gistData;
    
    // Get the current revision
    const revision = gist.history[0].version;
    
    // Find .mld or .mlld file
    const mldFile = Object.values(gist.files).find((f) => 
      f.filename.endsWith('.mld') || f.filename.endsWith('.mlld')
    );
    
    if (!mldFile) {
      throw new Error('No .mld or .mlld file found in gist');
    }
    
    // Construct the raw URL with revision for immutability
    const resolvedUrl = `https://gist.githubusercontent.com/${username}/${gistId}/raw/${revision}/${mldFile.filename}`;
    
    // Fetch the actual content
    const contentResponse = await fetch(resolvedUrl);
    const content = await contentResponse.text();
    
    // Calculate integrity hash
    const integrity = await this.calculateIntegrity(content);
    
    // Check for security advisories
    await this.checkAdvisories(path, integrity);
    
    // Request user approval (reusing existing ImportApproval)
    const approved = await this.importApproval.checkApproval(path, content);
    if (!approved) {
      throw new Error('Import rejected by user');
    }
    
    // Lock the import
    await this.lockFile.addImport(path, {
      resolved: resolvedUrl,
      integrity,
      gistRevision: revision,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown'
    });
    
    // Cache the content
    await this.cache.set(resolvedUrl, content);
    
    return content;
  }
  
  /**
   * Fetch a locked import and verify integrity
   */
  private async fetchLocked(importPath: string, locked: RegistryImport): Promise<string> {
    // Fetch from the exact locked URL
    const response = await fetch(locked.resolved);
    if (!response.ok) {
      throw new Error(`Failed to fetch locked import: ${response.statusText}`);
    }
    
    const content = await response.text();
    
    // Verify integrity
    const integrity = await this.calculateIntegrity(content);
    if (integrity !== locked.integrity) {
      throw new Error(
        `Integrity check failed for ${importPath}\n` +
        `Expected: ${locked.integrity}\n` +
        `Actual: ${integrity}\n` +
        `The content has changed. Please review and update the lock file.`
      );
    }
    
    // Cache for next time
    await this.cache.set(locked.resolved, content);
    
    return content;
  }
  
  /**
   * Calculate SHA256 integrity hash
   */
  private async calculateIntegrity(content: string): Promise<string> {
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    return `sha256:${hash}`;
  }
  
  /**
   * Check security advisories for an import
   */
  private async checkAdvisories(importPath: string, _integrity: string): Promise<void> {
    // TODO: Implement advisory checking
    // For now, this is a placeholder
    // Will use AdvisoryChecker service when fully implemented
  }
  
  /**
   * Fetch from registry (Phase 2)
   */
  private async fetchAndLockFromRegistry(path: string): Promise<string> {
    // TODO: Implement registry resolution
    throw new Error('Registry imports not yet implemented');
  }
  
  /**
   * Fetch regular URL (backward compatibility)
   */
  private async fetchAndLockURL(url: string): Promise<string> {
    // Validate URL
    const validation = await this.urlValidator.validate(url);
    if (!validation.valid) {
      throw new Error(`URL validation failed: ${validation.reason}`);
    }
    
    // Use existing import approval flow
    const response = await fetch(url);
    const content = await response.text();
    
    const approved = await this.importApproval.checkApproval(url, content);
    if (!approved) {
      throw new Error('Import rejected by user');
    }
    
    const integrity = await this.calculateIntegrity(content);
    
    // Lock it
    await this.lockFile.addImport(url, {
      resolved: url,
      integrity,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown'
    });
    
    await this.cache.set(url, content);
    
    return content;
  }
}

/**
 * Lock file management
 */
class LockFile {
  private data: LockFileData;
  
  constructor(private path: string) {
    this.data = this.load();
  }
  
  private load(): LockFileData {
    try {
      const content = fsSync.readFileSync(this.path, 'utf8');
      return JSON.parse(content);
    } catch {
      return { version: '1.0.0', imports: {} };
    }
  }
  
  async addImport(importPath: string, metadata: RegistryImport): Promise<void> {
    this.data.imports[importPath] = metadata;
    await this.save();
  }
  
  async getImport(importPath: string): Promise<RegistryImport | undefined> {
    return this.data.imports[importPath];
  }
  
  private async save(): Promise<void> {
    const dir = path.dirname(this.path);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.path,
      JSON.stringify(this.data, null, 2)
    );
  }
}