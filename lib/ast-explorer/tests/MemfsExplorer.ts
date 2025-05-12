import { Explorer, ExplorerOptions, IFileSystemAdapter } from '../src/explorer';
import { MemfsTestFileSystem } from './utils/MemfsTestFileSystem';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Explorer implementation that uses memfs for filesystem operations
 * This allows tests to run without touching the real filesystem
 */
export class MemfsExplorer extends Explorer {
  private memfs: MemfsTestFileSystem;
  private originalFs: any;
  private fsAdapter: IFileSystemAdapter;

  constructor(options: ExplorerOptions = {}, memfs?: MemfsTestFileSystem) {
    // Store memfs instance temporarily
    const tempMemfs = memfs || new MemfsTestFileSystem();
    tempMemfs.initialize();

    // Monkey patch fs functions BEFORE calling super
    // Save original methods
    const originalWriteFileSync = fs.writeFileSync;
    const originalReadFileSync = fs.readFileSync;
    const originalExistsSync = fs.existsSync;
    const originalMkdirSync = fs.mkdirSync;
    const originalReaddirSync = fs.readdirSync;
    const originalRmSync = fs.rmSync;

    // Override fs methods to use memfs
    fs.writeFileSync = (filePath: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: any): void => {
      // Convert Buffer to string if needed
      const content = typeof data === 'string' ? data : data.toString();
      return tempMemfs.writeFileSync(filePath.toString(), content);
    };

    fs.readFileSync = (filePath: fs.PathOrFileDescriptor, options?: any): string | Buffer => {
      // Return as string since that's what memfs returns
      return tempMemfs.readFileSync(filePath.toString());
    };

    fs.existsSync = (path: fs.PathLike): boolean => {
      return tempMemfs.existsSync(path.toString());
    };

    fs.mkdirSync = (path: fs.PathLike, options?: fs.MakeDirectoryOptions): string | undefined => {
      tempMemfs.mkdirSync(path.toString(), options as any);
      return undefined;
    };

    fs.readdirSync = (path: fs.PathLike, options?: any): string[] => {
      return tempMemfs.readDir(path.toString());
    };

    fs.rmSync = (path: fs.PathLike, options?: fs.RmOptions): void => {
      return tempMemfs.remove(path.toString());
    };

    // Create a filesystem adapter using memfs
    const fileSystemAdapter: IFileSystemAdapter = {
      writeFileSync: (filePath: string, data: string, encoding?: string): void => {
        return tempMemfs.writeFileSync(filePath, data);
      },
      readFileSync: (filePath: string, encoding?: string): string => {
        return tempMemfs.readFileSync(filePath);
      },
      existsSync: (filePath: string): boolean => {
        return tempMemfs.existsSync(filePath);
      },
      mkdirSync: (dirPath: string, options?: any): void => {
        return tempMemfs.mkdirSync(dirPath, options);
      },
      readdirSync: (dirPath: string): string[] => {
        return tempMemfs.readDir(dirPath);
      },
      rmSync: (filePath: string, options?: any): void => {
        return tempMemfs.remove(filePath);
      },
      lstatSync: (filePath: string): { isDirectory: () => boolean } => {
        return {
          isDirectory: () => tempMemfs.isDirectory(filePath)
        };
      }
    };

    // Store the adapter for later use
    this.fsAdapter = fileSystemAdapter;

    // Call super after fs has been patched, passing the filesystem adapter
    super({
      ...options,
      fileSystem: fileSystemAdapter
    });

    // Now initialize instance properties
    this.memfs = tempMemfs;
    this.originalFs = {
      writeFileSync: originalWriteFileSync,
      readFileSync: originalReadFileSync,
      existsSync: originalExistsSync,
      mkdirSync: originalMkdirSync,
      readdirSync: originalReaddirSync,
      rmSync: originalRmSync
    };
  }
  
  /**
   * Restore original fs methods
   */
  restoreFs() {
    if (this.originalFs) {
      fs.writeFileSync = this.originalFs.writeFileSync;
      fs.readFileSync = this.originalFs.readFileSync;
      fs.existsSync = this.originalFs.existsSync;
      fs.mkdirSync = this.originalFs.mkdirSync;
      fs.readdirSync = this.originalFs.readdirSync;
      fs.rmSync = this.originalFs.rmSync;
    }
  }
  
  /**
   * Clean up resources
   */
  async cleanup() {
    this.restoreFs();
    await this.memfs.cleanup();
  }
  
  /**
   * Helper for tests to access memfs directly
   */
  getMemfs(): MemfsTestFileSystem {
    return this.memfs;
  }

  /**
   * Helper for tests to access the filesystem adapter
   */
  getFileSystemAdapter(): IFileSystemAdapter {
    return this.fsAdapter;
  }

  /**
   * Enhanced methods to support the new AST explorer features
   */

  /**
   * Process files from convention-based directory structure
   */
  processConventionalExamples(baseDir: string, outputDir: string): void {
    // Import and call processEnhancedExampleDirs with our filesystem adapter
    const { processEnhancedExampleDirs } = require('../src/enhanced-batch');
    processEnhancedExampleDirs(baseDir, outputDir, this.fsAdapter);
  }

  /**
   * Generate enhanced type definitions
   */
  generateEnhancedTypes(directives: any[], outputDir: string): void {
    // Import and call generateEnhancedTypes with our filesystem adapter
    const { generateEnhancedTypes } = require('../src/generate/enhanced-types');
    generateEnhancedTypes(directives, outputDir, this.fsAdapter);
  }
}