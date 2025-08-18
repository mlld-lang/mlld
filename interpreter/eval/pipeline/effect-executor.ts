/**
 * Effect execution logic for builtin commands (show, log, output)
 */

import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';
import { evaluateNode } from '../index';
import { DEBUG_UNIVERSAL_CONTEXT } from '@core/feature-flags';
import { logger } from '@core/utils/logger';

/**
 * Execute a builtin effect (show, log, output)
 */
export async function executeBuiltinEffect(
  effect: PipelineCommand,
  input: string,
  env: Environment
): Promise<void> {
  if (DEBUG_UNIVERSAL_CONTEXT) {
    logger.debug('[Effect Executor] Executing effect:', {
      command: (effect as any).command || effect.rawIdentifier,
      type: effect.type
    });
  }
  
  // Set @input for the effect
  env.setVariable('input', {
    type: 'simple-text',
    value: input,
    metadata: {}
  });
  
  // Execute the effect - these are fire-and-forget
  // Effects produce side effects but don't change the pipeline data
  await evaluateNode(effect, env);
  
  if (DEBUG_UNIVERSAL_CONTEXT) {
    logger.debug('[Effect Executor] Effect completed');
  }
}