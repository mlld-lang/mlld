import { generatePythonMlldHelpers, convertToPythonValue } from './python-variable-helpers';

/**
 * Python shadow environment for function persistence across executions.
 *
 * Unlike NodeShadowEnvironment which uses a VM, Python shadow environments
 * store function definitions and inject them into each execution context.
 */
export class PythonShadowEnvironment {
  private shadowFunctions: Map<string, { code: string; paramNames: string[] }> = new Map();
  private basePath: string;
  private currentFile?: string;

  constructor(basePath: string, currentFile?: string) {
    this.basePath = basePath;
    this.currentFile = currentFile;
  }

  /**
   * Add a function to the shadow environment
   */
  async addFunction(name: string, code: string, paramNames: string[] = []): Promise<void> {
    this.shadowFunctions.set(name, { code, paramNames });
  }

  /**
   * Generate Python code to define all shadow functions
   */
  generateFunctionDefinitions(): string {
    let definitions = '';

    for (const [name, { code, paramNames }] of this.shadowFunctions) {
      const paramStr = paramNames.join(', ');

      // Indent the code body
      const indentedCode = code.split('\n')
        .map(line => line.trim() ? '    ' + line : '')
        .join('\n');

      definitions += `def ${name}(${paramStr}):\n${indentedCode}\n\n`;
    }

    return definitions;
  }

  /**
   * Execute code in the shadow environment with optional parameters
   * Injects all shadow function definitions before the user code
   */
  async execute(code: string, params?: Record<string, any>, metadata?: Record<string, any>): Promise<string> {
    // Build full code with function definitions
    let fullCode = generatePythonMlldHelpers(metadata) + '\n';

    // Add shadow function definitions
    fullCode += this.generateFunctionDefinitions();

    // Add parameters
    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        fullCode += convertToPythonValue(value, key) + '\n';
      }
    }

    // Add user code
    fullCode += '\n# User code:\n' + code;

    // Execute via temporary file and subprocess (similar to PythonExecutor)
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const { execSync } = await import('child_process');

    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `mlld_shadow_exec_${Date.now()}.py`);

    try {
      fs.writeFileSync(tmpFile, fullCode);
      const result = execSync(`python3 ${tmpFile}`, {
        cwd: this.basePath,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024 // 50MB
      });
      return result.trim();
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {}
    }
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
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.shadowFunctions.clear();
  }
}
