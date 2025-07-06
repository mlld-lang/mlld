import type { Environment } from '../env/Environment';
import type { DataValue } from '@core/types/var';
import { 
  isDirectiveValue,
  isVariableReferenceValue,
  isTemplateValue,
  isPrimitiveValue
} from '@core/types/var';
import { DataValueEvaluator } from './data-values/DataValueEvaluator';
import { logger } from '@core/utils/logger';

/**
 * Singleton instance of the main data value evaluator coordinator
 */
const dataValueEvaluator = new DataValueEvaluator();

/**
 * Gets the main data value evaluator instance for advanced usage
 */
export function getDataValueEvaluator(): DataValueEvaluator {
  return dataValueEvaluator;
}

/**
 * Gets evaluator statistics for monitoring and debugging
 */
export function getEvaluatorStats(): Record<string, any> {
  return dataValueEvaluator.getEvaluatorStats();
}

/**
 * Evaluates a DataValue, recursively evaluating any embedded directives,
 * variable references, or templates.
 * 
 * This function serves as the main entry point for data value evaluation
 * and delegates to the DataValueEvaluator coordinator.
 */
export async function evaluateDataValue(
  value: DataValue,
  env: Environment
): Promise<any> {
  return await dataValueEvaluator.evaluate(value, env);
}

/**
 * Checks if a data value has been fully evaluated (no unevaluated directives remain)
 */
export function isFullyEvaluated(value: DataValue): boolean {
  if (isPrimitiveValue(value)) {
    return true;
  }
  
  if (isDirectiveValue(value)) {
    const stateManager = dataValueEvaluator.getStateManager();
    const cached = stateManager.getCachedResult(value);
    return cached?.hit === true;
  }
  
  if (isVariableReferenceValue(value) || isTemplateValue(value)) {
    return false; // These always need evaluation
  }
  
  if (value?.type === 'object') {
    return Object.values(value.properties).every(isFullyEvaluated);
  }
  
  if (value?.type === 'array') {
    return value.elements.every(isFullyEvaluated);
  }
  
  return true;
}

/**
 * Check if a data value contains any unevaluated directives
 */
export function hasUnevaluatedDirectives(value: DataValue): boolean {
  if (isPrimitiveValue(value)) {
    return false;
  }
  
  if (value?.type === 'Directive') {
    return true;
  }
  
  // Check for foreach expressions
  if (value && typeof value === 'object' && value.type === 'foreach') {
    return true;
  }
  
  // Check for ExecInvocation nodes
  if (value && typeof value === 'object' && value.type === 'ExecInvocation') {
    return true;
  }
  
  // Check for command objects (from run directives)
  if (value && typeof value === 'object' && value.type === 'command' && 'command' in value) {
    return true;
  }
  
  // Check for wrapped strings (quotes, backticks, brackets)
  if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
    return true;
  }
  
  if (Array.isArray(value)) {
    return value.some(hasUnevaluatedDirectives);
  }
  
  if (value?.type === 'array' && 'elements' in value) {
    return value.elements.some(hasUnevaluatedDirectives);
  }
  
  if (value?.type === 'object' && 'properties' in value) {
    return Object.values(value.properties).some(hasUnevaluatedDirectives);
  }
  
  if (typeof value === 'object' && value !== null && !value.type) {
    return Object.values(value).some(hasUnevaluatedDirectives);
  }
  
  return false;
}

/**
 * Collects any evaluation errors from a data value
 */
export function collectEvaluationErrors(
  value: any,
  path: string = ''
): Record<string, Error> {
  const errors: Record<string, Error> = {};
  
  if (value?.__error) {
    errors[path] = new Error(value.__message);
    return errors;
  }
  
  if (typeof value === 'object' && value !== null) {
    for (const [key, propValue] of Object.entries(value)) {
      const propPath = path ? `${path}.${key}` : key;
      Object.assign(errors, collectEvaluationErrors(propValue, propPath));
    }
  }
  
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const elemPath = `${path}[${i}]`;
      Object.assign(errors, collectEvaluationErrors(value[i], elemPath));
    }
  }
  
  return errors;
}

