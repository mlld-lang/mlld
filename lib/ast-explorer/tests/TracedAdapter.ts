import { IFileSystemAdapter } from '../src/explorer';
import { MemfsAdapter } from './MemfsAdapter';

/**
 * TracedAdapter wraps another adapter and logs all calls
 * This helps debug issues with filesystem operations
 */
export class TracedAdapter implements IFileSystemAdapter {
  private adapter: IFileSystemAdapter;
  private calls: {method: string, args: any[], result?: any, error?: any}[] = [];
  
  constructor(adapter?: IFileSystemAdapter) {
    this.adapter = adapter || new MemfsAdapter();
    console.log('TracedAdapter created with wrapped adapter type:', this.adapter.constructor.name);
  }
  
  /**
   * Get the call history
   */
  getCalls(): any[] {
    return this.calls;
  }
  
  /**
   * Reset call history
   */
  resetCalls(): void {
    this.calls = [];
  }
  
  /**
   * Print call history
   */
  printCalls(): void {
    console.log('TracedAdapter call history:');
    this.calls.forEach((call, i) => {
      console.log(`[${i}] ${call.method}(${JSON.stringify(call.args)})`, 
        call.error ? `ERROR: ${call.error}` : `=> ${call.result}`);
    });
  }
  
  /**
   * Get the underlying adapter
   */
  getAdapter(): IFileSystemAdapter {
    return this.adapter;
  }

  /**
   * For debugging: manually patch fs functions
   */
  patchFs(): void {
    const originalWriteFileSync = require('fs').writeFileSync;
    const originalReadFileSync = require('fs').readFileSync;

    // Force override the fs module
    require('fs').writeFileSync = (path: string, content: string) => {
      console.log('FS.writeFileSync intercepted:', path);
      this.writeFileSync(path, content);
    };

    require('fs').readFileSync = (path: string) => {
      console.log('FS.readFileSync intercepted:', path);
      return this.readFileSync(path);
    };
  }
  
  // IFileSystemAdapter implementation with tracing
  
  writeFileSync(path: string, content: string, encoding?: string): void {
    try {
      console.log(`TracedAdapter.writeFileSync(${path}, [content], ${encoding})`);
      this.adapter.writeFileSync(path, content, encoding);
      this.calls.push({
        method: 'writeFileSync',
        args: [path, content, encoding],
        result: 'success'
      });
    } catch (error) {
      console.error(`TracedAdapter.writeFileSync ERROR:`, error);
      this.calls.push({
        method: 'writeFileSync',
        args: [path, content, encoding],
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  readFileSync(path: string, encoding?: string): string {
    try {
      console.log(`TracedAdapter.readFileSync(${path}, ${encoding})`);
      const result = this.adapter.readFileSync(path, encoding);
      this.calls.push({
        method: 'readFileSync',
        args: [path, encoding],
        result: result.length > 100 ? `${result.substring(0, 100)}...` : result
      });
      return result;
    } catch (error) {
      console.error(`TracedAdapter.readFileSync ERROR:`, error);
      this.calls.push({
        method: 'readFileSync',
        args: [path, encoding],
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  existsSync(path: string): boolean {
    try {
      console.log(`TracedAdapter.existsSync(${path})`);
      const result = this.adapter.existsSync(path);
      this.calls.push({
        method: 'existsSync',
        args: [path],
        result
      });
      return result;
    } catch (error) {
      console.error(`TracedAdapter.existsSync ERROR:`, error);
      this.calls.push({
        method: 'existsSync',
        args: [path],
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    try {
      console.log(`TracedAdapter.mkdirSync(${path}, ${JSON.stringify(options)})`);
      this.adapter.mkdirSync(path, options);
      this.calls.push({
        method: 'mkdirSync',
        args: [path, options],
        result: 'success'
      });
    } catch (error) {
      console.error(`TracedAdapter.mkdirSync ERROR:`, error);
      this.calls.push({
        method: 'mkdirSync',
        args: [path, options],
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  readdirSync(path: string): string[] {
    try {
      console.log(`TracedAdapter.readdirSync(${path})`);
      const result = this.adapter.readdirSync(path);
      this.calls.push({
        method: 'readdirSync',
        args: [path],
        result
      });
      return result;
    } catch (error) {
      console.error(`TracedAdapter.readdirSync ERROR:`, error);
      this.calls.push({
        method: 'readdirSync',
        args: [path],
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  rmSync(path: string, options?: { recursive?: boolean, force?: boolean }): void {
    try {
      console.log(`TracedAdapter.rmSync(${path}, ${JSON.stringify(options)})`);
      this.adapter.rmSync(path, options);
      this.calls.push({
        method: 'rmSync',
        args: [path, options],
        result: 'success'
      });
    } catch (error) {
      console.error(`TracedAdapter.rmSync ERROR:`, error);
      this.calls.push({
        method: 'rmSync',
        args: [path, options],
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Dump file system state (if supported by adapter)
   */
  dump(): any {
    if (typeof (this.adapter as any).dump === 'function') {
      return (this.adapter as any).dump();
    }
    return 'Adapter does not support dump()';
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (typeof (this.adapter as any).cleanup === 'function') {
      return (this.adapter as any).cleanup();
    }
  }
}