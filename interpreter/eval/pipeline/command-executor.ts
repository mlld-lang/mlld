/**
 * Command execution logic extracted for reuse
 */

import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';
import { evaluateNode } from '../index';
import { DEBUG_UNIVERSAL_CONTEXT } from '@core/feature-flags';
import { logger } from '@core/utils/logger';

/**
 * Execute a pipeline command
 */
export async function executeCommand(
  command: PipelineCommand,
  input: string,
  env: Environment,
  format?: string
): Promise<string> {
  if (DEBUG_UNIVERSAL_CONTEXT) {
    logger.debug('[Command Executor] Executing command:', {
      identifier: command.rawIdentifier,
      hasParams: !!command.params,
      paramsCount: command.params?.length || 0
    });
  }
  
  // Handle different command types
  if (command.type === 'ExecInvocation') {
    // Function invocation
    const result = await evaluateNode(command, env);
    return normalizeResult(result.value);
  }
  
  if (command.type === 'VariableReference') {
    // Variable reference (transformer or function)
    const variable = env.getVariable(command.identifier);
    
    if (!variable) {
      throw new Error(`Variable not found: @${command.identifier}`);
    }
    
    // Check if it's an executable (function or transformer)
    if (variable.metadata?.__executable) {
      const executable = variable.metadata.__executable;
      
      // Build arguments array
      const args = [input];
      if (command.params) {
        for (const param of command.params) {
          const paramResult = await evaluateNode(param, env);
          args.push(paramResult.value);
        }
      }
      
      // Execute the function
      const result = await executable.apply(null, args);
      return normalizeResult(result);
    }
    
    // If not executable, return the variable value
    return normalizeResult(variable.value);
  }
  
  // For other command types, use general evaluation
  const result = await evaluateNode(command, env);
  return normalizeResult(result.value);
}

/**
 * Normalize result to string
 */
function normalizeResult(result: any): string {
  if (typeof result === 'string') {
    return result;
  }
  
  if (result === null || result === undefined) {
    return '';
  }
  
  if (typeof result === 'object') {
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
  
  return String(result);
}