/**
 * FsManager handles fs patching in a centralized way
 * to avoid conflicts between multiple test files
 */
import { IFileSystemAdapter } from '../../src/explorer';
import { TracedAdapter } from '../TracedAdapter';
import { MemfsAdapter } from '../MemfsAdapter';

// Singleton instance to manage fs patching
class FsManagerSingleton {
  private static instance: FsManagerSingleton;
  private isPatched: boolean = false;
  private activeAdapter: TracedAdapter | null = null;
  private originalFs: Record<string, Function> = {};
  
  private constructor() {
    // Private constructor to enforce singleton
  }
  
  public static getInstance(): FsManagerSingleton {
    if (!FsManagerSingleton.instance) {
      FsManagerSingleton.instance = new FsManagerSingleton();
    }
    return FsManagerSingleton.instance;
  }
  
  /**
   * Get the currently active filesystem adapter
   */
  public getAdapter(): TracedAdapter | null {
    return this.activeAdapter;
  }
  
  /**
   * Create a new adapter and patch fs
   */
  public setupFsAdapter(): TracedAdapter {
    // If already patched, return current adapter
    if (this.isPatched && this.activeAdapter) {
      console.log('Returning existing patched adapter');
      return this.activeAdapter;
    }
    
    // Create a new memfs adapter
    const memfsAdapter = new MemfsAdapter();
    
    // Create a traced adapter to wrap it
    const tracedAdapter = new TracedAdapter(memfsAdapter);
    
    // Store original fs methods before patching
    this.backupFsMethods();
    
    // Set up the adapter
    this.patchFs(tracedAdapter);
    this.activeAdapter = tracedAdapter;
    
    return tracedAdapter;
  }
  
  /**
   * Backup original fs methods
   */
  private backupFsMethods(): void {
    if (Object.keys(this.originalFs).length === 0) {
      const fs = require('fs');
      this.originalFs = {
        writeFileSync: fs.writeFileSync,
        readFileSync: fs.readFileSync,
        existsSync: fs.existsSync,
        mkdirSync: fs.mkdirSync,
        readdirSync: fs.readdirSync,
        statSync: fs.statSync,
        rmSync: fs.rmSync
      };
    }
  }
  
  /**
   * Patch fs with adapter
   */
  private patchFs(adapter: IFileSystemAdapter): void {
    const fs = require('fs');
    
    // Monkey patch fs methods
    fs.writeFileSync = (path: string, content: string, options?: any) => {
      console.log('FS.writeFileSync intercepted:', path);
      return adapter.writeFileSync(path, content, options?.encoding);
    };
    
    fs.readFileSync = (path: string, options?: any) => {
      console.log('FS.readFileSync intercepted:', path);
      return adapter.readFileSync(path, options?.encoding || options);
    };
    
    fs.existsSync = (path: string) => {
      console.log('FS.existsSync intercepted:', path);
      return adapter.existsSync(path);
    };
    
    fs.mkdirSync = (path: string, options?: any) => {
      console.log('FS.mkdirSync intercepted:', path);
      return adapter.mkdirSync(path, options);
    };
    
    fs.readdirSync = (path: string) => {
      console.log('FS.readdirSync intercepted:', path);
      return adapter.readdirSync(path);
    };
    
    // Create proxy for stat calls
    fs.statSync = (path: string) => {
      console.log('FS.statSync intercepted:', path);
      const isDir = adapter.existsSync(path); // Use this as a proxy for isDirectory
      return {
        isDirectory: () => isDir,
        isFile: () => !isDir
      };
    };
    
    fs.rmSync = (path: string, options?: any) => {
      console.log('FS.rmSync intercepted:', path);
      return adapter.rmSync(path, options);
    };
    
    this.isPatched = true;
  }
  
  /**
   * Restore original fs methods
   */
  public restoreFs(): void {
    if (this.isPatched && Object.keys(this.originalFs).length > 0) {
      const fs = require('fs');
      
      // Restore all methods
      for (const [method, originalFunc] of Object.entries(this.originalFs)) {
        fs[method] = originalFunc;
      }
      
      this.isPatched = false;
      this.activeAdapter = null;
    }
  }
  
  /**
   * Clean up resources and restore fs
   */
  public async cleanup(): Promise<void> {
    // Clean up memfs
    if (this.activeAdapter) {
      await this.activeAdapter.cleanup();
    }
    
    // Restore original fs
    this.restoreFs();
  }
}

// Export singleton instance
export const FsManager = FsManagerSingleton.getInstance();

// Export a test setup helper
export function setupTestFileSystem(): { fsAdapter: TracedAdapter, cleanup: () => Promise<void> } {
  // Get centrally managed adapter
  const fsAdapter = FsManager.setupFsAdapter();
  
  // Create a cleanup function
  const cleanup = async (): Promise<void> => {
    await FsManager.cleanup();
  };
  
  return { fsAdapter, cleanup };
}