/**
 * Evaluator for WhenRHSAction nodes
 * 
 * These nodes represent actions in RHS when expressions that:
 * 1. May have side effects (show, output, variable assignment)
 * 2. Always return values (for assignment or exe return)
 * 
 * This enables /exe...when and /var...when to support the same
 * rich actions as regular /when directives.
 */

import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { evaluate } from '../core/interpreter';
import { logger } from '@core/utils/logger';
import { MlldInterpreterError } from '@core/errors';

// Type definition for WhenRHSAction nodes
interface WhenRHSActionNode {
  type: 'WhenRHSAction';
  subtype: 'show' | 'output' | 'varAssignment' | 'functionCall';
  content?: any;        // For show action
  source?: any;         // For output action
  target?: any;         // For output action
  format?: any;         // For output action format
  identifier?: string;  // For var assignment
  value?: any;          // For var assignment
  reference?: any;      // For function call
  sideEffect: boolean;
  returnsValue: boolean;
  location?: any;
}

/**
 * Evaluate a WhenRHSAction node
 * 
 * Executes side effects and returns the resulting value
 */
export async function evaluateWhenRHSAction(
  node: WhenRHSActionNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  logger.debug('Evaluating WhenRHSAction:', {
    subtype: node.subtype,
    hasSideEffect: node.sideEffect,
    returnsValue: node.returnsValue
  });

  switch (node.subtype) {
    case 'show': {
      // Evaluate the content to show
      const contentResult = await evaluate(node.content, env, context);
      const content = contentResult.value;
      
      // Side effect: display to stdout
      const stringContent = String(content || '');
      // Add a text node to the output
      env.addNode({
        type: 'Text',
        content: stringContent,
        nodeId: `show-${Date.now()}`
      });
      
      // Return value: the displayed content
      return { value: stringContent, env };
    }

    case 'output': {
      // Evaluate the source content
      const sourceResult = await evaluate(node.source, env, context);
      const content = sourceResult.value;
      
      // Evaluate the target
      const targetResult = await evaluate(node.target, env, context);
      const target = targetResult.value;
      
      // Determine output destination and format
      const stringContent = String(content || '');
      
      if (typeof target === 'string') {
        if (target === 'stdout') {
          // Output to stdout
          env.output(stringContent);
        } else if (target === 'stderr') {
          // Output to stderr
          console.error(stringContent);
        } else {
          // Output to file
          // Use the output evaluator for proper file handling
          const { evaluateOutput } = await import('./output');
          const outputDirective = {
            type: 'Directive',
            kind: 'output',
            subtype: 'output',
            values: {
              source: [{ type: 'Text', content: stringContent }],
              target: [{ type: 'Text', content: target }],
              format: node.format
            }
          };
          await evaluateOutput(outputDirective as any, env);
        }
      }
      
      // Return value: the output content
      return { value: stringContent, env };
    }

    case 'varAssignment': {
      // Evaluate the value to assign
      const valueResult = await evaluate(node.value, env, context);
      const value = valueResult.value;
      
      // Side effect: set the variable
      if (node.identifier) {
        env.setVariable(node.identifier, value);
      }
      
      // Return value: the assigned value
      return { value, env };
    }

    case 'functionCall': {
      // Evaluate the function reference
      const result = await evaluate(node.reference, env, context);
      
      // Return value: the function result
      // (side effects happen during function execution)
      return result;
    }

    default:
      throw new MlldInterpreterError(
        `Unknown WhenRHSAction subtype: ${(node as any).subtype}`,
        { node }
      );
  }
}