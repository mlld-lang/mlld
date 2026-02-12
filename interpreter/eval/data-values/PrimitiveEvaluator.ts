import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';
import { isDirectiveValue, isPrimitiveValue } from '@core/types/var';
import { evaluate } from '../../core/interpreter';
import { EvaluationStateManager } from './EvaluationStateManager';
import { InterpolationContext } from '../../core/interpolation-context';
import { interpolateAndRecordSecurity } from '../../core/interpreter/interpolation-security';

const EXPRESSION_NODE_TYPES = new Set([
  'BinaryExpression',
  'TernaryExpression',
  'UnaryExpression',
  'ArrayFilterExpression',
  'ArraySliceExpression'
]);

function isExpressionNode(value: unknown): value is { type: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    EXPRESSION_NODE_TYPES.has((value as { type: string }).type)
  );
}

async function interpolateAndRecord(
  nodes: any,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  const { interpolate } = await import('../../core/interpreter');
  return interpolateAndRecordSecurity({
    interpolate,
    nodes,
    env,
    context
  });
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

    // Handle Literal nodes (from grammar)
    if (value && typeof value === 'object' && value.type === 'Literal' && 'value' in value) {
      return true;
    }

    if (value && typeof value === 'object' && value.type === 'RegexLiteral') {
      return true;
    }

    if (isExpressionNode(value)) {
      return true;
    }
    
    // Handle wrapped string values (with content array and wrapperType)
    if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
      return true;
    }

    // Handle needsInterpolation marker (from DataString with @references)
    if (value && typeof value === 'object' && 'needsInterpolation' in value && 'parts' in value && Array.isArray((value as any).parts)) {
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

    // Handle Literal nodes (from grammar) - extract the value
    if (value && typeof value === 'object' && value.type === 'Literal' && 'value' in value) {
      return (value as { value: unknown }).value;
    }

    // Handle regex literals
    if (value && typeof value === 'object' && value.type === 'RegexLiteral') {
      const pattern = (value as any).pattern || '';
      const flags = (value as any).flags || '';
      return new RegExp(pattern, flags);
    }

    if (isExpressionNode(value)) {
      const { evaluateUnifiedExpression } = await import('../expressions');
      const result = await evaluateUnifiedExpression(value as any, env, { isExpression: true });
      return result.value;
    }
    
    // Handle wrapped string values (quotes, backticks, or brackets)
    if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
      const contentArray: any[] = value.content as any[];
      const hasOnlyLiteralsOrText = contentArray.every(
        node =>
          node &&
          typeof node === 'object' &&
          ((node.type === 'Literal' && 'value' in node) || (node.type === 'Text' && 'content' in node))
      );
      if (hasOnlyLiteralsOrText) {
        if (process.env.MLLD_DEBUG_FIX === 'true') {
          console.error('[PrimitiveEvaluator] literal/text wrapper', {
            wrapperType: (value as any).wrapperType,
            items: contentArray.map(n => n?.type)
          });
        }
        return contentArray
          .map(node => (node.type === 'Literal' ? (node as any).value : (node as any).content))
          .join('');
      }
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        console.error('[PrimitiveEvaluator] interpolating wrapper', {
          wrapperType: (value as any).wrapperType,
          itemTypes: contentArray.map(n => n?.type)
        });
      }
      return await interpolateAndRecord(value.content, env);
    }

    // Handle needsInterpolation marker (from DataString with @references in object literals)
    if (value && typeof value === 'object' && 'needsInterpolation' in value && 'parts' in value && Array.isArray((value as any).parts)) {
      return await interpolateAndRecord((value as any).parts, env);
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
