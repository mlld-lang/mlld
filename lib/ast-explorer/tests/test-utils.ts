/**
 * Test utilities for AST Explorer tests
 */
import * as path from 'path';
import type { IFileSystemAdapter } from '../src/explorer';

/**
 * Mock filesystem for testing
 */
export class MockFileSystem implements IFileSystemAdapter {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  constructor() {
    // Add base directories expected by Explorer
    this.directories.add('./');
    this.directories.add('./examples');
    this.directories.add('./output');
    this.directories.add('./output/snapshots');
    this.directories.add('./output/types');
    this.directories.add('./fixtures');
    this.directories.add('./output/docs');
  }

  writeFileSync(filePath: string, content: string, encoding: string = 'utf8'): void {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    this.mkdirSync(dir, { recursive: true });
    
    this.files.set(filePath, content);
  }

  readFileSync(filePath: string, encoding: string = 'utf8'): string {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    return content;
  }

  existsSync(pathToCheck: string): boolean {
    return this.files.has(pathToCheck) || this.directories.has(pathToCheck);
  }

  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    if (options?.recursive) {
      // Create all parent directories
      const parts = dirPath.split(path.sep).filter(Boolean);
      let currentPath = '.';
      this.directories.add(currentPath);
      
      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        this.directories.add(currentPath);
      }
    } else {
      this.directories.add(dirPath);
    }
  }

  readdirSync(dirPath: string): string[] {
    // Make directory if it doesn't exist (for test purposes)
    if (!this.directories.has(dirPath)) {
      this.directories.add(dirPath);
      return [];
    }

    const result: string[] = [];

    // Get files directly in this directory
    for (const filePath of this.files.keys()) {
      if (path.dirname(filePath) === dirPath) {
        result.push(path.basename(filePath));
      }
    }

    // Get subdirectories directly in this directory
    for (const dirToCheck of this.directories) {
      if (dirToCheck !== dirPath && path.dirname(dirToCheck) === dirPath) {
        result.push(path.basename(dirToCheck));
      }
    }

    return result;
  }

  rmSync(pathToRemove: string, options?: { recursive?: boolean, force?: boolean }): void {
    if (this.directories.has(pathToRemove)) {
      this.directories.delete(pathToRemove);
      
      if (options?.recursive) {
        // Remove all files and directories under this directory
        for (const filePath of [...this.files.keys()]) {
          if (filePath.startsWith(pathToRemove + path.sep)) {
            this.files.delete(filePath);
          }
        }
        
        for (const dirPath of [...this.directories]) {
          if (dirPath.startsWith(pathToRemove + path.sep)) {
            this.directories.delete(dirPath);
          }
        }
      }
    } else if (this.files.has(pathToRemove)) {
      this.files.delete(pathToRemove);
    } else if (!options?.force) {
      throw new Error(`Path not found: ${pathToRemove}`);
    }
  }

  /**
   * Debug method to print all directories and files
   */
  debug(): void {
    console.log('Directories:');
    [...this.directories].sort().forEach(dir => console.log(`  ${dir}`));
    
    console.log('Files:');
    [...this.files.keys()].sort().forEach(file => console.log(`  ${file}`));
  }
}