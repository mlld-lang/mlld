import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { ImportApproval } from '@security/import';
import { ImmutableCache } from '@security/cache';
import { URLValidator } from '@security/url';
import { StorageManager } from './StorageManager';
import { MlldModuleSource, StorageOptions } from './types';
import { MlldImportError } from '@core/errors';

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
  private storageManager: StorageManager;
  
  constructor(projectPath: string) {
    this.lockFile = new LockFile(path.join(projectPath, '.mlld', 'mlld.lock.json'));
    this.cache = new ImmutableCache(projectPath);
    this.importApproval = new ImportApproval(projectPath);
    this.urlValidator = new URLValidator();
    this.storageManager = new StorageManager();
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
    
    // 2. New import - determine type and fetch
    if (importPath.startsWith('mlld://registry/')) {
      // Registry URLs need special handling to resolve to actual storage
      return this.fetchAndLockFromRegistry(importPath);
    }
    
    // 3. Use storage manager for all other supported formats
    if (this.storageManager.canResolve(importPath)) {
      return this.fetchAndLockModule(importPath);
    }
    
    // 4. Regular URL imports (backward compatibility)
    if (importPath.startsWith('http://') || importPath.startsWith('https://')) {
      return this.fetchAndLockURL(importPath);
    }
    
    throw new MlldImportError(`Unsupported import path: ${importPath}`);
  }
  
  /**
   * Fetch and lock a module using the storage manager
   */
  private async fetchAndLockModule(importPath: string): Promise<string> {
    // Fetch module using appropriate adapter
    const moduleSource = await this.storageManager.fetch(importPath, {
      // TODO: Add auth token from config if available
    });
    
    // Calculate integrity hash
    const integrity = await this.calculateIntegrity(moduleSource.content);
    
    // Check for security advisories
    await this.checkAdvisories(importPath, integrity);
    
    // Request user approval
    const approved = await this.importApproval.checkApproval(importPath, moduleSource.content);
    if (!approved) {
      throw new MlldImportError('Import rejected by user');
    }
    
    // Lock the import with metadata
    const lockData: RegistryImport = {
      resolved: moduleSource.metadata.immutableUrl || moduleSource.metadata.sourceUrl,
      integrity,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown'
    };
    
    // Add provider-specific metadata if available
    if (moduleSource.metadata.provider === 'github-gist' && moduleSource.metadata.revision) {
      lockData.gistRevision = moduleSource.metadata.revision;
    }
    
    await this.lockFile.addImport(importPath, lockData);
    
    // Cache the content
    await this.cache.set(lockData.resolved, moduleSource.content);
    
    return moduleSource.content;
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
      return JSON.parse(content) as LockFileData;
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