/**
 * In-memory file system for testing
 * Implements the minimal interface needed by the interpreter
 */
export class MemoryFileSystem {
  private files = new Map<string, string>();
  
  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    return content;
  }
  
  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content);
  }
  
  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }
  
  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    // No-op for memory file system
  }
  
  async readdir(dirPath: string): Promise<string[]> {
    const entries: string[] = [];
    const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relativePath = filePath.slice(prefix.length);
        const firstSegment = relativePath.split('/')[0];
        if (firstSegment && !entries.includes(firstSegment)) {
          entries.push(firstSegment);
        }
      }
    }
    
    return entries;
  }
  
  async isDirectory(filePath: string): Promise<boolean> {
    const prefix = filePath.endsWith('/') ? filePath : filePath + '/';
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }
  
  async stat(filePath: string): Promise<{ isDirectory(): boolean; isFile(): boolean }> {
    const isDir = await this.isDirectory(filePath);
    const isFile = this.files.has(filePath);
    
    if (!isDir && !isFile) {
      throw new Error(`Path not found: ${filePath}`);
    }
    
    return {
      isDirectory: () => isDir,
      isFile: () => isFile
    };
  }
  
  // Add execute method for command execution (needed by Environment)
  async execute(command: string, options?: any): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Mock implementation - can be customized per test
    return {
      stdout: `Mock output for: ${command}`,
      stderr: '',
      exitCode: 0
    };
  }
}