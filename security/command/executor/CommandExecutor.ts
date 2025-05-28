import { execSync } from 'child_process';
import { MlldCommandExecutionError } from '@core/errors';

export interface CommandExecutionOptions {
  workingDirectory?: string;
  timeout?: number;
  maxOutputLines?: number;
  env?: Record<string, string>;
  collectErrors?: boolean;
  showProgress?: boolean;
}

export interface CommandExecutionContext {
  file?: string;
  line?: number;
  column?: number;
  directive?: string;
}

export class CommandExecutor {
  private errors: Array<{ command: string; error: Error; duration: number }> = [];
  
  /**
   * Execute a command with security checks and error handling
   */
  async execute(
    command: string,
    options: CommandExecutionOptions = {},
    context?: CommandExecutionContext
  ): Promise<string> {
    const startTime = Date.now();
    const { workingDirectory, timeout = 30000, showProgress = false } = options;
    
    if (showProgress) {
      console.log(`⚡ Running: ${command}`);
    }
    
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        cwd: workingDirectory,
        env: { ...process.env, ...options.env },
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout
      });
      
      const duration = Date.now() - startTime;
      
      if (showProgress) {
        console.log(`✅ Completed in ${duration}ms`);
      }
      
      return this.processOutput(result, options.maxOutputLines);
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (showProgress) {
        console.log(`❌ Failed in ${duration}ms`);
      }
      
      // Create rich error with context
      if (context) {
        throw MlldCommandExecutionError.create(
          command,
          error.status || 1,
          duration,
          { line: context.line, column: context.column },
          {
            stdout: error.stdout,
            stderr: error.stderr,
            workingDirectory,
            directiveType: context.directive
          }
        );
      }
      
      // Collect error if requested
      if (options.collectErrors) {
        this.errors.push({ command, error, duration });
      }
      
      throw error;
    }
  }
  
  /**
   * Process command output with line limiting
   */
  private processOutput(output: string, maxLines?: number): string {
    if (!maxLines || maxLines <= 0) {
      return output;
    }
    
    const lines = output.split('\n');
    if (lines.length <= maxLines) {
      return output;
    }
    
    const truncated = lines.slice(0, maxLines).join('\n');
    const omitted = lines.length - maxLines;
    return `${truncated}\n... (${omitted} lines omitted)`;
  }
  
  /**
   * Get collected errors
   */
  getErrors(): Array<{ command: string; error: Error; duration: number }> {
    return [...this.errors];
  }
  
  /**
   * Clear collected errors
   */
  clearErrors(): void {
    this.errors = [];
  }
}