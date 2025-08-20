import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { isResolverExecutable } from '@core/types/executable';

/**
 * Strategy for executing resolver executables
 * These are exec definitions like: @exec name(params) = @resolver/path { @payload }
 * Currently not fully implemented - throws error to match legacy behavior
 */
export class ResolverExecutionStrategy extends BaseExecutionStrategy {
  canHandle(executable: ExecutableDefinition): boolean {
    return isResolverExecutable(executable);
  }
  
  async execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!isResolverExecutable(executable)) {
      throw new Error('Invalid executable type for ResolverExecutionStrategy');
    }
    
    // Match legacy behavior - resolver executables are not yet implemented
    throw new Error('Resolver executables are not yet implemented');
  }
}