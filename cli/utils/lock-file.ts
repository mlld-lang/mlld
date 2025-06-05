import * as path from 'path';
import * as fs from 'fs/promises';
import { LockFile, type LockEntry } from '@core/registry/LockFile';

export interface LockFileUtils {
  ensureLockFile(basePath: string): Promise<LockFile>;
  getLockFilePath(basePath: string): string;
  validateLockFile(lockFile: LockFile): Promise<ValidationResult>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingModules: string[];
  corruptedEntries: string[];
}

export class LockFileManager implements LockFileUtils {
  
  async ensureLockFile(basePath: string): Promise<LockFile> {
    const lockFilePath = this.getLockFilePath(basePath);
    
    // Create .mlld directory if it doesn't exist
    const mlldDir = path.dirname(lockFilePath);
    try {
      await fs.mkdir(mlldDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
    }
    
    return new LockFile(lockFilePath);
  }
  
  getLockFilePath(basePath: string): string {
    return path.join(basePath, '.mlld', 'mlld.lock.json');
  }
  
  async validateLockFile(lockFile: LockFile): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      missingModules: [],
      corruptedEntries: []
    };
    
    const imports = lockFile.getAllImports();
    
    for (const [importPath, entry] of Object.entries(imports)) {
      try {
        // Validate entry structure
        if (!entry.resolved || !entry.integrity || !entry.approvedAt) {
          result.errors.push(`Invalid lock entry for ${importPath}: missing required fields`);
          result.valid = false;
          continue;
        }
        
        // Validate integrity format
        if (!entry.integrity.startsWith('sha256:')) {
          result.warnings.push(`Lock entry for ${importPath} uses non-standard integrity format`);
        }
        
        // Validate timestamp
        const approvedDate = new Date(entry.approvedAt);
        if (isNaN(approvedDate.getTime())) {
          result.errors.push(`Invalid approval timestamp for ${importPath}`);
          result.valid = false;
        }
        
        // Check if entry is very old (over 1 year)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        if (approvedDate < oneYearAgo) {
          result.warnings.push(`Lock entry for ${importPath} is over 1 year old`);
        }
        
      } catch (error) {
        result.errors.push(`Failed to validate ${importPath}: ${error.message}`);
        result.valid = false;
      }
    }
    
    return result;
  }
  
  async backupLockFile(basePath: string): Promise<string> {
    const lockFilePath = this.getLockFilePath(basePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${lockFilePath}.backup-${timestamp}`;
    
    try {
      await fs.copyFile(lockFilePath, backupPath);
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to backup lock file: ${error.message}`);
    }
  }
  
  async restoreLockFile(basePath: string, backupPath: string): Promise<void> {
    const lockFilePath = this.getLockFilePath(basePath);
    
    try {
      await fs.copyFile(backupPath, lockFilePath);
    } catch (error) {
      throw new Error(`Failed to restore lock file: ${error.message}`);
    }
  }
  
  async cleanupOldBackups(basePath: string, keepCount: number = 5): Promise<void> {
    const lockFilePath = this.getLockFilePath(basePath);
    const dir = path.dirname(lockFilePath);
    const baseName = path.basename(lockFilePath);
    
    try {
      const files = await fs.readdir(dir);
      const backupFiles = files
        .filter(file => file.startsWith(`${baseName}.backup-`))
        .map(file => ({
          name: file,
          path: path.join(dir, file),
          stat: null as any
        }));
      
      // Get file stats for sorting by creation time
      for (const backup of backupFiles) {
        try {
          backup.stat = await fs.stat(backup.path);
        } catch (error) {
          // Skip files we can't stat
        }
      }
      
      // Sort by creation time, newest first
      backupFiles.sort((a, b) => {
        if (!a.stat || !b.stat) return 0;
        return b.stat.ctime.getTime() - a.stat.ctime.getTime();
      });
      
      // Remove old backups beyond keepCount
      const toDelete = backupFiles.slice(keepCount);
      for (const backup of toDelete) {
        try {
          await fs.unlink(backup.path);
        } catch (error) {
          // Ignore errors when deleting old backups
        }
      }
    } catch (error) {
      // Ignore errors in cleanup
    }
  }
}

export const lockFileManager = new LockFileManager();