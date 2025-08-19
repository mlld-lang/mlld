import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { isResolverExecutable } from '@core/types/executable';
import { logger } from '@core/utils/logger';

/**
 * Strategy for executing resolver executables
 * Handles module resolution and imports
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
    
    if (!executable.resolverInfo) {
      throw new Error('Resolver executable missing resolverInfo');
    }
    
    const resolver = executable.resolverInfo;
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing resolver', {
        module: resolver.module,
        hasExports: !!resolver.exports
      });
    }
    
    // Import the module resolution logic
    const { resolveModule } = await import('@interpreter/core/module-resolver');
    
    // Resolve the module
    const moduleContent = await resolveModule(
      resolver.module,
      env,
      {
        exports: resolver.exports
      }
    );
    
    return {
      value: moduleContent,
      env
    };
  }
}