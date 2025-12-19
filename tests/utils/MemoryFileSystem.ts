import type { IFileSystemService } from '@services/fs/IFileSystemService';

/**
 * In-memory file system for testing
 * Implements the IFileSystemService interface needed by the interpreter
 */
export class MemoryFileSystem implements IFileSystemService {
  private files = new Map<string, string>();
  
  async readFile(filePath: string): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);
    
    
    const content = this.files.get(normalizedPath);
    if (content === undefined) {
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
      error.code = 'ENOENT';
      error.path = filePath;
      throw error;
    }
    return content;
  }
  
  async writeFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    
    // Create parent directories if they don't exist
    const dir = this.dirname(normalizedPath);
    if (dir && dir !== '/' && !await this.isDirectory(dir)) {
      await this.mkdir(dir, { recursive: true });
    }
    this.files.set(normalizedPath, content);
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    const existing = this.files.get(normalizedPath) || '';
    // Create parent directories if needed
    const dir = this.dirname(normalizedPath);
    if (dir && dir !== '/' && !await this.isDirectory(dir)) {
      await this.mkdir(dir, { recursive: true });
    }
    this.files.set(normalizedPath, existing + content);
  }
  
  async exists(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    // Check if it's a file
    if (this.files.has(normalizedPath)) {
      return true;
    }
    // Check if it's a directory
    return await this.isDirectory(normalizedPath);
  }
  
  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const normalizedPath = this.normalizePath(dirPath);
    if (options?.recursive) {
      // Create all parent directories
      const parts = normalizedPath.split('/').filter(p => p);
      let current = '';
      for (const part of parts) {
        current = current ? `${current}/${part}` : `/${part}`;
        // Mark as directory by adding trailing slash in our tracking
        this.files.set(current + '/.dir', '');
      }
    } else {
      // Just create this directory
      this.files.set(normalizedPath + '/.dir', '');
    }
  }
  
  async readdir(dirPath: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(dirPath);
    const entries = new Set<string>();
    const prefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
    
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix) && filePath !== prefix) {
        const relativePath = filePath.slice(prefix.length);
        // Skip .dir markers
        if (relativePath === '.dir') continue;
        
        const firstSegment = relativePath.split('/')[0];
        if (firstSegment && firstSegment !== '.dir') {
          entries.add(firstSegment);
        }
      }
    }
    
    return Array.from(entries).sort();
  }
  
  async isDirectory(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    
    // Root is always a directory
    if (normalizedPath === '/') return true;
    
    // Check if we have a .dir marker
    if (this.files.has(normalizedPath + '/.dir')) {
      return true;
    }
    
    // Check if any files exist under this path
    const prefix = normalizedPath + '/';
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }
  
  async stat(filePath: string): Promise<{ isDirectory(): boolean; isFile(): boolean; size?: number }> {
    const normalizedPath = this.normalizePath(filePath);
    const isDir = await this.isDirectory(normalizedPath);
    const isFile = this.files.has(normalizedPath) && !normalizedPath.endsWith('/.dir');

    if (!isDir && !isFile) {
      const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as any;
      error.code = 'ENOENT';
      error.path = filePath;
      throw error;
    }

    const content = isFile ? this.files.get(normalizedPath) : '';

    return {
      isDirectory: () => isDir,
      isFile: () => isFile,
      size: content ? Buffer.byteLength(content, 'utf8') : 0
    };
  }

  isVirtual(): boolean {
    return true;
  }
  
  // Add execute method for command execution (needed by Environment)
  async execute(command: string, _options?: any): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Mock implementation - can be customized per test
    return {
      stdout: `Mock output for: ${command}`,
      stderr: '',
      exitCode: 0
    };
  }
  
  // Helper methods
  private normalizePath(filePath: string): string {
    // Normalize the path to always use forward slashes and handle edge cases
    if (!filePath || filePath === '.') return '/';
    
    // Ensure absolute paths
    let normalized = filePath.startsWith('/') ? filePath : '/' + filePath;
    
    // Remove trailing slashes except for root
    if (normalized !== '/' && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    // Handle double slashes
    normalized = normalized.replace(/\/+/g, '/');
    
    return normalized;
  }
  
  private dirname(filePath: string): string {
    const normalized = this.normalizePath(filePath);
    if (normalized === '/') return '/';
    
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === 0) return '/';
    return normalized.slice(0, lastSlash);
  }
  
  // Extended methods for compatibility with code that uses fs directly
  async rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    
    if (options?.recursive) {
      // Remove all files under this path
      const toRemove: string[] = [];
      for (const key of this.files.keys()) {
        if (key.startsWith(normalizedPath)) {
          toRemove.push(key);
        }
      }
      toRemove.forEach(key => this.files.delete(key));
    } else {
      // Just remove this specific file
      if (!this.files.delete(normalizedPath) && !options?.force) {
        const error = new Error(`ENOENT: no such file or directory, rm '${filePath}'`) as any;
        error.code = 'ENOENT';
        throw error;
      }
    }
  }
  
  // Access method for compatibility
  async access(filePath: string): Promise<void> {
    if (!await this.exists(filePath)) {
      const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as any;
      error.code = 'ENOENT';
      throw error;
    }
  }
}
