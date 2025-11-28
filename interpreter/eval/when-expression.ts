/**
 * When Expression Evaluator
 * 
 * Handles value-returning when expressions used in /var and /exe contexts.
 * Distinct from directive /when which executes side effects.
 */

import type { WhenExpressionNode, WhenConditionPair, WhenEntry } from '@core/types/when';
import { isLetAssignment, isAugmentedAssignment, isConditionPair } from '@core/types/when';
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { MlldWhenExpressionError } from '@core/errors';
import { evaluate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { evaluateCondition, conditionTargetsDenied } from './when';
import { logger } from '@core/utils/logger';
import { asText, asData, isStructuredValue, ensureStructuredValue } from '../utils/structured-value';
import { VariableImporter } from './import/VariableImporter';
import { combineValues } from '../utils/value-combine';
import { extractVariableValue } from '../utils/variable-resolution';

export interface WhenExpressionOptions {
  denyMode?: boolean;
}

type InterpolateFn = typeof import('../core/interpreter').interpolate;
let cachedInterpolateFn: InterpolateFn | null = null;

async function getInterpolateFn(): Promise<InterpolateFn> {
  if (!cachedInterpolateFn) {
    const module = await import('../core/interpreter');
    cachedInterpolateFn = module.interpolate;
  }
  return cachedInterpolateFn;
}

/**
 * Check if a condition is the 'none' literal
 */
function isNoneCondition(condition: any): boolean {
  return condition?.type === 'Literal' && condition?.valueType === 'none';
}

async function normalizeActionValue(value: unknown, actionEnv: Environment): Promise<unknown> {
  let normalized = value;

  if (isStructuredValue(normalized)) {
    normalized = asData(normalized);
  }

  if (
    normalized &&
    typeof normalized === 'object' &&
    'wrapperType' in (normalized as Record<string, unknown>) &&
    Array.isArray((normalized as { content?: unknown[] }).content)
  ) {
    try {
      const interpolateFn = await getInterpolateFn();
      normalized = await interpolateFn((normalized as { content: any[] }).content, actionEnv);
    } catch {
      normalized = String(normalized as any);
    }
  }

  if (normalized && typeof normalized === 'object' && 'type' in (normalized as Record<string, unknown>)) {
    const { extractVariableValue } = await import('../utils/variable-resolution');
    try {
      normalized = await extractVariableValue(normalized as any, actionEnv);
    } catch (error) {
      logger.debug('Could not extract variable value in when expression:', error);
    }
  }

  return normalized;
}

/**
 * Validate that 'none' conditions are placed correctly in a when block
 * Only checks condition pairs, not let assignments
 */
function validateNonePlacement(entries: WhenEntry[]): void {
  // Filter to only condition pairs for validation
  const conditionPairs = entries.filter(isConditionPair);

  let foundNone = false;
  let foundWildcard = false;

  for (let i = 0; i < conditionPairs.length; i++) {
    const condition = conditionPairs[i].condition;

    if (condition.length === 1 && isNoneCondition(condition[0])) {
      foundNone = true;
    } else if (condition.length === 1 && condition[0]?.type === 'Literal' && condition[0]?.valueType === 'wildcard') {
      foundWildcard = true;
      if (foundNone) {
        // * after none is technically valid but makes none unreachable
        continue;
      }
    } else if (foundNone) {
      throw new MlldWhenExpressionError(
        'The "none" keyword can only appear as the last condition(s) in a when block',
        condition[0]?.location
      );
    }

    if (foundWildcard && condition.length === 1 && isNoneCondition(condition[0])) {
      throw new MlldWhenExpressionError(
        'The "none" keyword cannot appear after "*" (wildcard) as it would never be reached',
        condition[0].location
      );
    }
  }
}

/**
 * Evaluates a when expression node to return a value.
 * 
 * Key differences from directive /when:
 * 1. Returns the value of the matching action (not empty string)
 * 2. Returns null if no conditions match
 * 3. Supports tail modifiers on the result
 * 4. Uses first-match semantics
 */
export async function evaluateWhenExpression(
  node: WhenExpressionNode,
  env: Environment,
  context?: EvaluationContext,
  options?: WhenExpressionOptions
): Promise<EvalResult> {
  // console.error('🚨 WHEN-EXPRESSION EVALUATOR CALLED');
  
  // Validate none placement
  validateNonePlacement(node.conditions);
  
  const errors: Error[] = [];
  const denyMode = Boolean(options?.denyMode);
  let deniedHandlerRan = false;
  
  // Check if we have a "first" modifier (stop after first match)
  const isFirstMode = node.meta?.modifier === 'first';
  
  // Track results from all matching conditions (for bare when)
  let lastMatchValue: any = null;
  let hasMatch = false;
  let hasNonNoneMatch = false;
  let hasValueProducingMatch = false;  // Track if any condition produced an actual return value (not just side effects)
  let lastNoneValue: any = null;
  let accumulatedEnv = env;
  const buildResult = (value: unknown, environment: Environment): EvalResult => ({
    value,
    env: environment,
    internal: deniedHandlerRan ? { deniedHandlerRan: true } : undefined
  });
  
  // Empty conditions array - return null
  if (node.conditions.length === 0) {
    return buildResult(null, env);
  }
  
  // Check if any condition pair has an action (filter out let assignments)
  const conditionPairs = node.conditions.filter(isConditionPair);
  const hasAnyAction = conditionPairs.some(c => c.action && c.action.length > 0);
  if (!hasAnyAction) {
    logger.warn('WhenExpression has no actions defined');
    return buildResult(null, env);
  }

  // Check all actions for code blocks upfront (only condition pairs, not let assignments)
  for (let i = 0; i < conditionPairs.length; i++) {
    const pair = conditionPairs[i];
    if (pair.action && pair.action.length > 0) {
      const hasCodeExecution = pair.action.some(actionNode => {
        if (typeof actionNode === 'object' && actionNode !== null && 'type' in actionNode) {
          return actionNode.type === 'code' || actionNode.type === 'command' ||
                 (actionNode.type === 'nestedDirective' && actionNode.directive === 'run');
        }
        return false;
      });

      if (hasCodeExecution) {
        throw new MlldWhenExpressionError(
          'Code blocks are not supported in when expressions. Define your logic in a separate /exe function and call it instead.',
          node.location,
          { conditionIndex: i, phase: 'action', type: 'code-block-not-supported' }
        );
      }
    }
  }
  
  // First pass: Evaluate entries in order (let assignments and non-none conditions)
  for (let i = 0; i < node.conditions.length; i++) {
    const entry = node.conditions[i];

    // Handle let assignments - evaluate and store in accumulated environment
    if (isLetAssignment(entry)) {
      let value: unknown;
      // Check if value is a raw primitive (number, boolean, null, string) or contains nodes
      const firstValue = Array.isArray(entry.value) && entry.value.length > 0 ? entry.value[0] : entry.value;
      const isRawPrimitive = firstValue === null ||
        typeof firstValue === 'number' ||
        typeof firstValue === 'boolean' ||
        (typeof firstValue === 'string' && !('type' in (firstValue as any)));

      if (isRawPrimitive) {
        // For raw primitives, use the value directly
        value = entry.value.length === 1 ? firstValue : entry.value;
      } else {
        // For nodes, evaluate them
        const valueResult = await evaluate(entry.value, accumulatedEnv, context);
        value = valueResult.value;
      }

      const importer = new VariableImporter();
      const variable = importer.createVariableFromValue(
        entry.identifier,
        value,
        'let',
        undefined,
        { env: accumulatedEnv }
      );
      accumulatedEnv = accumulatedEnv.createChild();
      accumulatedEnv.setVariable(entry.identifier, variable);
      continue;
    }

    // Handle augmented assignments - modify existing local variable
    if (isAugmentedAssignment(entry)) {
      // Get existing variable - must exist and be a let binding
      const existing = accumulatedEnv.getVariable(entry.identifier);
      if (!existing) {
        throw new MlldWhenExpressionError(
          `Cannot use += on undefined variable @${entry.identifier}. ` +
          `Use "let @${entry.identifier} = ..." first.`,
          entry.location
        );
      }

      // Evaluate the RHS value
      let rhsValue: unknown;
      const firstValue = Array.isArray(entry.value) && entry.value.length > 0 ? entry.value[0] : entry.value;
      const isRawPrimitive = firstValue === null ||
        typeof firstValue === 'number' ||
        typeof firstValue === 'boolean' ||
        (typeof firstValue === 'string' && !('type' in (firstValue as any)));

      if (isRawPrimitive) {
        rhsValue = entry.value.length === 1 ? firstValue : entry.value;
      } else {
        const rhsResult = await evaluate(entry.value, accumulatedEnv, context);
        rhsValue = rhsResult.value;
      }

      // Get current value of the variable
      const existingValue = await extractVariableValue(existing, accumulatedEnv);

      // Combine values using the += semantics
      const combined = combineValues(existingValue, rhsValue, entry.identifier);

      // Update variable in local scope (use updateVariable to bypass redefinition check)
      const importer = new VariableImporter();
      const updatedVar = importer.createVariableFromValue(
        entry.identifier,
        combined,
        'let',
        undefined,
        { env: accumulatedEnv }
      );
      accumulatedEnv.updateVariable(entry.identifier, updatedVar);
      continue;
    }

    // From here on, entry is a condition pair
    const pair = entry as WhenConditionPair;

    // Check if this is a none condition
    if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
      // Skip none conditions in first pass
      continue;
    }

    if (denyMode && !conditionTargetsDenied(pair.condition)) {
      continue;
    }

    try {
      // Evaluate the condition
      const conditionResult = await evaluateCondition(pair.condition, accumulatedEnv);
      
      if (process.env.DEBUG_WHEN) {
        logger.debug('WhenExpression condition result:', { 
          index: i, 
          conditionResult,
          hasAction: !!(pair.action && pair.action.length > 0)
        });
      }
      
      if (conditionResult) {
        // Condition matched - evaluate the action
        hasMatch = true;
        hasNonNoneMatch = true;
        const matchedDeniedCondition = conditionTargetsDenied(pair.condition);
        if (matchedDeniedCondition) {
          deniedHandlerRan = true;
        }
        
        if (!pair.action || pair.action.length === 0) {
          // No action for this condition - continue to next
          continue;
        }
        try {
          // Special-case: detect retry with optional hint without evaluating side-effects
          // Pattern: action starts with a RetryLiteral, optionally followed by a Text node (hint)
          if (Array.isArray(pair.action) && pair.action.length >= 1) {
            const first = pair.action[0] as any;
            if (first && typeof first === 'object' && first.type === 'Literal' && first.value === 'retry') {
              let value: any = 'retry';
              // If there are additional nodes after retry, evaluate them as hint expression
              if (pair.action.length > 1) {
                const hintNodes = pair.action.slice(1);
                const hintEnv = accumulatedEnv.createChild();
                try {
                  let hintValue: any;
                  const firstNode: any = hintNodes[0];
                  if (firstNode && typeof firstNode === 'object' && 'type' in firstNode && firstNode.type === 'object') {
                    // Object literal hint → evaluate as data value to preserve object
                    const { evaluateDataValue } = await import('../eval/data-value-evaluator');
                    hintValue = await evaluateDataValue(firstNode, hintEnv);
                  } else {
                    // String/function/exec/template hint → interpolate to plain string
                    // Check if the first node is a wrapper with content
                    const interpolateFn = await getInterpolateFn();
                    if (firstNode && typeof firstNode === 'object' && 'content' in firstNode && Array.isArray(firstNode.content)) {
                      hintValue = await interpolateFn(firstNode.content, hintEnv);
                    } else {
                      hintValue = await interpolateFn(hintNodes as any, hintEnv);
                    }
                    if (typeof hintValue !== 'string') {
                      // Defensive: ensure non-object hints are plain strings
                      try {
                        hintValue = String(hintValue);
                      } catch {
                        hintValue = '';
                      }
                    }
                  }
                  value = { value: 'retry', hint: hintValue };
                } catch {
                  // Fall back to plain retry on evaluation failure
                  value = 'retry';
                }
              }
              // In "first" mode, return immediately after first match
              if (isFirstMode) {
                return buildResult(value, accumulatedEnv);
              }
              lastMatchValue = value;
              hasMatch = true;
              hasValueProducingMatch = true;  // action produces a value
              continue;
            }
          }

          // Debug: What are we trying to evaluate?
          if (Array.isArray(pair.action) && pair.action[0]) {
            const firstAction = pair.action[0];
            logger.debug('WhenExpression evaluating action:', {
              actionType: firstAction.type,
              actionKind: firstAction.kind,
              actionSubtype: firstAction.subtype
            });
          }
          
          // Evaluate the action to get its value
          // IMPORTANT SCOPING RULE:
          // - /when (directive) uses global scope semantics (handled elsewhere)
          // - when: [...] in /exe uses LOCAL scope – evaluate actions in a child env
          //
          // Also: Local variable assignments inside earlier actions must be
          // visible to later actions in the same when-expression. We therefore
          // evaluate each action in a child env and merge resulting variable
          // bindings back into the accumulatedEnv after evaluation.
          const actionEnv = accumulatedEnv.createChild();
          let actionResult: EvalResult | null = null;
          let value: unknown;
          const wrapperCandidate =
            pair.action.length === 1 &&
            pair.action[0] &&
            typeof pair.action[0] === 'object' &&
            !('type' in (pair.action[0] as BaseMlldNode)) &&
            Array.isArray((pair.action[0] as any).content)
              ? (pair.action[0] as { content: any[] })
              : null;

          if (wrapperCandidate) {
            const interpolateFn = await getInterpolateFn();
            value = await interpolateFn(wrapperCandidate.content, actionEnv, InterpolationContext.Template);
          } else {
            // FIXED: Suppress side effects in when expressions used in /exe functions
            // Side effects should be handled by the calling context (e.g., /show @func())
            // Evaluate the action in normal directive context so effects stream.
            // We avoid forcing isExpression here to preserve effect emission.
            actionResult = await evaluate(pair.action, actionEnv, context);
            value = actionResult.value;
          }
          value = await normalizeActionValue(value, actionEnv);
          if (Array.isArray(pair.action) && pair.action.length === 1) {
            const singleAction = pair.action[0];
            if (singleAction && typeof singleAction === 'object' && singleAction.type === 'Directive') {
              const directiveKind = singleAction.kind;
              // For side-effect directives, handle appropriately for expression context
              if (directiveKind === 'show') {
                // Tag as side-effect so pipeline layer can suppress echo
                value = { __whenEffect: 'show', text: value } as any;
              } else if (directiveKind === 'output') {
                // Output actions should return empty string (file write is the side effect)
                value = '';
              } else if (directiveKind === 'var') {
                // Variable assignments in when expressions are side effects
                // They should not count as value-producing matches for 'none' evaluation
                // But we do need to extract the value for chaining purposes
                const identifier = singleAction.values?.identifier;
                if (identifier && Array.isArray(identifier) && identifier[0]) {
                  const varName = identifier[0].identifier;
                  if (varName && actionResult.env) {
                    try {
                      const variable = actionResult.env.getVariable(varName);
                      if (variable) {
                        // Return the assigned variable's raw value, not the Variable wrapper
                        const { extractVariableValue } = await import('../utils/variable-resolution');
                        const variableValue = await extractVariableValue(variable, actionResult.env);
                        value = variableValue as any;
                      }
                    } catch (e) {
                      // If we can't get the variable value, fall back to empty string
                      logger.debug('Could not get variable value for when expression:', { varName, error: e });
                    }
                  }
                }
                // Don't count this as a value-producing match
                // Variable assignments are side effects, not return values
              }
            }
          }
          
          // Apply tail modifiers if present
          const executionEnv = actionResult?.env ?? actionEnv;

          if (node.withClause && node.withClause.pipes) {
            value = await applyTailModifiers(value, node.withClause.pipes, executionEnv);
          }
          
          // Merge variable assignments from this action back into the
          // accumulated environment so subsequent actions can see them.
          // We use mergeChild to merge variables; since actions are evaluated
          // with isExpression=true, no user-facing nodes are produced.
          accumulatedEnv.mergeChild(executionEnv);

          // In "first" mode, return immediately after first match
          if (isFirstMode) {
            return buildResult(value, accumulatedEnv);
          }

          // For bare when, save the value and continue evaluating
          lastMatchValue = value;
          
          // Check if this is a variable assignment (which shouldn't count as value-producing)
          if (Array.isArray(pair.action) && pair.action.length === 1) {
            const singleAction = pair.action[0];
            if (singleAction && typeof singleAction === 'object' && 
                singleAction.type === 'Directive' && singleAction.kind === 'var') {
              // Variable assignment - don't mark as value-producing
              // The value is just for internal chaining, not a return value
            } else {
              hasValueProducingMatch = true;  // This action produced a real value
            }
          } else {
            hasValueProducingMatch = true;  // Multi-action or non-directive action produced a value
          }
          
          // Continue to evaluate other matching conditions
        } catch (actionError) {
          throw new MlldWhenExpressionError(
            `Error evaluating action for condition ${i + 1}: ${actionError.message}`,
            node.location,
            { conditionIndex: i, phase: 'action', originalError: actionError }
          );
        }
      }
    } catch (conditionError) {
      // Let the error propagate - it's expected in retry scenarios
      
      // Collect condition errors but continue evaluating
      errors.push(new MlldWhenExpressionError(
        `Error evaluating condition ${i + 1}: ${conditionError.message}`,
        node.location,
        { conditionIndex: i, phase: 'condition', originalError: conditionError }
      ));
    }
  }
  
  // Second pass: Evaluate none conditions if no value-producing conditions matched
  if (!hasValueProducingMatch && !denyMode) {
    for (let i = 0; i < node.conditions.length; i++) {
      const entry = node.conditions[i];

      // Skip let assignments in second pass (already processed)
      if (isLetAssignment(entry)) {
        continue;
      }

      const pair = entry;

      // Only process none conditions in second pass
      if (!(pair.condition.length === 1 && isNoneCondition(pair.condition[0]))) {
        continue;
      }
      
      if (!pair.action || pair.action.length === 0) {
        // No action for this none condition - continue to next
        continue;
      }
      
      try {
        // Evaluate the action for none condition
        const actionEnv = accumulatedEnv.createChild();
        // FIXED: Suppress side effects in when expressions used in /exe functions
        // Side effects should be handled by the calling context (e.g., /show @func())
        const actionResult = await evaluate(pair.action, actionEnv, context);
        
        let value = actionResult.value;
        value = await normalizeActionValue(value, actionEnv);
        
        // Apply tail modifiers if present
        if (node.withClause && node.withClause.pipes) {
          value = await applyTailModifiers(value, node.withClause.pipes, actionResult.env);
        }
        
        // Merge variable assignments from this none-action into accumulator
        accumulatedEnv.mergeChild(actionEnv);

        // In "first" mode, return immediately after first none match
          if (isFirstMode) {
            return buildResult(value, accumulatedEnv);
          }

        // For bare when, save the none value and continue
        lastNoneValue = value;
        hasMatch = true;
      } catch (actionError) {
        throw new MlldWhenExpressionError(
          `Error evaluating none action for condition ${i + 1}: ${actionError.message}`,
          node.location,
          { conditionIndex: i, phase: 'action', originalError: actionError }
        );
      }
    }
    
    // If we had none matches, use the last none value
    if (lastNoneValue !== null) {
      lastMatchValue = lastNoneValue;
    }
  }
  
  // If we had any matches, return the last match value with accumulated environment
  if (hasMatch) {
    return buildResult(lastMatchValue, accumulatedEnv);
  }
  
  // If we collected errors and no condition matched, report them
  if (errors.length > 0) {
    throw new MlldWhenExpressionError(
      `When expression evaluation failed with ${errors.length} condition errors`,
      node.location,
      { errors }
    );
  }
  
  // No conditions matched - return null
  return buildResult(null, accumulatedEnv);
}

/**
 * Apply tail modifiers (pipeline operations) to a value
 */
async function applyTailModifiers(
  value: unknown,
  pipes: BaseMlldNode[],
  env: Environment
): Promise<unknown> {
  let result = value;
  
  for (const pipe of pipes) {
    // Create a child environment with the current value as pipeline input
    const pipeEnv = env.createChild();
    
    // Set up pipeline input variable
    const { createStructuredValueVariable } = await import('@core/types/variable');
    const structuredInput = ensureStructuredValue(result, undefined, String(result));
    const pipelineVar = createStructuredValueVariable(
      '_pipelineInput',
      structuredInput,
      { directive: 'var', syntax: 'reference', hasInterpolation: false, isMultiLine: false },
      { internal: { isPipelineInput: true, pipelineStage: 0 } }
    );
    
    pipeEnv.setVariable('_pipelineInput', pipelineVar);
    
    // Evaluate the pipe operation
    const pipeResult = await evaluate(pipe, pipeEnv);
    result = pipeResult.value;
  }
  
  return result;
}


/**
 * Peek at the type of a when expression without full evaluation
 * Used for type inference in var assignments
 */
export async function peekWhenExpressionType(
  node: WhenExpressionNode,
  env: Environment
): Promise<import('@core/types/variable').VariableTypeDiscriminator> {
  // Analyze action types without evaluation
  const actionTypes = new Set<import('@core/types/variable').VariableTypeDiscriminator>();
  
  for (const entry of node.conditions) {
    // Skip let assignments - they don't produce action types
    if (isLetAssignment(entry)) {
      continue;
    }

    const pair = entry;
    if (pair.action && pair.action.length > 0) {
      // Simple heuristic based on first node type
      const firstNode = pair.action[0];
      
      if (firstNode.type === 'Text') {
        actionTypes.add('simple-text');
      } else if (firstNode.type === 'Literal') {
        const literal = firstNode as any;
        if (typeof literal.value === 'number') {
          actionTypes.add('primitive');
        } else if (typeof literal.value === 'boolean') {
          actionTypes.add('primitive');
        } else if (literal.value === null) {
          actionTypes.add('primitive');
        }
      } else if (firstNode.type === 'object') {
        actionTypes.add('object');
      } else if (firstNode.type === 'array') {
        actionTypes.add('array');
      } else if (firstNode.type === 'Directive') {
        // Directives in expressions typically return computed values
        actionTypes.add('computed');
      } else {
        // Default to computed for complex expressions
        actionTypes.add('computed');
      }
    }
  }
  
  // If all actions have same type, use that
  if (actionTypes.size === 1) {
    return Array.from(actionTypes)[0];
  }
  
  // Mixed types or unknown - use computed
  return 'computed';
}
