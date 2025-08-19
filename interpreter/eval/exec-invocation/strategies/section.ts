import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { isSectionExecutable } from '@core/types/executable';
import { extractSection } from '@interpreter/eval/show';
import { logger } from '@core/utils/logger';

/**
 * Strategy for executing section selector executables
 * Handles markdown section extraction
 */
export class SectionExecutionStrategy extends BaseExecutionStrategy {
  canHandle(executable: ExecutableDefinition): boolean {
    return isSectionExecutable(executable);
  }
  
  async execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!isSectionExecutable(executable)) {
      throw new Error('Invalid executable type for SectionExecutionStrategy');
    }
    
    if (!executable.sectionSelector) {
      throw new Error('Section executable missing sectionSelector');
    }
    
    const selector = executable.sectionSelector;
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing section selector', {
        file: selector.file,
        section: selector.section
      });
    }
    
    // Extract the section content
    const content = await extractSection(
      selector.file,
      selector.section,
      env
    );
    
    return {
      value: content,
      env
    };
  }
}