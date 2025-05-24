import type { MeldNode, MeldVariable } from '@core/types';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Environment holds all state and provides capabilities for evaluation.
 * This replaces StateService, ResolutionService, and capability injection.
 */
export class Environment {
  private variables = new Map<string, MeldVariable>();
  private nodes: MeldNode[] = [];
  private parent?: Environment;
  private urlCache: Map<string, { content: string; timestamp: number }> = new Map();
  private urlCacheMaxAge = 5 * 60 * 1000; // 5 minutes
  private importStack: Set<string> = new Set(); // Track imports to prevent circular dependencies
  
  // URL validation options
  private urlOptions = {
    allowedProtocols: ['http', 'https'],
    allowedDomains: [] as string[],
    blockedDomains: [] as string[],
    maxResponseSize: 5 * 1024 * 1024, // 5MB
    timeout: 30000 // 30 seconds
  };
  
  constructor(
    private fileSystem: IFileSystemService,
    private pathService: IPathService,
    private basePath: string,
    parent?: Environment
  ) {
    this.parent = parent;
  }
  
  // --- Property Accessors ---
  
  getBasePath(): string {
    return this.basePath;
  }
  
  // --- Variable Management ---
  
  setVariable(name: string, variable: MeldVariable): void {
    this.variables.set(name, variable);
  }
  
  getVariable(name: string): MeldVariable | undefined {
    // Check this scope first
    const variable = this.variables.get(name);
    if (variable) return variable;
    
    // Check parent scope
    return this.parent?.getVariable(name);
  }
  
  hasVariable(name: string): boolean {
    return this.variables.has(name) || (this.parent?.hasVariable(name) ?? false);
  }
  
  // --- Node Management ---
  
  addNode(node: MeldNode): void {
    this.nodes.push(node);
  }
  
  getNodes(): MeldNode[] {
    return this.nodes;
  }
  
  // --- Capabilities ---
  
  async readFile(pathOrUrl: string): Promise<string> {
    if (this.isURL(pathOrUrl)) {
      return this.fetchURL(pathOrUrl);
    }
    const resolvedPath = await this.resolvePath(pathOrUrl);
    return this.fileSystem.readFile(resolvedPath);
  }
  
  async executeCommand(command: string): Promise<string> {
    try {
      const output = execSync(command, {
        encoding: 'utf8',
        cwd: this.basePath,
        env: { ...process.env }
      });
      return output.trimEnd();
    } catch (error: any) {
      // Even on error, we might have output
      if (error.stdout) {
        return error.stdout.trimEnd();
      }
      throw new Error(`Command execution failed: ${error.message}`);
    }
  }
  
  async executeCode(code: string, language: string, params?: Record<string, any>): Promise<string> {
    if (language === 'javascript' || language === 'js' || language === 'node') {
      try {
        // Create a function that captures console.log output
        let output = '';
        const originalLog = console.log;
        console.log = (...args: any[]) => {
          output += args.map(arg => String(arg)).join(' ') + '\n';
        };
        
        // Create a function with parameters if provided
        const paramNames = params ? Object.keys(params) : [];
        const paramValues = params ? Object.values(params) : [];
        
        // Build the function body
        let functionBody = code;
        
        // Handle return statements properly
        if (!code.includes('return') && !code.includes(';')) {
          // Single expression without semicolon - return it
          functionBody = `return ${code}`;
        }
        
        // Create and execute the function
        const fn = new Function(...paramNames, functionBody);
        const result = fn(...paramValues);
        
        // Restore console.log
        console.log = originalLog;
        
        // If there was console output, use that. Otherwise use the result.
        if (output) {
          return output.replace(/\n+$/, '');
        }
        
        return result !== undefined ? String(result) : '';
      } catch (error) {
        throw new Error(`Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (language === 'python' || language === 'py') {
      try {
        // Create a temporary Python file with parameter injection
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `meld_exec_${Date.now()}.py`);
        
        // Build Python code with parameters
        let pythonCode = '';
        if (params) {
          for (const [key, value] of Object.entries(params)) {
            pythonCode += `${key} = ${JSON.stringify(value)}\\n`;
          }
        }
        pythonCode += code;
        
        // Write to temp file
        fs.writeFileSync(tmpFile, pythonCode);
        
        try {
          // Execute Python
          const result = await this.executeCommand(`python3 ${tmpFile}`);
          return result;
        } finally {
          // Clean up temp file
          fs.unlinkSync(tmpFile);
        }
      } catch (error) {
        throw new Error(`Python execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      throw new Error(`Unsupported code language: ${language}`);
    }
  }
  
  async resolvePath(inputPath: string): Promise<string> {
    // Handle special path variables
    if (inputPath.startsWith('$HOMEPATH')) {
      const homePath = process.env.HOME || process.env.USERPROFILE || '';
      inputPath = inputPath.replace('$HOMEPATH', homePath);
    }
    
    if (inputPath.startsWith('$PROJECTPATH')) {
      inputPath = inputPath.replace('$PROJECTPATH', await this.getProjectPath());
    }
    
    // Use the path module directly for now
    // TODO: Use PathService properly once types are imported
    const path = require('path');
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    return path.resolve(this.basePath, inputPath);
  }
  
  // --- Scope Management ---
  
  createChild(newBasePath?: string): Environment {
    return new Environment(
      this.fileSystem,
      this.pathService,
      newBasePath || this.basePath,
      this
    );
  }
  
  mergeChild(child: Environment): void {
    // Merge child variables into this environment
    for (const [name, variable] of child.variables) {
      this.setVariable(name, variable);
    }
    
    // Merge child nodes
    this.nodes.push(...child.nodes);
  }
  
  // --- Special Variables ---
  
  async getProjectPath(): Promise<string> {
    // Walk up from basePath to find project root (has package.json)
    let current = this.basePath;
    
    while (current !== path.dirname(current)) {
      try {
        if (await this.fileSystem.exists(path.join(current, 'package.json'))) {
          return current;
        }
      } catch {
        // Continue searching
      }
      current = path.dirname(current);
    }
    
    // Fallback to current base path
    return this.basePath;
  }
  
  // --- Utility Methods ---
  
  getAllVariables(): Map<string, MeldVariable> {
    const allVars = new Map<string, MeldVariable>();
    
    // Add parent variables first (so child can override)
    if (this.parent) {
      const parentVars = this.parent.getAllVariables();
      for (const [name, variable] of parentVars) {
        allVars.set(name, variable);
      }
    }
    
    // Add this scope's variables
    for (const [name, variable] of this.variables) {
      allVars.set(name, variable);
    }
    
    return allVars;
  }
  
  // --- URL Support Methods ---
  
  isURL(path: string): boolean {
    try {
      const url = new URL(path);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }
  
  async validateURL(url: string): Promise<void> {
    const parsed = new URL(url);
    
    // Check protocol
    if (!this.urlOptions.allowedProtocols.includes(parsed.protocol.slice(0, -1))) {
      throw new Error(`Protocol not allowed: ${parsed.protocol}`);
    }
    
    // Check domain allowlist if configured
    if (this.urlOptions.allowedDomains.length > 0) {
      const allowed = this.urlOptions.allowedDomains.some(
        domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      );
      if (!allowed) {
        throw new Error(`Domain not allowed: ${parsed.hostname}`);
      }
    }
    
    // Check domain blocklist
    const blocked = this.urlOptions.blockedDomains.some(
      domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
    if (blocked) {
      throw new Error(`Domain blocked: ${parsed.hostname}`);
    }
  }
  
  async fetchURL(url: string): Promise<string> {
    // Check cache first
    const cached = this.urlCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.urlCacheMaxAge) {
      return cached.content;
    }
    
    // Validate URL
    await this.validateURL(url);
    
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.urlOptions.timeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Check content size
      const content = await response.text();
      if (content.length > this.urlOptions.maxResponseSize) {
        throw new Error(`Response too large: ${content.length} bytes`);
      }
      
      // Cache the response
      this.urlCache.set(url, { content, timestamp: Date.now() });
      
      return content;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.urlOptions.timeout}ms`);
      }
      throw error;
    }
  }
  
  setURLOptions(options: Partial<typeof this.urlOptions>): void {
    Object.assign(this.urlOptions, options);
  }
  
  // --- Import Tracking (for circular import detection) ---
  
  isImporting(path: string): boolean {
    return this.importStack.has(path) || (this.parent?.isImporting(path) ?? false);
  }
  
  beginImport(path: string): void {
    this.importStack.add(path);
  }
  
  endImport(path: string): void {
    this.importStack.delete(path);
  }
  
  createChildEnvironment(): Environment {
    const child = new Environment(
      this.fileSystem,
      this.pathService,
      this.basePath,
      this
    );
    // Share import stack with parent to detect circular imports across scopes
    child.importStack = this.importStack;
    return child;
  }
}