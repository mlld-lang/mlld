import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { isCodeExecutable } from '@core/types/executable';
import { globalMetadataShelf } from '../helpers/metadata-shelf';
import { ShadowEnvironmentManager } from '../helpers/shadow-manager';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { logger } from '@core/utils/logger';
import { isLoadContentResultArray } from '@core/types/load-content';

/**
 * Executes code-based executable definitions
 * 
 * Handles embedded code execution in multiple languages (JavaScript, Python, Bash).
 * Manages shadow environments for cross-language variable access and preserves
 * metadata through the execution lifecycle.
 * 
 * KEY FEATURES:
 * - Shadow environment setup for mlld variable access in embedded code
 * - Metadata shelf for preserving LoadContentResult through transformations
 * - Auto-unwrapping for JavaScript functions
 * - Multi-language support with consistent interface
 * 
 * SECURITY: Code execution happens in controlled environments with proper sandboxing
 */
export class CodeExecutionStrategy extends BaseExecutionStrategy {
  
  canHandle(executable: ExecutableDefinition): boolean {
    return isCodeExecutable(executable);
  }
  
  async execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!isCodeExecutable(executable)) {
      throw new Error('Invalid executable type for CodeExecutionStrategy');
    }
    
    const language = executable.language?.toLowerCase();
    const code = executable.template || '';
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing code', {
        language,
        codeLength: code.length,
        codePreview: code.substring(0, 100)
      });
    }
    
    // Handle language-specific execution
    switch (language) {
      case 'javascript':
      case 'js':
        return await this.executeJavaScript(code, env);
      
      case 'python':
      case 'py':
        return await this.executePython(code, env);
      
      case 'bash':
      case 'sh':
        return await this.executeBash(code, env);
      
      default:
        throw new Error(`Unsupported code language: ${language}`);
    }
  }
  
  /**
   * Execute JavaScript code
   */
  private async executeJavaScript(
    code: string,
    env: Environment
  ): Promise<EvalResult> {
    // Prepare parameters for auto-unwrapping
    const params = new Map<string, any>();
    env.getAllVariables().forEach((value, key) => {
      params.set(key, value);
    });
    
    /**
     * Store metadata before JavaScript execution
     * GOTCHA: Metadata stored BEFORE auto-unwrapping, restored AFTER
     *         JS functions receive plain strings but metadata survives
     *         Missing this pattern breaks alligator syntax features
     */
    for (const [name, value] of params) {
      if (isLoadContentResultArray(value.value)) {
        globalMetadataShelf.storeMetadata(value.value);
      }
    }
    
    // Auto-unwrap parameters for JS execution
    const unwrappedParams = new Map<string, any>();
    for (const [name, variable] of params) {
      const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
      const value = await extractVariableValue(variable, env);
      const unwrappedValue = AutoUnwrapManager.unwrap(value);
      unwrappedParams.set(name, unwrappedValue);
    }
    
    // Execute JavaScript code
    const result = await env.executeJavaScript(code, unwrappedParams);
    
    // Restore metadata if needed
    if (Array.isArray(result)) {
      const restored = globalMetadataShelf.restoreMetadata(result);
      return { value: restored, env };
    }
    
    return { value: result, env };
  }
  
  /**
   * Execute Python with shadow environment
   * SECURITY: Shadow environment provides controlled variable access
   *           Only explicitly passed variables are accessible
   */
  private async executePython(
    code: string,
    env: Environment
  ): Promise<EvalResult> {
    // Capture shadow environment for Python
    const shadowEnv = ShadowEnvironmentManager.prepare(env, 'python');
    
    // Execute Python code with shadow environment
    const result = await env.executePython(code, {
      variables: shadowEnv.variables
    });
    
    return { value: result.output || '', env };
  }
  
  /**
   * Prepare environment variables for Bash
   * SECURITY: Variables serialized to strings, complex objects as JSON
   *           Prevents shell injection through variable values
   */
  private async executeBash(
    code: string,
    env: Environment
  ): Promise<EvalResult> {
    // Prepare environment variables for Bash
    const envVars: Record<string, string> = {};
    
    env.getAllVariables().forEach((variable, name) => {
      // Convert variables to string representation for Bash
      const value = variable.value;
      if (typeof value === 'string') {
        envVars[name] = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        envVars[name] = String(value);
      } else if (value && typeof value === 'object') {
        try {
          envVars[name] = JSON.stringify(value);
        } catch {
          // Skip variables that can't be serialized
        }
      }
    });
    
    // Execute Bash script
    const result = await env.executeCommand(code, {
      env: envVars
    });
    
    return {
      value: result.stdout || '',
      env
    };
  }
}