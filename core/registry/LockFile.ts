import * as fs from 'fs';
import * as path from 'path';
import { MlldError } from '@core/errors';

export interface LockEntry {
  resolved: string;           // The resolved path (gist URL or registry path)
  gistRevision?: string;      // For gist imports
  integrity: string;          // SHA256 hash of content
  registryVersion?: string;   // Registry version when resolved
  approvedAt: string;         // ISO timestamp
  approvedBy?: string;        // User who approved
}

export interface LockFileData {
  version: string;
  imports: Record<string, LockEntry>;
}

export class LockFile {
  private data: LockFileData;
  private isDirty: boolean = false;

  constructor(private readonly filePath: string) {
    this.data = this.load();
  }

  private load(): LockFileData {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Failed to load lock file: ${error.message}`);
    }
    
    // Initialize with empty lock file
    return {
      version: '1.0.0',
      imports: {}
    };
  }

  async save(): Promise<void> {
    if (!this.isDirty) return;

    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    await fs.promises.writeFile(
      this.filePath,
      JSON.stringify(this.data, null, 2)
    );
    
    this.isDirty = false;
  }

  getImport(importPath: string): LockEntry | undefined {
    return this.data.imports[importPath];
  }

  async addImport(importPath: string, entry: LockEntry): Promise<void> {
    this.data.imports[importPath] = entry;
    this.isDirty = true;
    await this.save();
  }

  async updateImport(importPath: string, entry: Partial<LockEntry>): Promise<void> {
    const existing = this.data.imports[importPath];
    if (!existing) {
      throw new MlldError(`No lock entry found for ${importPath}`);
    }
    
    this.data.imports[importPath] = { ...existing, ...entry };
    this.isDirty = true;
    await this.save();
  }

  async removeImport(importPath: string): Promise<void> {
    delete this.data.imports[importPath];
    this.isDirty = true;
    await this.save();
  }

  getAllImports(): Record<string, LockEntry> {
    return { ...this.data.imports };
  }

  async verifyIntegrity(importPath: string, content: string): Promise<boolean> {
    const entry = this.getImport(importPath);
    if (!entry) return true; // No lock entry to verify against
    
    const hash = await this.calculateIntegrity(content);
    return hash === entry.integrity;
  }

  async calculateIntegrity(content: string): Promise<string> {
    // Use Node.js crypto for SHA256
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return `sha256:${hash.digest('hex')}`;
  }

  // Check if any imports are outdated (for mlld outdated command)
  async checkOutdated(
    checkFn: (importPath: string, entry: LockEntry) => Promise<boolean>
  ): Promise<Array<{ importPath: string; entry: LockEntry }>> {
    const outdated: Array<{ importPath: string; entry: LockEntry }> = [];
    
    for (const [importPath, entry] of Object.entries(this.data.imports)) {
      if (await checkFn(importPath, entry)) {
        outdated.push({ importPath, entry });
      }
    }
    
    return outdated;
  }
}