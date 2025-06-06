import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';

// Import specific evaluators
import { evaluateText } from './text';
import { evaluateData } from './data';
import { evaluatePath } from './path';
import { evaluateRun } from './run';
import { evaluateExec } from './exec';
import { evaluateAdd } from './add';
import { evaluateImport } from './import';
import { evaluateWhen } from './when';
import { evaluateOutput } from './output';

/**
 * Main directive evaluation router.
 * Routes to specific evaluators based on directive kind.
 */
export async function evaluateDirective(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Route based on directive kind
  switch (directive.kind) {
    case 'text':
      return evaluateText(directive, env);
      
    case 'data':
      return evaluateData(directive, env);
      
    case 'path':
      return evaluatePath(directive, env);
      
    case 'run':
      return evaluateRun(directive, env);
      
    case 'exec':
      return evaluateExec(directive, env);
      
    case 'add':
      return evaluateAdd(directive, env);
      
    case 'import':
      return evaluateImport(directive, env);
      
    case 'when':
      return await evaluateWhen(directive as any, env);
      
    case 'output':
      return evaluateOutput(directive, env);
      
    default:
      throw new Error(`Unknown directive kind: ${directive.kind}`);
  }
}