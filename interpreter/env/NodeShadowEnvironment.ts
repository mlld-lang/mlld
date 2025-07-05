import * as vm from 'vm';
import * as path from 'path';

/**
 * Node.js shadow environment using VM module for module-level isolation.
 * Each mlld file gets its own VM context where shadow functions can call each other.
 */
export class NodeShadowEnvironment {
  private context: vm.Context;
  private shadowFunctions: Map<string, Function>;
  private basePath: string;
  private currentFile?: string;
  private isCleaningUp: boolean = false;
  
  constructor(basePath: string, currentFile?: string) {
    this.basePath = basePath;
    this.currentFile = currentFile;
    this.shadowFunctions = new Map();
    
    // Create base context with Node.js globals
    // NOTE: Including timer functions (setTimeout, etc.) in the context
    // may cause the process to hang if they create timers that aren't cleaned up
    this.context = vm.createContext({
      // Console and basic I/O
      console,
      process,
      
      // Module system
      require,
      module,
      exports,
      
      // Path information
      __dirname: currentFile ? path.dirname(currentFile) : basePath,
      __filename: currentFile || '',
      
      // Timers
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
      
      // Node.js globals
      Buffer,
      global,
      URL,
      URLSearchParams,
      
      // Promise/async support
      Promise,
      queueMicrotask,
      
      // Keep reference to shadow functions map for inter-function calls
      __mlldShadowFunctions: this.shadowFunctions
    });
  }
  
  /**
   * Add a function to the shadow environment
   */
  addFunction(name: string, func: Function): void {
    this.shadowFunctions.set(name, func);
    // Make function available in context
    this.context[name] = func;
  }
  
  /**
   * Execute code in the shadow environment with optional parameters
   */
  async execute(code: string, params?: Record<string, any>): Promise<any> {
    // Check if cleanup has been called
    if (this.isCleaningUp) {
      throw new Error('Node shadow environment error: Cannot execute after cleanup');
    }
    
    // Add parameters to the existing context
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        this.context[key] = value;
      }
    }
    
    // Wrap code to handle async and capture return values
    const wrappedCode = `
      (async () => {
        ${code}
      })()
    `;
    
    try {
      const script = new vm.Script(wrappedCode, {
        filename: this.currentFile || 'node-shadow-env',
        lineOffset: -1, // Adjust for wrapper
        columnOffset: 0
      });
      
      const result = await script.runInContext(this.context);
      
      // Clean up parameters from context after execution
      if (params) {
        for (const key of Object.keys(params)) {
          delete this.context[key];
        }
      }
      
      return result;
    } catch (error) {
      // Clean up parameters even on error
      if (params) {
        for (const key of Object.keys(params)) {
          delete this.context[key];
        }
      }
      
      
      // Preserve original error message but add context via stack trace
      if (error instanceof Error && !error.message.includes('Node shadow environment error:')) {
        // Add context to stack trace instead of wrapping the message
        error.stack = `Node shadow environment error: ${error.message}\n${error.stack}`;
      }
      throw error;
    }
  }
  
  /**
   * Get a copy of the context (for inspection/debugging)
   */
  getContext(): any {
    return { ...this.context };
  }
  
  /**
   * Check if a function exists in the shadow environment
   */
  hasFunction(name: string): boolean {
    return this.shadowFunctions.has(name);
  }
  
  /**
   * Get all function names in the shadow environment
   */
  getFunctionNames(): string[] {
    return Array.from(this.shadowFunctions.keys());
  }
  
  /**
   * Clean up the VM context and clear any pending timers/resources
   */
  cleanup(): void {
    this.isCleaningUp = true;
    
    // Clear shadow functions first
    this.shadowFunctions.clear();
    
    // Simply replace the context with an empty one to break all references
    // This is the simplest and most effective approach for cleanup
    this.context = vm.createContext({});
  }
}