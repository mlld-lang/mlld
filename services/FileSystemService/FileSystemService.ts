import * as fs from 'fs-extra';
import * as path from 'path';
import { fsLogger as logger } from '../../core/utils/logger';
import { IFileSystemService } from './IFileSystemService';

export class FileSystemService implements IFileSystemService {
  private testMode = false;
  private mockFiles = new Map<string, string>();
  private mockDirs = new Set<string>();

  // File operations
  async readFile(filePath: string): Promise<string> {
    try {
      if (this.testMode) {
        const content = this.mockFiles.get(this.normalize(filePath));
        if (content === undefined) {
          throw new Error(`File not found: ${filePath}`);
        }
        return content;
      }
      
      logger.debug('Reading file', { filePath });
      const content = await fs.readFile(filePath, 'utf-8');
      logger.debug('Successfully read file', { filePath, contentLength: content.length });
      return content;
    } catch (error) {
      logger.error('Failed to read file', { filePath, error });
      throw error;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      if (this.testMode) {
        this.mockFiles.set(this.normalize(filePath), content);
        return;
      }

      logger.debug('Writing file', { filePath, contentLength: content.length });
      await fs.writeFile(filePath, content, 'utf-8');
      logger.debug('Successfully wrote file', { filePath });
    } catch (error) {
      logger.error('Failed to write file', { filePath, error });
      throw error;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      if (this.testMode) {
        const normalizedPath = this.normalize(filePath);
        return this.mockFiles.has(normalizedPath) || this.mockDirs.has(normalizedPath);
      }

      logger.debug('Checking if path exists', { filePath });
      const exists = await fs.pathExists(filePath);
      logger.debug('Path existence check complete', { filePath, exists });
      return exists;
    } catch (error) {
      logger.error('Failed to check path existence', { filePath, error });
      throw error;
    }
  }

  async stat(filePath: string): Promise<fs.Stats> {
    try {
      if (this.testMode) {
        throw new Error('stat() not implemented in test mode');
      }

      logger.debug('Getting file stats', { filePath });
      const stats = await fs.stat(filePath);
      logger.debug('Successfully got file stats', { filePath, isDirectory: stats.isDirectory() });
      return stats;
    } catch (error) {
      logger.error('Failed to get file stats', { filePath, error });
      throw error;
    }
  }

  // Directory operations
  async readDir(dirPath: string): Promise<string[]> {
    try {
      if (this.testMode) {
        const normalizedDirPath = this.normalize(dirPath);
        if (!this.mockDirs.has(normalizedDirPath)) {
          throw new Error(`Directory not found: ${dirPath}`);
        }
        
        const files = Array.from(this.mockFiles.keys())
          .filter(filePath => path.dirname(filePath) === normalizedDirPath)
          .map(filePath => path.basename(filePath));
          
        return files;
      }

      logger.debug('Reading directory', { dirPath });
      const files = await fs.readdir(dirPath);
      logger.debug('Successfully read directory', { dirPath, fileCount: files.length });
      return files;
    } catch (error) {
      logger.error('Failed to read directory', { dirPath, error });
      throw error;
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    try {
      if (this.testMode) {
        this.mockDirs.add(this.normalize(dirPath));
        return;
      }

      logger.debug('Ensuring directory exists', { dirPath });
      await fs.ensureDir(dirPath);
      logger.debug('Successfully ensured directory exists', { dirPath });
    } catch (error) {
      logger.error('Failed to ensure directory exists', { dirPath, error });
      throw error;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      if (this.testMode) {
        const normalizedPath = this.normalize(filePath);
        return this.mockDirs.has(normalizedPath);
      }

      logger.debug('Checking if path is directory', { filePath });
      const stats = await fs.stat(filePath);
      const isDir = stats.isDirectory();
      logger.debug('Path directory check complete', { filePath, isDirectory: isDir });
      return isDir;
    } catch (error) {
      logger.error('Failed to check if path is directory', { filePath, error });
      throw error;
    }
  }

  // Path operations
  join(...paths: string[]): string {
    return path.join(...paths);
  }

  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  // Test mode
  enableTestMode(): void {
    this.testMode = true;
    this.clearMocks();
  }

  disableTestMode(): void {
    this.testMode = false;
    this.clearMocks();
  }

  isTestMode(): boolean {
    return this.testMode;
  }

  // Mock file system (for testing)
  mockFile(filePath: string, content: string): void {
    if (!this.testMode) {
      throw new Error('Cannot mock files outside of test mode');
    }
    this.mockFiles.set(this.normalize(filePath), content);
    
    // Ensure parent directory exists
    const dirPath = path.dirname(filePath);
    if (dirPath !== '.') {
      this.mockDirs.add(this.normalize(dirPath));
    }
  }

  mockDir(dirPath: string): void {
    if (!this.testMode) {
      throw new Error('Cannot mock directories outside of test mode');
    }
    this.mockDirs.add(this.normalize(dirPath));
  }

  clearMocks(): void {
    this.mockFiles.clear();
    this.mockDirs.clear();
  }

  private normalize(filePath: string): string {
    return path.normalize(filePath);
  }
} 