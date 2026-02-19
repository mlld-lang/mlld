import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import { createMlldHelpers, prepareParamsForShadow } from '../variable-proxy';
import { resolveShadowEnvironment } from '../../eval/helpers/shadowEnvResolver';
import { enhanceJSError } from '@core/errors/patterns/init';
import { addImplicitReturn } from './implicit-return';

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
      () =>
        this.executeJavaScript(
          code,
          params,
          metadata,
          jsOptions?.workingDirectory,
          context,
          jsOptions?.env
        )
    );
  }

  private async executeJavaScript(
    code: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    workingDirectory?: string,
    context?: CommandExecutionContext,
    envOverrides?: Record<string, string>
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const targetCwd = workingDirectory || process.cwd();
    const previousCwd = process.cwd();
    const shouldRestoreCwd = targetCwd !== previousCwd;

    if (shouldRestoreCwd) {
      process.chdir(targetCwd);
    }

    const restoreEnv = applyProcessEnvOverrides(envOverrides);

    try {
      // Create a function that captures console.log output
      let consoleOutput = '';
      const originalLog = console.log;
      const passthroughConsole = context?.directiveType !== 'run';
      console.log = (...args: any[]) => {
        if (passthroughConsole) {
          originalLog(...args);
        }
        consoleOutput += args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') + '\n';
      };

      const capturedEnvs = params?.__capturedShadowEnvs;
      if (params && '__capturedShadowEnvs' in params) {
        delete params.__capturedShadowEnvs;
      }

      const shadowEnv = resolveShadowEnvironment(
        'js', 
        capturedEnvs, 
        this.shadowEnvironment as any // Cast to Environment type
      );

      let shadowParams = params ? prepareParamsForShadow(params) : undefined;
      let primitiveMetadata: Record<string, any> | undefined;
      if (shadowParams && (shadowParams as any).__mlldPrimitiveMetadata) {
        primitiveMetadata = (shadowParams as any).__mlldPrimitiveMetadata;
        delete (shadowParams as any).__mlldPrimitiveMetadata;
      }

      // Merge shadow environment with provided parameters
      const allParams = shadowParams ? { ...shadowParams } : {};
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
      let functionBody = addImplicitReturn(code);
      
      // Then prepend mlld built-in values to the function body
      if (!params || !params['mlld_now']) {
        functionBody = `const mlld_now = () => new Date().toISOString();\n${functionBody}`;
      }
      
      // Add mlld helpers for Variable access
      if (!('mlld' in allParams)) {
        const mergedMetadata = {
          ...(metadata as Record<string, any> | undefined),
          ...(primitiveMetadata || {})
        };
        const helperMetadata = Object.keys(mergedMetadata || {}).length ? mergedMetadata : undefined;
        const mlldHelpers = createMlldHelpers(helperMetadata);
        allParamNames.push('mlld');
        allParamValues.push(mlldHelpers);
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
        if (typeof result === 'object') {
          try {
            output = JSON.stringify(result);
          } catch {
            output = String(result);
          }
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
          workingDirectory: targetCwd
        }
      );
      throw codeError;
    } finally {
      restoreEnv();
      if (shouldRestoreCwd) {
        process.chdir(previousCwd);
      }
    }
  }
}

function applyProcessEnvOverrides(overrides?: Record<string, string>): () => void {
  if (!overrides) {
    return () => {};
  }
  const keys = Object.keys(overrides);
  if (keys.length === 0) {
    return () => {};
  }

  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    process.env[key] = overrides[key];
  }

  return () => {
    for (const key of keys) {
      const prior = previous.get(key);
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    }
  };
}
