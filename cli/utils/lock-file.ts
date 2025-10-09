import * as path from 'path';
import * as fs from 'fs/promises';
import { LockFile, type ModuleLockEntry } from '@core/registry/LockFile';

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
    return new LockFile(lockFilePath, {
      fallbackPaths: [
        path.join(basePath, 'mlld.lock.json'),
        path.join(basePath, '.mlld', 'mlld.lock.json')
      ]
    });
  }

  getLockFilePath(basePath: string): string {
    return path.join(basePath, 'mlld-lock.json');
  }

  async validateLockFile(lockFile: LockFile): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      missingModules: [],
      corruptedEntries: []
    };

    const modules = lockFile.getAllModules();

    for (const [moduleName, entry] of Object.entries(modules)) {
      this.validateEntry(moduleName, entry, result);
    }

    return result;
  }

  async backupLockFile(basePath: string): Promise<string> {
    const lockFilePath = this.getLockFilePath(basePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${lockFilePath}.backup-${timestamp}`;

    try {
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.copyFile(lockFilePath, backupPath);
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to backup lock file: ${(error as Error).message}`);
    }
  }

  async restoreLockFile(basePath: string, backupPath: string): Promise<void> {
    const lockFilePath = this.getLockFilePath(basePath);

    try {
      await fs.copyFile(backupPath, lockFilePath);
    } catch (error) {
      throw new Error(`Failed to restore lock file: ${(error as Error).message}`);
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

      for (const backup of backupFiles) {
        try {
          backup.stat = await fs.stat(backup.path);
        } catch {
          // Ignore
        }
      }

      backupFiles.sort((a, b) => {
        if (!a.stat || !b.stat) return 0;
        return b.stat.ctime.getTime() - a.stat.ctime.getTime();
      });

      const toDelete = backupFiles.slice(keepCount);
      for (const backup of toDelete) {
        try {
          await fs.unlink(backup.path);
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }
  }

  private validateEntry(moduleName: string, entry: ModuleLockEntry, result: ValidationResult): void {
    if (!entry.resolved) {
      result.errors.push(`Lock entry for ${moduleName} missing resolved hash`);
      result.valid = false;
    }

    if (!entry.integrity) {
      result.warnings.push(`Lock entry for ${moduleName} missing integrity hash`);
    } else if (!entry.integrity.startsWith('sha256')) {
      result.warnings.push(`Lock entry for ${moduleName} uses unexpected integrity format`);
    }

    if (!entry.fetchedAt || Number.isNaN(new Date(entry.fetchedAt).getTime())) {
      result.errors.push(`Lock entry for ${moduleName} has invalid fetchedAt timestamp`);
      result.valid = false;
    } else {
      const fetched = new Date(entry.fetchedAt);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (fetched < oneYearAgo) {
        result.warnings.push(`Lock entry for ${moduleName} is over one year old`);
      }
    }

    if (!entry.source) {
      result.warnings.push(`Lock entry for ${moduleName} missing source information`);
    }
  }
}

export const lockFileManager = new LockFileManager();
