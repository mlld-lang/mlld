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
  
  constructor(
    private fileSystem: IFileSystemService,
    private pathService: IPathService,
    private basePath: string,
    parent?: Environment
  ) {
    this.parent = parent;
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
  
  async readFile(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
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
}