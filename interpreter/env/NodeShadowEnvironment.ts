import * as vm from 'vm';
import * as path from 'path';
import * as fs from 'fs';
import Module, { createRequire } from 'module';
import { fileURLToPath } from 'url';

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
    const { require: customRequire, module: shadowModule, exports: shadowExports } = this.createCustomRequire();
    
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
      module: typeof module !== 'undefined' ? module : shadowModule,
      exports: typeof exports !== 'undefined' ? exports : shadowExports,
      
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
      
      // mlld built-in values
      mlld_now: () => new Date().toISOString(),
      
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
   * Merge captured shadow functions into this environment
   * Used when executing imported functions that have captured shadow environments
   */
  mergeCapturedFunctions(capturedFunctions: Map<string, any> | undefined): void {
    if (!capturedFunctions || capturedFunctions.size === 0) {
      return;
    }
    
    // Add each captured function to our shadow environment
    for (const [name, func] of capturedFunctions) {
      // Don't override existing functions in current environment
      if (!this.shadowFunctions.has(name)) {
        this.addFunction(name, func);
      }
    }
  }
  
  /**
   * Execute code in the shadow environment with optional parameters
   */
  async execute(code: string, params?: Record<string, any>): Promise<any> {
    // Check if cleanup has been called
    if (this.isCleaningUp) {
      throw new Error('Node shadow environment error: Cannot execute after cleanup');
    }
    
    // Track console.log output (same approach as JavaScriptExecutor)
    let consoleOutput = '';
    const originalLog = this.context.console.log;
    
    // Override console.log to always output to stdout and capture for potential return
    this.context.console.log = (...args: any[]) => {
      // Always call original console.log for visibility
      originalLog.apply(this.context.console, args);
      
      // Also capture the output
      consoleOutput += args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ') + '\n';
    };
    
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
      
      // Restore original console.log
      this.context.console.log = originalLog;
      
      // Clean up parameters from context after execution
      if (params) {
        for (const key of Object.keys(params)) {
          delete this.context[key];
        }
      }
      
      // Same hybrid approach as JavaScriptExecutor:
      // - If there's an explicit return value, use it
      // - If no return value but console.log was used, return the console output
      // - Otherwise return undefined
      if (result !== undefined) {
        return result;
      } else if (consoleOutput) {
        // Return console output for backward compatibility
        return consoleOutput.trim();
      }
      return undefined;
    } catch (error) {
      // Restore original console.log on error
      this.context.console.log = originalLog;
      
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
  private createCustomRequire(): { require: NodeRequire; module: Module; exports: any } {
    const currentDir = this.currentFile ? path.dirname(this.currentFile) : this.basePath;
    
    // Build module paths including mlld's node_modules
    const modulePaths = this.buildModulePaths(currentDir);
    
    // Create a new Module instance for proper require context
    const dummyModule = new Module(this.currentFile || 'mlld-shadow-env', null);
    dummyModule.filename = this.currentFile || path.join(currentDir, 'mlld-shadow-env.js');
    dummyModule.paths = modulePaths;
    
    // Return the module and require function bound to this module
    return {
      require: dummyModule.require.bind(dummyModule),
      module: dummyModule,
      exports: dummyModule.exports
    };
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
    const devPackageJson = path.join(process.cwd(), 'package.json');
    const devNodeModulesExists = fs.existsSync(devNodeModules);
    const devPackageJsonExists = fs.existsSync(devPackageJson);

    const debugShadow = process.env.DEBUG_NODE_SHADOW || process.env.CI;
    if (debugShadow) {
      console.error('[NodeShadowEnv] cwd:', process.cwd());
      console.error('[NodeShadowEnv] devNodeModules:', devNodeModules, 'exists:', devNodeModulesExists);
      console.error('[NodeShadowEnv] devPackageJson:', devPackageJson, 'exists:', devPackageJsonExists);
    }

    if (devNodeModulesExists && devPackageJsonExists) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(devPackageJson, 'utf8'));
        if (debugShadow) {
          console.error('[NodeShadowEnv] package.json name:', packageJson.name);
        }
        if (packageJson.name === 'mlld') {
          mlldNodeModules = devNodeModules;
        }
      } catch {
        // Ignore parse errors
      }
    }
    
    // If not in dev, try to find mlld's installation directory
    if (!mlldNodeModules) {
      // First, try to find node_modules relative to this file's location
      // This works in both bundled (dist/) and source (interpreter/) scenarios
      try {
        const thisFile = fileURLToPath(import.meta.url);
        let searchDir = path.dirname(thisFile);

        // Walk up looking for node_modules with a package.json named "mlld"
        while (searchDir !== path.dirname(searchDir)) {
          const candidateNodeModules = path.join(searchDir, 'node_modules');
          const candidatePackageJson = path.join(searchDir, 'package.json');

          if (fs.existsSync(candidateNodeModules) && fs.existsSync(candidatePackageJson)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(candidatePackageJson, 'utf8'));
              if (pkg.name === 'mlld') {
                mlldNodeModules = candidateNodeModules;
                if (debugShadow) {
                  console.error('[NodeShadowEnv] Found mlld via import.meta.url:', mlldNodeModules);
                }
                break;
              }
            } catch {
              // Ignore parse errors
            }
          }
          searchDir = path.dirname(searchDir);
        }
      } catch {
        // import.meta.url approach failed, continue to fallbacks
      }
    }

    if (!mlldNodeModules) {
      try {
        // Try to resolve mlld's package.json location using createRequire for ESM compatibility
        const esmRequire = createRequire(import.meta.url);
        const mlldPath = esmRequire.resolve('mlld/package.json');
        mlldNodeModules = path.join(path.dirname(mlldPath), 'node_modules');
      } catch {
        // If that fails, check if we're running from dist/cli.cjs
        const cliPath = process.argv[1];
        if (cliPath && cliPath.endsWith('dist/cli.cjs')) {
          const projectRoot = path.dirname(path.dirname(cliPath));
          const projectNodeModules = path.join(projectRoot, 'node_modules');
          if (fs.existsSync(projectNodeModules)) {
            mlldNodeModules = projectNodeModules;
          }
        }

        // If still not found, try common global install locations
        if (!mlldNodeModules) {
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

    if (process.env.DEBUG_NODE_SHADOW || process.env.CI) {
      console.error('[NodeShadowEnv] Final module paths:', paths);
      console.error('[NodeShadowEnv] mlldNodeModules:', mlldNodeModules);
    }

    return paths;
  }
}
