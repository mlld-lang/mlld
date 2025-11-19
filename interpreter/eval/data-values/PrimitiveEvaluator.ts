import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';
import { isDirectiveValue, isPrimitiveValue } from '@core/types/var';
import { evaluate } from '../../core/interpreter';
import { EvaluationStateManager } from './EvaluationStateManager';
import type { SecurityDescriptor } from '@core/types/security';
import { InterpolationContext } from '../../core/interpolation-context';

async function interpolateAndRecord(
  nodes: any,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  const { interpolate } = await import('../../core/interpreter');
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
}

/**
 * Handles evaluation of primitive data values and simple AST nodes.
 * 
 * This evaluator processes:
 * - Primitive values (strings, numbers, booleans, null)
 * - Text AST nodes
 * - Embedded directive values with caching
 */
export class PrimitiveEvaluator {
  constructor(private stateManager: EvaluationStateManager) {}

  /**
   * Checks if this evaluator can handle the given data value
   */
  canHandle(value: DataValue): boolean {
    // Handle primitive values
    if (isPrimitiveValue(value)) {
      return true;
    }
    
    // Handle Text nodes
    if (value && typeof value === 'object' && value.type === 'Text' && 'content' in value) {
      return true;
    }
    
    // Handle wrapped string values (with content array and wrapperType)
    if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
      return true;
    }
    
    // Handle command objects (from run directives in objects)
    if (value && typeof value === 'object' && value.type === 'command' && 'command' in value) {
      return true;
    }
    
    // Handle embedded directives
    if (isDirectiveValue(value)) {
      return true;
    }
    
    return false;
  }

  /**
   * Evaluates primitive data values and simple AST nodes
   */
  async evaluate(value: DataValue, env: Environment): Promise<any> {
    // Primitive values pass through unchanged
    if (isPrimitiveValue(value)) {
      return value;
    }
    
    // Handle Text nodes
    if (value && typeof value === 'object' && value.type === 'Text' && 'content' in value) {
      return value.content;
    }
    
    // Handle wrapped string values (quotes, backticks, or brackets)
    if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
      return await interpolateAndRecord(value.content, env);
    }
    
    // Handle command objects (from run directives in objects)
    if (value && typeof value === 'object' && value.type === 'command' && 'command' in value) {
      return await this.evaluateCommandObject(value, env);
    }
    
    // Handle embedded directives
    if (isDirectiveValue(value)) {
      return await this.evaluateDirective(value, env);
    }
    
    throw new Error(`PrimitiveEvaluator cannot handle value type: ${typeof value}`);
  }

  /**
   * Evaluates a command object (from run directives in objects)
   */
  private async evaluateCommandObject(value: any, env: Environment): Promise<any> {
    let commandStr: string;
    if (typeof value.command === 'string') {
      commandStr = value.command;
    } else if (Array.isArray(value.command)) {
      // Interpolate the command array
      commandStr = await interpolateAndRecord(value.command, env, InterpolationContext.ShellCommand);
    } else {
      throw new Error('Invalid command format in command object evaluation');
    }
    const result = await env.executeCommand(commandStr);
    return result;
  }

  /**
   * Evaluates an embedded directive with caching
   */
  private async evaluateDirective(value: any, env: Environment): Promise<any> {
    // Check if we've already evaluated this directive
    const cached = this.stateManager.getCachedResult(value);
    if (cached?.hit && !cached.error) {
      return cached.result;
    }
    
    // If we have a cached error, throw it
    if (cached?.hit && cached.error) {
      throw cached.error;
    }
    
    try {
      // Create a child environment to capture output without affecting the parent
      const childEnv = env.createChild();
      
      // Evaluate the directive in the child environment
      const result = await evaluate([value], childEnv);
      
      // For run and add directives in data context, trim trailing newlines
      let finalValue = result.value;
      if ((value.kind === 'run' || value.kind === 'add') && typeof finalValue === 'string') {
        finalValue = finalValue.replace(/\n+$/, '');
      }
      
      // Cache the result
      this.stateManager.setCachedResult(value, finalValue);
      
      return finalValue;
    } catch (error) {
      // Cache the error
      this.stateManager.setCachedResult(value, undefined, error as Error);
      throw error;
    }
  }
}
