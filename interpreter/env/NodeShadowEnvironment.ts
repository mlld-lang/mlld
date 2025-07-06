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
  private activeTimers: Set<any> = new Set();
  private activeIntervals: Set<any> = new Set();
  
  constructor(basePath: string, currentFile?: string) {
    this.basePath = basePath;
    this.currentFile = currentFile;
    this.shadowFunctions = new Map();
    
    // Create wrapped timer functions that track active timers
    const wrappedSetTimeout = (callback: Function, delay?: number, ...args: any[]) => {
      const id = setTimeout(() => {
        this.activeTimers.delete(id);
        callback(...args);
      }, delay);
      this.activeTimers.add(id);
      return id;
    };
    
    const wrappedSetInterval = (callback: Function, delay?: number, ...args: any[]) => {
      const id = setInterval(callback, delay, ...args);
      this.activeIntervals.add(id);
      return id;
    };
    
    const wrappedClearTimeout = (id: any) => {
      this.activeTimers.delete(id);
      return clearTimeout(id);
    };
    
    const wrappedClearInterval = (id: any) => {
      this.activeIntervals.delete(id);
      return clearInterval(id);
    };
    
    // Create base context with Node.js globals
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
      
      // Wrapped timers that track active timers
      setTimeout: wrappedSetTimeout,
      setInterval: wrappedSetInterval,
      setImmediate,
      clearTimeout: wrappedClearTimeout,
      clearInterval: wrappedClearInterval,
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
    
    // Clear all tracked timers
    for (const timerId of this.activeTimers) {
      try {
        clearTimeout(timerId);
      } catch (error) {
        // Timer might already be cleared, ignore
      }
    }
    this.activeTimers.clear();
    
    // Clear all tracked intervals
    for (const intervalId of this.activeIntervals) {
      try {
        clearInterval(intervalId);
      } catch (error) {
        // Interval might already be cleared, ignore
      }
    }
    this.activeIntervals.clear();
    
    // Replace the context with an empty one to break all references
    this.context = vm.createContext({});
  }
}