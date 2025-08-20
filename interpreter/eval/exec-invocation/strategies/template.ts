import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { isTemplateExecutable } from '@core/types/executable';
import { interpolate } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { logger } from '@core/utils/logger';

/**
 * Executes template-based executable definitions
 * 
 * Handles string templates with interpolation of @variable references.
 * Templates can be simple strings or complex multi-line text with embedded
 * variable references that get resolved at execution time.
 * 
 * INTERPOLATION: Supports both simple (@var) and complex (@var.field) references
 * CONTEXT: Templates execute with access to all parent scope variables
 */
export class TemplateExecutionStrategy extends BaseExecutionStrategy {
  canHandle(executable: ExecutableDefinition): boolean {
    return isTemplateExecutable(executable);
  }
  
  async execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!isTemplateExecutable(executable)) {
      throw new Error('Invalid executable type for TemplateExecutionStrategy');
    }
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing template', {
        template: executable.template?.substring(0, 100),
        hasInterpolation: executable.syntaxInfo?.hasInterpolation
      });
    }
    
    // Handle template interpolation
    let result: string;
    
    if (executable.syntaxInfo?.hasInterpolation !== false) {
      // Perform interpolation
      const context = new InterpolationContext(env, {
        autoExecute: true,
        preserveUndefined: false
      });
      
      result = await interpolate(executable.template || '', context);
    } else {
      // No interpolation needed
      result = executable.template || '';
    }
    
    // Normalize line endings for multi-line templates
    if (executable.syntaxInfo?.isMultiLine) {
      result = result.replace(/\r\n/g, '\n');
    }
    
    return this.createResult(result, env);
  }
}