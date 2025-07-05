import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';

export interface ShellCommandExecutor {
  /**
   * Execute a shell command
   */
  execute(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string>;
}

/**
 * Executes Python code using temporary files and python3 subprocess
 */
export class PythonExecutor extends BaseCommandExecutor {
  constructor(
    errorUtils: ErrorUtils,
    workingDirectory: string,
    private shellExecutor: ShellCommandExecutor
  ) {
    super(errorUtils, workingDirectory);
  }

  async execute(
    code: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext,
    params?: Record<string, any>
  ): Promise<string> {
    return this.executeWithCommonHandling(
      `python: ${code.substring(0, 50)}...`,
      options,
      context,
      () => this.executePythonCode(code, params, options, context)
    );
  }

  private async executePythonCode(
    code: string,
    params?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `mlld_exec_${Date.now()}.py`);
    
    try {
      // Build Python code with parameters
      let pythonCode = '';
      if (params && typeof params === 'object') {
        for (const [key, value] of Object.entries(params)) {
          pythonCode += `${key} = ${JSON.stringify(value)}\n`;
        }
      }
      pythonCode += code;
      
      // Write to temp file
      fs.writeFileSync(tmpFile, pythonCode);
      
      // Execute Python using the shell executor
      const result = await this.shellExecutor.execute(`python3 ${tmpFile}`, options, context);
      
      const duration = Date.now() - startTime;
      return {
        output: result,
        duration,
        exitCode: 0
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw new Error(`Python execution failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Clean up temp file
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }
}