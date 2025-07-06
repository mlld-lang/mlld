/**
 * Refactored import system - modular architecture
 * 
 * This module exports the new import directive evaluator that coordinates
 * all import processing through focused, maintainable components.
 */

export { ImportDirectiveEvaluator } from './ImportDirectiveEvaluator';
export { ImportPathResolver, type ImportResolution } from './ImportPathResolver';
export { ImportSecurityValidator, type SecurityValidation } from './ImportSecurityValidator';
export { ModuleContentProcessor, type ModuleProcessingResult } from './ModuleContentProcessor';
export { VariableImporter } from './VariableImporter';
export { ObjectReferenceResolver } from './ObjectReferenceResolver';

// Re-export the main evaluation function for backward compatibility
import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ImportDirectiveEvaluator } from './ImportDirectiveEvaluator';

/**
 * Main entry point for import directive evaluation
 * This function maintains backward compatibility while using the new modular architecture
 */
export async function evaluateImport(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const evaluator = new ImportDirectiveEvaluator(env);
  return evaluator.evaluateImport(directive, env);
}