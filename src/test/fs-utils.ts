import * as fs from 'fs-extra';
import { pathService } from '../services/path-service';
import * as pathModule from 'path';
import { addMockFile, clearMocks } from '../__mocks__/fs';
import { createPathMock } from '../../tests/__mocks__/path';
const { resolve, join, dirname } = pathModule;

const TEST_ROOT = resolve(process.cwd(), 'test', '_tmp');

// Error classes for filesystem operations
export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathValidationError';
  }
}

export class PathTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTypeError';
  }
}

export class PathNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathNotFoundError';
  }
}

export class PathExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathExistsError';
  }
}

/**
 * Test filesystem utilities for working with temporary directories
 * and path resolution in tests.
 */
export class TestFileSystem {
  private testRoot: string;
  private testHome: string;
  private testProject: string;
  private pathMock: any;
  private files: Map<string, string>;

  constructor() {
    this.testRoot = TEST_ROOT;
    this.testHome = join(this.testRoot, 'home');
    this.testProject = join(this.testRoot, 'project');
    this.files = new Map();
  }

  /**
   * Validate a path for common issues
   */
  private validatePath(filePath: string): void {
    if (!filePath) {
      throw new PathValidationError('Invalid path "": Path cannot be empty');
    }
    if (filePath.includes('\0')) {
      throw new PathValidationError('Path contains null bytes');
    }
    if (filePath.includes('..')) {
      throw new PathValidationError('Path traversal is not allowed');
    }
    if (process.platform === 'win32') {
      const invalidChars = /[<>:"|?*]/;
      if (invalidChars.test(filePath)) {
        throw new PathValidationError('Path contains invalid characters for Windows');
      }
    }
  }

  /**
   * Get a normalized path in the test filesystem
   */
  private getFullPath(filePath: string): string {
    // Handle special variables
    if (filePath.startsWith('$PROJECTPATH/')) {
      filePath = filePath.replace('$PROJECTPATH/', 'project/');
    } else if (filePath.startsWith('$HOMEPATH/')) {
      filePath = filePath.replace('$HOMEPATH/', 'home/');
    } else if (filePath.startsWith('$~/')) {
      filePath = filePath.replace('$~/', 'home/');
    } else if (filePath.startsWith('$./')) {
      filePath = filePath.replace('$./', 'project/');
    }

    // Before pathMock is initialized, use the regular path module
    if (!this.pathMock) {
      return join(this.testRoot, filePath);
    }
    return this.pathMock.join(this.testRoot, filePath);
  }

  /**
   * Initialize the test filesystem
   */
  async initialize(): Promise<void> {
    // Clear any existing mock state
    clearMocks();
    this.files.clear();

    // Initialize path mock with test directories
    this.pathMock = await createPathMock({
      testRoot: this.testRoot,
      testHome: this.testHome,
      testProject: this.testProject
    });

    // Configure PathService to use test directories
    pathService.enableTestMode(this.testHome, this.testProject);

    // Create the test root directory
    this.files.set(this.testRoot, '');
    addMockFile(this.testRoot, '');

    // Create home and project directories with their full paths
    this.createParentDirectories(this.testHome);
    this.createParentDirectories(this.testProject);
  }

  /**
   * Create all parent directories for a given path
   */
  private createParentDirectories(fullPath: string): void {
    const parts = fullPath.split(/[\/\\]/);
    let currentPath = '';
    
    // Create each directory in the path
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i]) {
        currentPath = currentPath ? join(currentPath, parts[i]) : parts[i];
        const dirPath = this.getFullPath(currentPath);
        if (!this.files.has(dirPath)) {
          this.files.set(dirPath, '');
          addMockFile(dirPath, '');
        } else if (this.files.get(dirPath) !== '') {
          throw new PathExistsError('Cannot create directory, path exists as a file');
        }
      }
    }
  }

  /**
   * Write a file in the test filesystem
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    this.validatePath(filePath);
    const fullPath = this.getFullPath(filePath);

    // Check if path exists as directory
    if (this.files.has(fullPath) && this.files.get(fullPath) === '') {
      throw new PathTypeError(`Path "${filePath}" exists but is not a file`);
    }

    // Check if trying to create directory at file path
    const parentPath = dirname(fullPath);
    if (this.files.has(parentPath) && this.files.get(parentPath) !== '') {
      throw new PathExistsError('Cannot create directory, path exists as a file');
    }

    // Ensure parent directories exist
    this.createParentDirectories(filePath);
    this.files.set(fullPath, content);
    addMockFile(fullPath, content);
  }

  /**
   * Read a file from the test filesystem
   */
  async readFile(filePath: string): Promise<string> {
    this.validatePath(filePath);
    const fullPath = this.getFullPath(filePath);
    
    if (!this.files.has(fullPath)) {
      throw new PathNotFoundError('File does not exist');
    }
    const content = this.files.get(fullPath);
    if (content === undefined || content === '') {
      throw new PathTypeError('Path exists but is not a file');
    }
    
    return content;
  }

  /**
   * Check if a file exists in the test filesystem
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.getFullPath(filePath);
    return this.files.has(fullPath);
  }

  /**
   * Get the absolute path in the test filesystem
   */
  getPath(filePath: string): string {
    return this.getFullPath(filePath);
  }

  /**
   * Get the test home directory path
   */
  getHomePath(): string {
    return this.testHome;
  }

  /**
   * Get the test project directory path
   */
  getProjectPath(): string {
    return this.testProject;
  }

  /**
   * Clean up the test filesystem
   */
  async cleanup(): Promise<void> {
    pathService.disableTestMode();
    clearMocks();
    this.files.clear();
  }

  /**
   * Verify that a directory exists and contains exactly the expected files
   */
  async verifyDirectory(dirPath: string, expectedFiles: string[]): Promise<void> {
    this.validatePath(dirPath);
    const fullPath = this.getFullPath(dirPath);
    
    if (!this.files.has(fullPath)) {
      throw new PathNotFoundError('Directory does not exist');
    }
    if (this.files.get(fullPath) !== '') {
      throw new PathTypeError('Path exists but is not a directory');
    }

    const actualFiles = this.getDirectoryFiles(dirPath);
    const missing = expectedFiles.filter(f => !actualFiles.includes(f));
    const unexpected = actualFiles.filter(f => !expectedFiles.includes(f));

    if (missing.length > 0) {
      throw new Error(`Missing expected files: ${missing.join(', ')}`);
    }
    if (unexpected.length > 0) {
      throw new Error(`Unexpected files: ${unexpected.join(', ')}`);
    }
  }

  /**
   * Verify that a file exists and has the expected content
   */
  async verifyFile(filePath: string, expectedContent: string): Promise<void> {
    this.validatePath(filePath);
    const fullPath = this.getFullPath(filePath);
    
    if (!this.files.has(fullPath)) {
      throw new PathNotFoundError('File does not exist');
    }
    const content = this.files.get(fullPath);
    if (content === undefined || content === '') {
      throw new PathTypeError('Path exists but is not a file');
    }

    if (content !== expectedContent) {
      throw new Error('File content mismatch');
    }
  }

  /**
   * Verify that a path does not exist
   */
  async verifyPathDoesNotExist(filePath: string): Promise<void> {
    this.validatePath(filePath);
    const fullPath = this.getFullPath(filePath);
    
    if (this.files.has(fullPath)) {
      throw new PathExistsError('Path exists but should not');
    }
  }

  /**
   * Get list of files in a directory
   */
  getDirectoryFiles(dirPath: string): string[] {
    this.validatePath(dirPath);
    const fullPath = this.getFullPath(dirPath);
    
    if (!this.files.has(fullPath)) {
      throw new PathNotFoundError('Directory does not exist');
    }
    if (this.files.get(fullPath) !== '') {
      throw new PathTypeError('Path exists but is not a directory');
    }

    const prefix = fullPath + (fullPath.endsWith('/') ? '' : '/');
    return Array.from(this.files.keys())
      .filter(path => path.startsWith(prefix))
      .map(path => path.slice(prefix.length))
      .filter(name => !name.includes('/'));
  }

  /**
   * Get a snapshot of the current filesystem state
   */
  getSnapshot(): Map<string, string> {
    return new Map(this.files);
  }

  /**
   * Compare current filesystem state with a snapshot
   */
  compareSnapshots(before: Map<string, string>): {
    added: string[];
    removed: string[];
    modified: string[];
    unchanged: string[];
  } {
    const after = this.files;
    const result = {
      added: [] as string[],
      removed: [] as string[],
      modified: [] as string[],
      unchanged: [] as string[]
    };

    // Find added and modified files
    for (const [path, content] of after) {
      if (!before.has(path)) {
        result.added.push(path);
      } else {
        const beforeContent = before.get(path);
        if (beforeContent !== content) {
          result.modified.push(path);
        } else {
          result.unchanged.push(path);
        }
      }
    }

    // Find removed files
    for (const path of before.keys()) {
      if (!after.has(path)) {
        result.removed.push(path);
      }
    }

    return result;
  }

  /**
   * Restore filesystem state from a snapshot
   */
  async restoreSnapshot(
    snapshot: Map<string, string>,
    options?: {
      deleteExtra?: boolean;
      onlyPaths?: string[];
    }
  ): Promise<void> {
    const { deleteExtra = true, onlyPaths } = options || {};

    // Filter paths if onlyPaths is specified
    const shouldRestore = (path: string): boolean => {
      if (!onlyPaths) return true;
      return onlyPaths.some(prefix => path.startsWith(this.getFullPath(prefix)));
    };

    // Restore files from snapshot
    for (const [path, content] of snapshot) {
      if (shouldRestore(path)) {
        this.files.set(path, content);
        addMockFile(path, content);
      }
    }

    // Remove files not in snapshot if deleteExtra is true
    if (deleteExtra) {
      for (const path of this.files.keys()) {
        if (shouldRestore(path) && !snapshot.has(path)) {
          this.files.delete(path);
          // Note: We don't need to remove from mockFiles since it's cleared on cleanup
        }
      }
    }
  }

  /**
   * Get a debug view of the filesystem
   */
  getDebugView(options?: {
    showContent?: boolean;
    maxContentLength?: number;
    filter?: string;
  }): string {
    const { showContent = false, maxContentLength = 50, filter } = options || {};
    const lines: string[] = ['Mock Filesystem State:'];

    const paths = Array.from(this.files.keys()).sort();
    for (const path of paths) {
      // Skip if doesn't match filter
      const relativePath = path.slice(this.testRoot.length + 1);
      if (filter && !relativePath.includes(filter)) continue;

      const content = this.files.get(path);
      if (content === undefined) continue;

      const isDirectory = content === '';
      const icon = isDirectory ? '📁' : '📄';

      let line = `${icon} ${relativePath}${isDirectory ? '/' : ''}`;
      if (showContent && !isDirectory) {
        let preview = content;
        if (preview.length > maxContentLength) {
          preview = preview.slice(0, maxContentLength) + '...';
        }
        line += `: ${preview}`;
      }
      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * Get debug information about a path
   */
  debugPath(filePath: string): string {
    const fullPath = this.getFullPath(filePath);
    const lines: string[] = [`Debug info for path: ${filePath}`];

    if (!this.files.has(fullPath)) {
      lines.push('Type: non-existent');
      lines.push('Exists: false');
      return lines.join('\n');
    }

    const content = this.files.get(fullPath);
    if (content === undefined) {
      lines.push('Type: unknown');
      lines.push('Exists: true');
      lines.push('Error: Invalid state - undefined content');
      return lines.join('\n');
    }

    const isDirectory = content === '';
    lines.push(`Type: ${isDirectory ? 'directory' : 'file'}`);
    lines.push('Exists: true');

    if (isDirectory) {
      lines.push('Directory contents:');
      const prefix = fullPath + (fullPath.endsWith('/') ? '' : '/');
      const files = Array.from(this.files.keys())
        .filter(path => path.startsWith(prefix))
        .map(path => path.slice(prefix.length))
        .filter(name => !name.includes('/'));
      files.forEach(file => lines.push(`- ${file}`));
    } else {
      lines.push(`Content length: ${content.length}`);
      lines.push(`Content preview: ${content}`);
    }

    return lines.join('\n');
  }
} 