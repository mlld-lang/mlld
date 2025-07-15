import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import { createMlldHelpers } from '../variable-proxy';

export interface ShadowEnvironment {
  /**
   * Get shadow environment functions for a language
   */
  getShadowEnv(language: string): Map<string, any> | undefined;
}

/**
 * Executes JavaScript code in-process with shadow environment support
 */
export class JavaScriptExecutor extends BaseCommandExecutor {
  constructor(
    errorUtils: ErrorUtils,
    workingDirectory: string,
    private shadowEnvironment: ShadowEnvironment
  ) {
    super(errorUtils, workingDirectory);
  }

  async execute(
    code: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext,
    params?: Record<string, any>
  ): Promise<string> {
    // For JavaScript execution, always halt on errors (don't use continue behavior)
    // This ensures that JS errors propagate properly for testing and error handling
    const jsOptions = { ...options, errorBehavior: 'halt' as const };
    return this.executeWithCommonHandling(
      `js: ${code.substring(0, 50)}...`,
      jsOptions,
      context,
      () => this.executeJavaScript(code, params)
    );
  }

  private async executeJavaScript(
    code: string,
    params?: Record<string, any>
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();

    try {
      // Create a function that captures console.log output
      let output = '';
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        output += args.map(arg => String(arg)).join(' ') + '\n';
      };

      // Get shadow environment functions for JavaScript
      const shadowEnv = this.shadowEnvironment.getShadowEnv('js') || 
                       this.shadowEnvironment.getShadowEnv('javascript');

      // Merge shadow environment with provided parameters
      const allParams = { ...(params || {}) };
      const allParamNames: string[] = Object.keys(allParams);
      const allParamValues: any[] = Object.values(allParams);

      // Add shadow environment functions
      if (shadowEnv) {
        for (const [name, func] of shadowEnv) {
          if (!allParams[name]) { // Don't override explicit parameters
            allParamNames.push(name);
            allParamValues.push(func);
          }
        }
      }

      // Build the function body with mlld built-ins
      let functionBody = code;
      
      // Check if this is a single-line expression that should be auto-returned
      const isSingleLine = !code.includes('\n');
      const hasNoReturn = !code.includes('return');
      const looksLikeStatement = code.includes(';') || code.trim().startsWith('console.log');
      
      // For single-line expressions without explicit return, wrap in return statement
      if (isSingleLine && hasNoReturn && !looksLikeStatement) {
        functionBody = `return (${functionBody})`;
      }
      
      // Then prepend mlld built-in values to the function body
      if (!params || !params['mlld_now']) {
        functionBody = `const mlld_now = () => new Date().toISOString();\n${functionBody}`;
      }
      
      // Add mlld helpers if enhanced mode is enabled
      const isEnhancedMode = process.env.MLLD_ENHANCED_VARIABLE_PASSING === 'true';
      if (isEnhancedMode && (!params || !params['mlld'])) {
        // Create mlld helpers and add to params
        const mlldHelpers = createMlldHelpers();
        allParamNames.push('mlld');
        allParamValues.push(mlldHelpers);
      }

      // Debug exec-code issue
      if (process.env.DEBUG_EXEC || process.env.DEBUG_PRIMITIVES) {
        console.log('executeCode debug:');
        console.log('  code:', code);
        console.log('  functionBody:', functionBody);
        console.log('  allParamNames:', allParamNames);
        console.log('  allParamValues:', allParamValues);
        console.log('  param types:', allParamValues.map(v => typeof v));
        console.log('  param values detail:', allParamValues.map(v => ({ value: v, type: typeof v })));
      }

      // Create a function with dynamic parameters
      let fn: Function;
      try {
        fn = new Function(...allParamNames, functionBody);
      } catch (syntaxError) {
        console.error('Function creation failed:');
        console.error('  allParamNames:', allParamNames);
        console.error('  functionBody:', functionBody);
        console.error('  Full function would be:', `function(${allParamNames.join(', ')}) { ${functionBody} }`);
        throw syntaxError;
      }

      // Execute the function
      let result = fn(...allParamValues);

      // Handle promises - await them if returned
      if (result instanceof Promise) {
        result = await result;
      }

      // Restore console.log
      console.log = originalLog;

      // Format the result
      if (result !== undefined && result !== null) {
        // Check if this is a PipelineInput object - if so, return just the text
        if (typeof result === 'object' && 'text' in result && 'type' in result && 
            typeof result.text === 'string' && typeof result.type === 'string') {
          // This is likely a PipelineInput object
          output = String(result.text);
        }
        // For other objects and arrays, use JSON.stringify to preserve structure
        else if (typeof result === 'object') {
          output = JSON.stringify(result);
        } else {
          output = String(result);
        }
      }

      const duration = Date.now() - startTime;

      return {
        output: output.trim(),
        duration,
        exitCode: 0
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const codeError = new MlldCommandExecutionError(
        error instanceof Error ? error.message : 'JavaScript execution failed',
        undefined, // sourceLocation
        {
          command: 'js',
          exitCode: 1,
          duration,
          stdout: '',
          stderr: error instanceof Error ? error.stack || error.message : String(error),
          workingDirectory: this.workingDirectory
        }
      );
      throw codeError;
    }
  }
}