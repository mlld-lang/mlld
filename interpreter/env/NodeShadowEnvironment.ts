import * as vm from 'vm';
import * as path from 'path';
import * as fs from 'fs';
import Module from 'module';

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
    
    // Create custom require function with proper module resolution
    const customRequire = this.createCustomRequire();
    
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
      
      // Module system with custom require
      require: customRequire,
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
  async execute(code: string, params?: Record<string, any>, captureConsoleLog: boolean = true): Promise<any> {
    // Check if cleanup has been called
    if (this.isCleaningUp) {
      throw new Error('Node shadow environment error: Cannot execute after cleanup');
    }
    
    // Track console.log output if requested
    let lastConsoleLogValue: any = undefined;
    const originalLog = this.context.console.log;
    
    if (captureConsoleLog) {
      // Override console.log to capture the last logged value
      this.context.console.log = (...args: any[]) => {
        // Call original console.log
        originalLog.apply(this.context.console, args);
        
        // Capture the last value (single arg) or array (multiple args)
        if (args.length === 1) {
          lastConsoleLogValue = args[0];
        } else if (args.length > 1) {
          lastConsoleLogValue = args;
        }
      };
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
      
      // Restore original console.log if we modified it
      if (captureConsoleLog) {
        this.context.console.log = originalLog;
      }
      
      // Clean up parameters from context after execution
      if (params) {
        for (const key of Object.keys(params)) {
          delete this.context[key];
        }
      }
      
      // If there's an explicit return value, use it
      // Otherwise, if console.log was called and we're capturing, use the last logged value
      return result !== undefined ? result : (captureConsoleLog ? lastConsoleLogValue : undefined);
    } catch (error) {
      // Restore original console.log on error if we modified it
      if (captureConsoleLog) {
        this.context.console.log = originalLog;
      }
      
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
  
  /**
   * Create a custom require function that includes mlld's dependencies
   */
  private createCustomRequire(): NodeRequire {
    const currentDir = this.currentFile ? path.dirname(this.currentFile) : this.basePath;
    
    // Build module paths including mlld's node_modules
    const modulePaths = this.buildModulePaths(currentDir);
    
    // Create a new Module instance for proper require context
    const dummyModule = new Module(this.currentFile || 'mlld-shadow-env', null);
    dummyModule.filename = this.currentFile || path.join(currentDir, 'mlld-shadow-env.js');
    dummyModule.paths = modulePaths;
    
    // Return the require function bound to this module
    return dummyModule.require.bind(dummyModule);
  }
  
  /**
   * Build module paths including mlld's dependencies
   */
  private buildModulePaths(fromDir: string): string[] {
    const paths: string[] = [];
    
    // Add all parent node_modules directories from the current location
    let currentPath = fromDir;
    while (currentPath !== path.dirname(currentPath)) {
      paths.push(path.join(currentPath, 'node_modules'));
      currentPath = path.dirname(currentPath);
    }
    
    // Determine mlld's node_modules path
    let mlldNodeModules: string | undefined;
    
    // First check if we're in development (mlld source directory)
    const devNodeModules = path.join(process.cwd(), 'node_modules');
    if (fs.existsSync(devNodeModules) && fs.existsSync(path.join(process.cwd(), 'package.json'))) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
        if (packageJson.name === 'mlld') {
          mlldNodeModules = devNodeModules;
        }
      } catch {
        // Ignore parse errors
      }
    }
    
    // If not in dev, try to find mlld's installation directory
    if (!mlldNodeModules) {
      try {
        // Try to resolve mlld's package.json location
        const mlldPath = require.resolve('mlld/package.json');
        mlldNodeModules = path.join(path.dirname(mlldPath), 'node_modules');
      } catch {
        // If that fails, try common global install locations
        const possiblePaths = [
          '/opt/homebrew/lib/node_modules/mlld/node_modules',
          '/usr/local/lib/node_modules/mlld/node_modules',
          '/usr/lib/node_modules/mlld/node_modules',
          path.join(process.env.HOME || '', '.npm-global/lib/node_modules/mlld/node_modules')
        ];
        
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            mlldNodeModules = p;
            break;
          }
        }
      }
    }
    
    // Add mlld's node_modules if found and not already in paths
    if (mlldNodeModules && !paths.includes(mlldNodeModules)) {
      paths.push(mlldNodeModules);
    }
    
    // Also add global node_modules paths
    if (process.env.NODE_PATH) {
      const globalPaths = process.env.NODE_PATH.split(path.delimiter);
      for (const p of globalPaths) {
        if (!paths.includes(p)) {
          paths.push(p);
        }
      }
    }
    
    return paths;
  }
}