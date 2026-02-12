/**
 * When Expression Evaluator
 * 
 * Handles value-returning when expressions used in /var and /exe contexts.
 * Distinct from directive /when which executes side effects.
 */

import type { WhenExpressionNode, WhenConditionPair, WhenEntry } from '@core/types/when';
import { isLetAssignment, isAugmentedAssignment, isConditionPair, isDirectAction } from '@core/types/when';
import { astLocationToSourceLocation, type BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { MlldWhenExpressionError } from '@core/errors';
import { evaluate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { evaluateCondition, conditionTargetsDenied, evaluateAugmentedAssignment, evaluateLetAssignment } from './when';
import { logger } from '@core/utils/logger';
import { asText, isStructuredValue, ensureStructuredValue, extractSecurityDescriptor } from '../utils/structured-value';
import { VariableImporter } from './import/VariableImporter';
import { extractVariableValue, isVariable } from '../utils/variable-resolution';
import { isContinueLiteral, isDoneLiteral, type ContinueLiteralNode, type DoneLiteralNode } from '@core/types/control';
import { isExeReturnControl } from './exe-return';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';

/**
 * Re-attach a security descriptor to a value after normalization has stripped it.
 * For objects, uses the ExpressionProvenance WeakMap.
 * For strings (primitives that can't be WeakMap keys), wraps as StructuredValue.
 */
function reattachSecurityDescriptor(value: unknown, descriptor: SecurityDescriptor | undefined): unknown {
  if (!descriptor) return value;
  if (descriptor.labels.length === 0 && descriptor.taint.length === 0 && descriptor.sources.length === 0) return value;
  if (value && typeof value === 'object') {
    setExpressionProvenance(value, descriptor);
    return value;
  }
  if (typeof value === 'string') {
    return ensureStructuredValue(value, 'text', value, { security: descriptor });
  }
  return value;
}

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

function getWhenExpressionSource(env: Environment): { filePath: string; source?: string } {
  const filePath =
    env.getCurrentFilePath() ??
    env.getPathContext?.()?.filePath ??
    '<stdin>';
  const source = env.getSource(filePath) ?? (filePath !== '<stdin>' ? env.getSource('<stdin>') : undefined);
  return { filePath, source };
}

function getConditionLocation(
  condition: BaseMlldNode[],
  filePath: string
): ReturnType<typeof astLocationToSourceLocation> {
  const first = condition[0] as any;
  if (!first?.location) return undefined;
  return astLocationToSourceLocation(first.location, filePath);
}

function normalizeConditionText(text?: string, maxLength = 160): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? normalized.slice(0, maxLength) + '...' : normalized;
}

function getNodeOffsetRange(node: unknown): { start?: number; end?: number } {
  if (!node || typeof node !== 'object') {
    return {};
  }

  let start: number | undefined;
  let end: number | undefined;
  const stack: unknown[] = [node];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }

    const location = (current as any).location;
    const locStart = location?.start?.offset;
    const locEnd = location?.end?.offset ?? location?.start?.offset;
    if (typeof locStart === 'number') {
      start = typeof start === 'number' ? Math.min(start, locStart) : locStart;
    }
    if (typeof locEnd === 'number') {
      end = typeof end === 'number' ? Math.max(end, locEnd) : locEnd;
    }

    for (const value of Object.values(current as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          stack.push(item);
        }
      } else {
        stack.push(value);
      }
    }
  }

  return { start, end };
}

function getConditionText(condition: BaseMlldNode[], source?: string): string | undefined {
  if (!source || condition.length === 0) return undefined;
  const first = condition[0] as any;
  const last = condition[condition.length - 1] as any;
  const start = first?.location?.start?.offset;
  const end = last?.location?.end?.offset ?? last?.location?.start?.offset;
  if (typeof start !== 'number' || typeof end !== 'number' || end <= start) return undefined;
  return normalizeConditionText(source.slice(start, end));
}

function getConditionPairText(pair: WhenConditionPair, source?: string): string | undefined {
  if (!source || !Array.isArray(pair.condition) || pair.condition.length === 0) {
    return undefined;
  }

  const firstCondition = pair.condition[0];
  const lastCondition = pair.condition[pair.condition.length - 1];
  const lastAction =
    Array.isArray(pair.action) && pair.action.length > 0
      ? pair.action[pair.action.length - 1]
      : undefined;
  const startRange = getNodeOffsetRange(firstCondition);
  const actionRange = getNodeOffsetRange(lastAction);
  const conditionRange = getNodeOffsetRange(lastCondition);

  const start = startRange.start;
  const end = actionRange.end ?? conditionRange.end;
  if (typeof start !== 'number' || typeof end !== 'number' || end <= start) {
    return undefined;
  }

  return normalizeConditionText(source.slice(start, end));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function evaluateActionNodes(
  nodes: BaseMlldNode[],
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  let currentEnv = env;
  let lastResult: EvalResult = { value: undefined, env: currentEnv };

  for (const node of nodes) {
    if (isLetAssignment(node)) {
      currentEnv = await evaluateLetAssignment(node, currentEnv);
      lastResult = { value: undefined, env: currentEnv };
      continue;
    }
    if (isAugmentedAssignment(node)) {
      currentEnv = await evaluateAugmentedAssignment(node, currentEnv);
      lastResult = { value: undefined, env: currentEnv };
      continue;
    }

    const result = await evaluate(node as any, currentEnv, context);
    currentEnv = result.env || currentEnv;
    lastResult = result;

    if (isExeReturnControl(result.value)) {
      return { value: result.value, env: currentEnv };
    }
  }

  return { value: lastResult.value, env: currentEnv };
}

/**
 * Check if a condition is the 'none' literal
 */
function isNoneCondition(condition: any): boolean {
  return condition?.type === 'Literal' && condition?.valueType === 'none';
}

async function normalizeActionValue(value: unknown, actionEnv: Environment): Promise<unknown> {
  let normalized = value;

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

  if (isStructuredValue(normalized)) {
    return normalized;
  }

  if (normalized && typeof normalized === 'object' && 'type' in (normalized as Record<string, unknown>)) {
    const nodeType = (normalized as Record<string, unknown>).type;

    // Handle Literal nodes directly - extract the value
    if (nodeType === 'Literal' && 'value' in (normalized as Record<string, unknown>)) {
      const valueType = (normalized as Record<string, unknown>).valueType;
      if (valueType === 'done' || valueType === 'continue') {
        return normalized;
      }
      normalized = (normalized as { value: unknown }).value;
    } else {
      // Try to extract variable value for other node types
      const { extractVariableValue } = await import('../utils/variable-resolution');
      try {
        normalized = await extractVariableValue(normalized as any, actionEnv);
      } catch (error) {
        logger.debug('Could not extract variable value in when expression:', error);
      }
    }
  }

  return normalized;
}

async function evaluateControlLiteral(
  literal: DoneLiteralNode | ContinueLiteralNode,
  env: Environment
): Promise<unknown> {
  const val = literal.value;
  if (Array.isArray(val)) {
    const target = val.length === 1 ? val[0] : val;
    if (target && typeof target === 'object' && 'type' in (target as Record<string, unknown>)) {
      const evaluated = await evaluate(target as any, env, { isExpression: true });
      if (isVariable(evaluated.value)) {
        return extractVariableValue(evaluated.value, env);
      }
      return evaluated.value;
    }
    const evaluated = await evaluate(val as any, env, { isExpression: true });
    if (isVariable(evaluated.value)) {
      return extractVariableValue(evaluated.value, env);
    }
    return evaluated.value;
  }
  if (val === 'done' || val === 'continue') {
    return undefined;
  }
  return val;
}

/**
 * Validate that 'none' conditions are placed correctly in a when block
 * Only checks condition pairs, not let assignments
 */
function validateNonePlacement(
  entries: WhenEntry[],
  sourceInfo: { filePath: string; source?: string },
  env: Environment
): void {
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
        astLocationToSourceLocation(condition[0]?.location, sourceInfo.filePath),
        {
          filePath: sourceInfo.filePath,
          sourceContent: sourceInfo.source
        },
        { env }
      );
    }

    if (foundWildcard && condition.length === 1 && isNoneCondition(condition[0])) {
      throw new MlldWhenExpressionError(
        'The "none" keyword cannot appear after "*" (wildcard) as it would never be reached',
        astLocationToSourceLocation(condition[0].location, sourceInfo.filePath),
        {
          filePath: sourceInfo.filePath,
          sourceContent: sourceInfo.source
        },
        { env }
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
  return env.withExecutionContext('when-expression', { allowLetShadowing: true }, async () =>
    evaluateWhenExpressionInternal(node, env, context, options)
  );
}

async function evaluateWhenExpressionInternal(
  node: WhenExpressionNode,
  env: Environment,
  context?: EvaluationContext,
  options?: WhenExpressionOptions
): Promise<EvalResult> {
  // console.error('🚨 WHEN-EXPRESSION EVALUATOR CALLED');
  
  const sourceInfo = getWhenExpressionSource(env);

  // Validate none placement
  validateNonePlacement(node.conditions, sourceInfo, env);
  
  const errors: MlldWhenExpressionError[] = [];
  const denyMode = Boolean(options?.denyMode);
  let deniedHandlerRan = false;
  
  const boundIdentifier = (node as any).boundIdentifier || node.meta?.boundIdentifier;
  const hasBoundValue = Boolean((node as any).boundValue && typeof boundIdentifier === 'string' && boundIdentifier.length > 0);
  let boundValue: unknown;
  let boundValueDescriptor: SecurityDescriptor | undefined;

  if (hasBoundValue) {
    const boundResult = await evaluate((node as any).boundValue, env, context);
    boundValue = boundResult.value;
    // Extract security descriptor from the bound value (e.g., secret @key's labels)
    // This taint must flow through to the when-expression result
    boundValueDescriptor = extractSecurityDescriptor(boundValue);
    if (!boundValueDescriptor && isVariable(boundValue)) {
      const varMx = (boundValue as any).mx;
      if (varMx) {
        const { varMxToSecurityDescriptor } = await import('@core/types/variable/VarMxHelpers');
        boundValueDescriptor = varMxToSecurityDescriptor(varMx);
      }
    }
  }

  const setBoundValue = (targetEnv: Environment) => {
    if (!hasBoundValue) return;
    const importer = new VariableImporter();
    const variable = importer.createVariableFromValue(
      boundIdentifier,
      boundValue,
      'let',
      undefined,
      { env: targetEnv }
    );
    targetEnv.setVariable(boundIdentifier, variable);
  };
  
  // Track results from matching conditions
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

  // Check if we have direct actions (show, log, etc. without condition)
  const hasDirectActions = node.conditions.some(e => isDirectAction(e));

  // Check if this is a "when (condition) [block]" syntax
  // In this case, there are no condition pairs, only let/augmented assignments and/or direct actions
  // The boundValue holds the condition to check
  const hasOnlyAssignmentsOrDirectActions = !hasAnyAction && node.conditions.some(e =>
    isLetAssignment(e) || isAugmentedAssignment(e) || isDirectAction(e)
  );

  if (!hasAnyAction && !hasOnlyAssignmentsOrDirectActions) {
    logger.warn('WhenExpression has no actions defined');
    return buildResult(null, env);
  }

  // For "when (condition) [block]" syntax, check if the bound condition is truthy
  // If falsy, skip the block entirely
  let boundConditionIsTruthy = true;
  if (hasBoundValue && hasOnlyAssignmentsOrDirectActions) {
    // Use evaluateCondition to properly check truthiness
    const boundValueNode = (node as any).boundValue;
    if (boundValueNode) {
      boundConditionIsTruthy = await evaluateCondition([boundValueNode], env);
    }

    if (!boundConditionIsTruthy) {
      // Condition is falsy, skip the entire block
      return buildResult(null, accumulatedEnv);
    }
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
        const conditionText = getConditionText(pair.condition, sourceInfo.source);
        throw new MlldWhenExpressionError(
          'Code blocks are not supported in when expressions. Define your logic in a separate exe function and call it instead.',
          astLocationToSourceLocation(node.location, sourceInfo.filePath),
          {
            conditionIndex: i,
            phase: 'action',
            type: 'code-block-not-supported',
            conditionText,
            filePath: sourceInfo.filePath,
            sourceContent: sourceInfo.source
          },
          { env }
        );
      }
    }
  }
  
  // First pass: Evaluate entries in order (let assignments, direct actions, and non-none conditions)
  for (let i = 0; i < node.conditions.length; i++) {
    const entry = node.conditions[i];

    // Unwrap array-wrapped entries (grammar sometimes wraps actions in arrays)
    const unwrappedEntry = Array.isArray(entry) && entry.length === 1 ? entry[0] : entry;

    // Handle let assignments - use evaluateLetAssignment for consistent behavior
    if (isLetAssignment(unwrappedEntry)) {
      accumulatedEnv = await evaluateLetAssignment(unwrappedEntry, accumulatedEnv);
      continue;
    }

    // Handle augmented assignments - use evaluateAugmentedAssignment for proper scope handling
    if (isAugmentedAssignment(unwrappedEntry)) {
      accumulatedEnv = await evaluateAugmentedAssignment(unwrappedEntry, accumulatedEnv);
      continue;
    }

    // Handle direct actions (show, log, etc. without condition)
    // These are only executed if we're in a bound-value context where the condition passed
    if (isDirectAction(unwrappedEntry)) {
      // Direct actions only make sense in bound-value when blocks
      // The boundConditionIsTruthy check above ensures we only get here if condition passed
      if (hasBoundValue && boundConditionIsTruthy) {
        const actionEnv = accumulatedEnv.createChild();
        setBoundValue(actionEnv);
        // Pass the unwrapped entry (not wrapped in another array)
        const toEvaluate = Array.isArray(entry) ? entry : [unwrappedEntry];
        const actionResult = await evaluateActionNodes(toEvaluate as BaseMlldNode[], actionEnv, context);
        const resultEnv = actionResult.env || actionEnv;
        if (isExeReturnControl(actionResult.value)) {
          accumulatedEnv.mergeChild(resultEnv);
          return buildResult(actionResult.value, accumulatedEnv);
        }
        accumulatedEnv.mergeChild(resultEnv);
        // Direct actions are side effects, don't update the return value
      }
      continue;
    }

    // From here on, entry is a condition pair (use unwrapped entry)
    const pair = unwrappedEntry as WhenConditionPair;

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
      const conditionEnv = hasBoundValue ? accumulatedEnv.createChild() : accumulatedEnv;
      if (hasBoundValue) setBoundValue(conditionEnv);
      const conditionResult = await evaluateCondition(pair.condition, conditionEnv);

      if (process.env.DEBUG_WHEN) {
        logger.debug('WhenExpression condition result:', { 
          index: i, 
          conditionResult,
          hasAction: !!(pair.action && pair.action.length > 0)
        });
      }
      
      if (conditionResult) {
        // Condition matched - evaluate the action
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
              // Return immediately after the first match
              return buildResult(value, accumulatedEnv);
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
          } else if (node.meta?.isBlockForm && Array.isArray(pair.action) && pair.action.length > 1) {
            // Block form: when @condition [statements; => value]
            // Execute each statement sequentially, accumulating environment changes
            let blockEnv = actionEnv;
            let lastValue: unknown = undefined;
            let blockResult: EvalResult | null = null;
            for (const actionNode of pair.action) {
              if (isLetAssignment(actionNode)) {
                blockEnv = await evaluateLetAssignment(actionNode as any, blockEnv);
              } else if (isAugmentedAssignment(actionNode)) {
                blockEnv = await evaluateAugmentedAssignment(actionNode as any, blockEnv);
              } else {
                const result = await evaluate(actionNode, blockEnv, context);
                if (result.env) {
                  blockEnv = result.env;
                }
                lastValue = result.value;
                if (isExeReturnControl(result.value)) {
                  blockResult = result;
                  break;
                }
              }
            }
            if (blockResult) {
              actionResult = blockResult;
              value = blockResult.value;
            } else {
              actionResult = { value: lastValue, env: blockEnv };
              value = lastValue;
            }
          } else {
            actionResult = await evaluateActionNodes(pair.action, actionEnv, context);
            value = actionResult.value;
          }
          const executionEnv = actionResult?.env ?? actionEnv;
          if (actionResult && isExeReturnControl(actionResult.value)) {
            accumulatedEnv.mergeChild(executionEnv);
            return buildResult(reattachSecurityDescriptor(actionResult.value, boundValueDescriptor), accumulatedEnv);
          }
          // Extract security descriptor before normalizeActionValue strips it
          const preNormDescriptor = extractSecurityDescriptor(value) ?? extractSecurityDescriptor(actionResult?.value);
          value = await normalizeActionValue(value, actionEnv);
          if (isDoneLiteral(value as any)) {
            const resolved = await evaluateControlLiteral(value as any, executionEnv);
            value = { __whileControl: 'done', value: resolved };
          } else if (isContinueLiteral(value as any)) {
            const resolved = await evaluateControlLiteral(value as any, executionEnv);
            value = { __whileControl: 'continue', value: resolved };
          }
	          if (Array.isArray(pair.action) && pair.action.length === 1) {
	            const singleAction = pair.action[0];
	            if (singleAction && typeof singleAction === 'object' && singleAction.type === 'Directive') {
	              const directiveKind = singleAction.kind;
	              // For side-effect directives, handle appropriately for expression context
	              if (directiveKind === 'show') {
	                const textValue =
	                  typeof value === 'string'
	                    ? value
	                    : isStructuredValue(value)
	                      ? asText(value)
	                      : value === null || value === undefined
	                        ? ''
	                        : String(value);
	                // Tag as side-effect so callers can suppress or echo as needed.
	                value = { __whenEffect: 'show', text: textValue } as any;
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
          if (node.withClause && node.withClause.pipes) {
            value = await applyTailModifiers(value, node.withClause.pipes, executionEnv);
          }

          // Propagate security descriptors from bound value and action result
          // This prevents taint stripping through when-expressions
          const resultDescriptor = preNormDescriptor && boundValueDescriptor
            ? mergeDescriptors(preNormDescriptor, boundValueDescriptor)
            : preNormDescriptor ?? boundValueDescriptor;
          if (resultDescriptor && value !== null && value !== undefined) {
            value = reattachSecurityDescriptor(value, resultDescriptor);
          }

          // Merge variable assignments from this action back into the
          // accumulated environment so subsequent actions can see them.
          // We use mergeChild to merge variables; since actions are evaluated
          // with isExpression=true, no user-facing nodes are produced.
          accumulatedEnv.mergeChild(executionEnv);

          if (value && typeof value === 'object' && '__whileControl' in (value as Record<string, unknown>)) {
            return buildResult(value, accumulatedEnv);
          }

          // Return immediately after the first match
          return buildResult(value, accumulatedEnv);
        } catch (actionError) {
          const conditionText = getConditionPairText(pair, sourceInfo.source)
            ?? getConditionText(pair.condition, sourceInfo.source);
          const conditionLocation = getConditionLocation(pair.condition, sourceInfo.filePath);
          const actionMessage = getErrorMessage(actionError);
          throw new MlldWhenExpressionError(
            `Error evaluating action for condition ${i + 1}${conditionText ? ` (${conditionText})` : ''}: ${actionMessage}`,
            conditionLocation ?? astLocationToSourceLocation(node.location, sourceInfo.filePath),
            {
              conditionIndex: i,
              phase: 'action',
              originalError: actionError as Error,
              conditionText,
              conditionLocation,
              filePath: sourceInfo.filePath,
              sourceContent: sourceInfo.source
            },
            { env }
          );
        }
      }
    } catch (conditionError) {
      if (conditionError instanceof MlldWhenExpressionError && conditionError.details?.phase === 'action') {
        errors.push(conditionError);
        continue;
      }

      // Let the error propagate - it's expected in retry scenarios
      
      // Collect condition errors but continue evaluating
      const conditionText = getConditionText(pair.condition, sourceInfo.source);
      const conditionLocation = getConditionLocation(pair.condition, sourceInfo.filePath);
      const conditionMessage = getErrorMessage(conditionError);
      errors.push(new MlldWhenExpressionError(
        `Error evaluating condition ${i + 1}${conditionText ? ` (${conditionText})` : ''}: ${conditionMessage}`,
        conditionLocation ?? astLocationToSourceLocation(node.location, sourceInfo.filePath),
        {
          conditionIndex: i,
          phase: 'condition',
          originalError: conditionError as Error,
          conditionText,
          conditionLocation,
          filePath: sourceInfo.filePath,
          sourceContent: sourceInfo.source
        },
        { env }
      ));
    }
  }
  
  // Second pass: Evaluate none conditions after scanning non-none conditions
  if (!denyMode) {
    for (let i = 0; i < node.conditions.length; i++) {
      const entry = node.conditions[i];

      // Unwrap array-wrapped entries
      const unwrappedEntry = Array.isArray(entry) && entry.length === 1 ? entry[0] : entry;

      // Skip let and augmented assignments in second pass (already processed)
      if (isLetAssignment(unwrappedEntry) || isAugmentedAssignment(unwrappedEntry)) {
        continue;
      }

      // Skip direct actions in second pass (already processed)
      if (isDirectAction(unwrappedEntry)) {
        continue;
      }

      const pair = unwrappedEntry as WhenConditionPair;

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
        const actionResult = await evaluateActionNodes(pair.action, actionEnv, context);
        if (isExeReturnControl(actionResult.value)) {
          accumulatedEnv.mergeChild(actionResult.env || actionEnv);
          return buildResult(reattachSecurityDescriptor(actionResult.value, boundValueDescriptor), accumulatedEnv);
        }

        let value = actionResult.value;
        // Extract security descriptor before normalizeActionValue strips it
        const nonePreNormDescriptor = extractSecurityDescriptor(value) ?? extractSecurityDescriptor(actionResult.value);
        value = await normalizeActionValue(value, actionEnv);

        // Apply tail modifiers if present
        if (node.withClause && node.withClause.pipes) {
          value = await applyTailModifiers(value, node.withClause.pipes, actionResult.env);
        }

        // Propagate security descriptors from bound value and action result
        const noneResultDescriptor = nonePreNormDescriptor && boundValueDescriptor
          ? mergeDescriptors(nonePreNormDescriptor, boundValueDescriptor)
          : nonePreNormDescriptor ?? boundValueDescriptor;
        if (noneResultDescriptor && value !== null && value !== undefined) {
          value = reattachSecurityDescriptor(value, noneResultDescriptor);
        }

        // Merge variable assignments from this none-action into accumulator
        accumulatedEnv.mergeChild(actionEnv);

        // Return immediately after the first none match
        return buildResult(value, accumulatedEnv);
      } catch (actionError) {
        const conditionText = getConditionText(pair.condition, sourceInfo.source);
        const conditionLocation = getConditionLocation(pair.condition, sourceInfo.filePath);
        const actionMessage = getErrorMessage(actionError);
        throw new MlldWhenExpressionError(
          `Error evaluating none action for condition ${i + 1}${conditionText ? ` (${conditionText})` : ''}: ${actionMessage}`,
          conditionLocation ?? astLocationToSourceLocation(node.location, sourceInfo.filePath),
          {
            conditionIndex: i,
            phase: 'action',
            originalError: actionError as Error,
            conditionText,
            conditionLocation,
            filePath: sourceInfo.filePath,
            sourceContent: sourceInfo.source
          },
          { env }
        );
      }
    }
  }

  
  // If we collected errors and no condition matched, report them
  if (errors.length > 0) {
    const errorSummaries = errors.map((error, index) => {
      const details = error.details;
      const conditionIndex = typeof details?.conditionIndex === 'number' ? details.conditionIndex + 1 : index + 1;
      const conditionText = details?.conditionText ? ` (${details.conditionText})` : '';
      const message = details?.originalError ? getErrorMessage(details.originalError) : error.message;
      const location = details?.conditionLocation;
      const locationText = location
        ? ` at line ${location.line}, column ${location.column}${location.filePath ? ` in ${location.filePath}` : ''}`
        : '';
      return `Condition ${conditionIndex}${conditionText} failed${locationText}: ${message}`;
    });
    const conditionErrors = errorSummaries.join('\n  ');
    throw new MlldWhenExpressionError(
      `When expression evaluation failed with ${errors.length} condition errors`,
      astLocationToSourceLocation(node.location, sourceInfo.filePath),
      {
        errors: errorSummaries,
        conditionErrors,
        filePath: sourceInfo.filePath,
        sourceContent: sourceInfo.source
      },
      { env }
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
    // Skip let assignments and direct actions - they don't produce action types
    if (isLetAssignment(entry) || isAugmentedAssignment(entry) || isDirectAction(entry)) {
      continue;
    }

    // Entry is a condition pair
    const pair = entry as WhenConditionPair;
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
