import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import { createMlldHelpers } from '../variable-proxy';
import { resolveShadowEnvironment } from '../../eval/helpers/shadowEnvResolver';
import { enhanceJSError } from '@core/errors/patterns/init';

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
    params?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<string> {
    // For JavaScript execution, always halt on errors (don't use continue behavior)
    // This ensures that JS errors propagate properly for testing and error handling
    const jsOptions = { ...options, errorBehavior: 'halt' as const };
    return this.executeWithCommonHandling(
      `js: ${code.substring(0, 50)}...`,
      jsOptions,
      context,
      () => this.executeJavaScript(code, params, metadata)
    );
  }

  private async executeJavaScript(
    code: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();

    try {
      // Create a function that captures console.log output
      let consoleOutput = '';
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        originalLog(...args);
        consoleOutput += args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') + '\n';
      };

      // NEW CODE: Extract and handle captured shadow environments
      const capturedEnvs = params?.__capturedShadowEnvs;
      if (params && '__capturedShadowEnvs' in params) {
        delete params.__capturedShadowEnvs;
      }
      
      if (process.env.DEBUG_MODULE_EXPORT || process.env.DEBUG_EXEC) {
        console.error('[DEBUG] JavaScriptExecutor.executeJavaScript:', {
          hasCapturedEnvs: !!capturedEnvs,
          capturedEnvs,
          hasCurrentShadowEnv: !!this.shadowEnvironment,
          currentShadowEnvSize: this.shadowEnvironment.getShadowEnv ? 
            (this.shadowEnvironment.getShadowEnv('js')?.size || 0) : 0
        });
      }
      
      // OLD CODE TO REPLACE:
      // const shadowEnv = this.shadowEnvironment.getShadowEnv('js') || 
      //                  this.shadowEnvironment.getShadowEnv('javascript');
      
      // NEW CODE:
      const shadowEnv = resolveShadowEnvironment(
        'js', 
        capturedEnvs, 
        this.shadowEnvironment as any // Cast to Environment type
      );

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
      
      // Add mlld helpers for Variable access
      if (!params || !params['mlld']) {
        // Create mlld helpers with primitive metadata
        const mlldHelpers = createMlldHelpers(metadata);
        allParamNames.push('mlld');
        allParamValues.push(mlldHelpers);
      }
      
      // Add ctx to JavaScript context (without @ prefix)
      if (metadata?.universalContext) {
        const ctx = {
          // Pipeline orchestration
          try: metadata.universalContext.try,
          tries: metadata.universalContext.tries || [],
          stage: metadata.universalContext.stage,
          isPipeline: metadata.universalContext.isPipeline,
          
          // Retry communication
          hint: metadata.universalContext.hint || null,
          lastOutput: metadata.universalContext.lastOutput,
          
          // Input/output
          input: metadata.universalContext.input
        };
        
        // Make ctx read-only
        allParamNames.push('ctx');
        allParamValues.push(Object.freeze(ctx));
      }


      // Create a function with dynamic parameters
      // Check if code contains await to determine if we need an async function
      const hasAwait = code.includes('await');
      let fn: Function;
      if (hasAwait) {
        // Create an async function using the AsyncFunction constructor
        const AsyncFunction = (async function () {}).constructor as any;
        fn = new AsyncFunction(...allParamNames, functionBody);
      } else {
        fn = new Function(...allParamNames, functionBody);
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
      let output = '';
      
      // If there's an explicit return value, use it
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
      } else if (consoleOutput) {
        // If no return value but there's console output, use that as the result
        // This maintains backward compatibility with existing tests
        output = consoleOutput;
      }

      const duration = Date.now() - startTime;

      return {
        output: output.trim(),
        duration,
        exitCode: 0
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Try to enhance the error with patterns
      const enhanced = enhanceJSError(
        error as Error,
        code,
        params,
        { language: 'js' }
      );
      
      // Use enhanced message if available
      const errorMessage = enhanced?.message || 
        (error instanceof Error ? error.message : 'JavaScript execution failed');
      
      const codeError = new MlldCommandExecutionError(
        errorMessage,
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