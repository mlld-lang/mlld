import type { WhenNode, WhenSimpleNode, WhenBlockNode, WhenMatchNode, WhenConditionPair, WhenEntry } from '@core/types/when';
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { Variable } from '@core/types/variable';
import { MlldConditionError } from '@core/errors';
import { isWhenSimpleNode, isWhenBlockNode, isWhenMatchNode, isLetAssignment, isAugmentedAssignment, isConditionPair } from '@core/types/when';
import { VariableImporter } from './import/VariableImporter';
import { evaluate, interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { logger } from '@core/utils/logger';
import {
  isTextLike,
  isArray as isArrayVariable,
  isObject as isObjectVariable,
  isCommandResult,
  isPipelineInput,
  createSimpleTextVariable,
  createObjectVariable
} from '@core/types/variable';
import { isStructuredValue, asData, asText, assertStructuredValue } from '../utils/structured-value';
import type { LetAssignmentNode, AugmentedAssignmentNode } from '@core/types/when';
import { combineValues } from '../utils/value-combine';
import { extractVariableValue } from '../utils/variable-resolution';
import { MlldWhenExpressionError } from '@core/errors';

const DENIED_KEYWORD = 'denied';

async function evaluateAssignmentValue(
  entry: LetAssignmentNode | AugmentedAssignmentNode,
  env: Environment
): Promise<unknown> {
  let value: unknown;
  const tail = (entry as any).withClause;
  let handledByRunEvaluator = false;
  const wrapperType = (entry as any).meta?.wrapperType;
  const firstValue = Array.isArray(entry.value) && entry.value.length > 0 ? entry.value[0] : entry.value;

  if (firstValue && typeof firstValue === 'object' && (firstValue as any).type === 'code') {
    const { evaluateCodeExecution } = await import('./code-execution');
    const result = await evaluateCodeExecution(firstValue as any, env);
    value = result.value;
  }

  if (firstValue && typeof firstValue === 'object' && (firstValue as any).type === 'command') {
    const commandNode: any = firstValue;

    if (tail) {
      const { evaluateRun } = await import('./run');
      const runDirective: any = {
        type: 'Directive',
        nodeId: (entry as any).nodeId ? `${(entry as any).nodeId}-run` : undefined,
        location: entry.location,
        kind: 'run',
        subtype: 'runCommand',
        source: 'command',
        values: {
          command: commandNode.command,
          withClause: tail
        },
        raw: {
          command: Array.isArray(commandNode.command) ? (commandNode.meta?.raw || '') : String(commandNode.command),
          withClause: tail
        },
        meta: {
          isDataValue: true
        }
      };
      const result = await evaluateRun(runDirective, env);
      value = result.value;
      handledByRunEvaluator = true;
    } else {
      if (Array.isArray(commandNode.command)) {
        const interpolatedCommand = await interpolate(
          commandNode.command,
          env,
          InterpolationContext.ShellCommand
        );
        value = await env.executeCommand(interpolatedCommand);
      } else {
        value = await env.executeCommand(commandNode.command);
      }

      const { processCommandOutput } = await import('../utils/json-auto-parser');
      value = processCommandOutput(value);
    }
  }

  if (wrapperType && Array.isArray(entry.value)) {
    if (wrapperType === 'tripleColon') {
      value = entry.value;
    } else if (
      wrapperType === 'backtick' &&
      entry.value.length === 1 &&
      (entry.value[0] as any).type === 'Text'
    ) {
      value = (entry.value[0] as any).content;
    } else {
      value = await interpolate(entry.value, env);
    }
  }

  const isRawPrimitive = firstValue === null ||
    typeof firstValue === 'number' ||
    typeof firstValue === 'boolean' ||
    (typeof firstValue === 'string' && !('type' in (firstValue as any)));

  if (value === undefined) {
    if (isRawPrimitive) {
      value = (entry.value as any[]).length === 1 ? firstValue : entry.value;
    } else {
      const valueResult = await evaluate(entry.value, env);
      value = valueResult.value;
    }
  }

  if (tail && !handledByRunEvaluator) {
    const { processPipeline } = await import('./pipeline/unified-processor');
    value = await processPipeline({
      value,
      env,
      node: entry,
      identifier: entry.identifier,
      location: entry.location
    });
  }

  return value;
}

/**
 * Helper to evaluate a let assignment and return updated environment
 */
export async function evaluateLetAssignment(
  entry: LetAssignmentNode,
  env: Environment
): Promise<Environment> {
  const value = await evaluateAssignmentValue(entry, env);

  const importer = new VariableImporter();
  const variable = importer.createVariableFromValue(
    entry.identifier,
    value,
    'let',
    undefined,
    { env }
  );
  const newEnv = env.createChild();
  newEnv.setVariable(entry.identifier, variable);
  return newEnv;
}

/**
 * Helper to evaluate an augmented assignment and return updated environment
 */
export async function evaluateAugmentedAssignment(
  entry: AugmentedAssignmentNode,
  env: Environment
): Promise<Environment> {
  const isolationRoot = findIsolationRoot(env);
  // Get existing variable - must exist
  const existing = env.getVariable(entry.identifier);
  if (!existing) {
    throw new MlldWhenExpressionError(
      `Cannot use += on undefined variable @${entry.identifier}. ` +
      `Use "let @${entry.identifier} = ..." first.`,
      entry.location
    );
  }

  if (isolationRoot) {
    const owner = findVariableOwner(env, entry.identifier);
    if (!owner || !isDescendantEnvironment(owner, isolationRoot)) {
      throw new MlldWhenExpressionError(
        `Parallel for block cannot mutate outer variable @${entry.identifier}.`,
        entry.location
      );
    }
  }

  // Evaluate the RHS value
  const rhsValue = await evaluateAssignmentValue(entry, env);

  // Get current value of the variable
  const existingValue = await extractVariableValue(existing, env);

  // Combine values using the += semantics
  const combined = combineValues(existingValue, rhsValue, entry.identifier);

  // Update variable in local scope (use updateVariable to bypass redefinition check)
  const importer = new VariableImporter();
  const updatedVar = importer.createVariableFromValue(
    entry.identifier,
    combined,
    'let',
    undefined,
    { env }
  );

  // Update the variable in the owning environment (current scope or ancestor)
  let targetEnv: Environment | undefined = env;
  while (targetEnv && !targetEnv.getCurrentVariables().has(entry.identifier)) {
    targetEnv = targetEnv.getParent();
  }
  (targetEnv ?? env).updateVariable(entry.identifier, updatedVar);
  return env;
}

function findIsolationRoot(env: Environment): Environment | undefined {
  let current: Environment | undefined = env;
  while (current) {
    if ((current as any).__parallelIsolationRoot === current) {
      return current;
    }
    current = current.getParent();
  }
  return undefined;
}

function findVariableOwner(env: Environment, name: string): Environment | undefined {
  let current: Environment | undefined = env;
  while (current) {
    if (current.getCurrentVariables().has(name)) return current;
    current = current.getParent();
  }
  return undefined;
}

function isDescendantEnvironment(env: Environment, ancestor: Environment): boolean {
  let current: Environment | undefined = env;
  while (current) {
    if (current === ancestor) return true;
    current = current.getParent();
  }
  return false;
}

/**
 * Compares two values according to mlld's when comparison rules
 * WHY: mlld has specific comparison semantics that differ from JavaScript's ===.
 * We support string-boolean comparisons ("true" === true), null/undefined equality,
 * and truthy/falsy evaluation when comparing against boolean literals.
 * GOTCHA: String comparison is case-sensitive. "True" !== true, only "true" === true.
 * Type coercion is limited to specific cases to avoid surprising behavior.
 * CONTEXT: Used by all when directive forms (simple, switch, block) to evaluate
 * conditions consistently across the language.
 */
async function compareValues(expressionValue: any, conditionValue: any, env: Environment): Promise<boolean> {
  /**
   * Extract Variable values for equality comparison
   * WHY: Equality operations need raw values because comparisons work on
   *      primitive types, not Variable wrapper objects
   */
  const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  expressionValue = await resolveValue(expressionValue, env, ResolutionContext.Equality);
  conditionValue = await resolveValue(conditionValue, env, ResolutionContext.Equality);
  
  // Both null/undefined
  if ((expressionValue === null || expressionValue === undefined) &&
      (conditionValue === null || conditionValue === undefined)) {
    return true;
  }
  // String comparison - case sensitive
  else if (typeof expressionValue === 'string' && typeof conditionValue === 'string') {
    return expressionValue === conditionValue;
  }
  // Boolean comparison
  else if (typeof expressionValue === 'boolean' && typeof conditionValue === 'boolean') {
    return expressionValue === conditionValue;
  }
  // Number comparison
  else if (typeof expressionValue === 'number' && typeof conditionValue === 'number') {
    return expressionValue === conditionValue;
  }
  // String-boolean comparison: "true"/"false" matches true/false
  else if (typeof expressionValue === 'string' && typeof conditionValue === 'boolean') {
    return (expressionValue === 'true' && conditionValue === true) ||
           (expressionValue === 'false' && conditionValue === false);
  }
  else if (typeof expressionValue === 'boolean' && typeof conditionValue === 'string') {
    return (expressionValue === true && conditionValue === 'true') ||
           (expressionValue === false && conditionValue === 'false');
  }
  // Truthy comparison - if condition is boolean literal
  else if (typeof conditionValue === 'boolean') {
    return isTruthy(expressionValue) === conditionValue;
  }
  // Direct equality for other cases
  else {
    return expressionValue === conditionValue;
  }
}

function preview(value: unknown, max = 60): string {
  try {
    if (typeof value === 'string') return value.length > max ? value.slice(0, max) + '…' : value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return String(value);
    return JSON.stringify(value)?.slice(0, max) + (JSON.stringify(value)?.length! > max ? '…' : '');
  } catch {
    return String(value);
  }
}

/**
 * Evaluates a @when directive.
 * Handles simple, switch, and block forms.
 */
export async function evaluateWhen(
  node: WhenNode,
  env: Environment
): Promise<EvalResult> {
  
  if (isWhenSimpleNode(node)) {
    return evaluateWhenSimple(node, env);
  } else if (isWhenMatchNode(node)) {
    return evaluateWhenMatch(node, env);
  } else if (isWhenBlockNode(node)) {
    return evaluateWhenBlock(node, env);
  }
  
  throw new MlldConditionError(
    `Unknown when node subtype: ${(node as any).subtype}`,
    undefined,
    node.location
  );
}

/**
 * Evaluates a simple when directive: @when <condition> => <action>
 */
async function evaluateWhenSimple(
  node: WhenSimpleNode,
  env: Environment
): Promise<EvalResult> {
  const conditionResult = await evaluateCondition(node.values.condition, env);
  
  if (process.env.DEBUG_WHEN) {
    logger.debug('When condition result:', { conditionResult });
  }
  
  if (conditionResult) {
    // Execute the action if condition is true
    const result = await evaluate(node.values.action, env);
    return result;
  }
  
  // Return empty string if condition is false
  return { value: '', env };
}

/**
 * Evaluates a match when directive: @when <expression>: [value => action, ...]
 * Evaluates the expression once and executes actions for all matching conditions
 */
async function evaluateWhenMatch(
  node: WhenMatchNode,
  env: Environment
): Promise<EvalResult> {
  // Validate none placement
  validateNonePlacement(node.values.conditions);
  
  // Evaluate the expression once without producing output
  // For simple text nodes, extract the value directly
  let expressionValue: any;
  if (node.values.expression.length === 1 && node.values.expression[0].type === 'Text') {
    expressionValue = node.values.expression[0].content;
  } else {
    const expressionResult = await evaluate(node.values.expression, env);
    expressionValue = expressionResult.value;
  }
  
  // Create a child environment for the switch block
  let childEnv = env.createChild();

  // Process let and augmented assignments first to build up the environment
  for (const entry of node.values.conditions) {
    if (isLetAssignment(entry)) {
      childEnv = await evaluateLetAssignment(entry, childEnv);
    } else if (isAugmentedAssignment(entry)) {
      childEnv = await evaluateAugmentedAssignment(entry, childEnv);
    }
  }

  // Filter to only condition pairs for iteration
  const conditionPairs = node.values.conditions.filter(isConditionPair);

  // Track if any non-none condition matched
  let anyNonNoneMatched = false;

  try {
    // First pass: Check each non-none condition value against the expression result
    for (const pair of conditionPairs) {
      // Skip none conditions in first pass
      if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
        continue;
      }
      // Check if this is a negation node
      let isNegated = false;
      let actualCondition = pair.condition;
      
      if (actualCondition.length === 1 && actualCondition[0].type === 'UnaryExpression') {
        const unaryNode = actualCondition[0] as any;
        if (unaryNode.operator === '!') {
          isNegated = true;
          actualCondition = [unaryNode.operand];
        }
      }
      
      // Evaluate the condition value without producing output
      // For simple text nodes, extract the value directly
      let conditionValue: any;
      if (actualCondition.length === 1 && actualCondition[0].type === 'Text') {
        conditionValue = actualCondition[0].content;
      } else if (actualCondition.length === 1 && actualCondition[0].type === 'ExecInvocation') {
        // Handle ExecInvocation as a condition
        const execResult = await evaluateCondition(actualCondition, childEnv);
        // For exec invocations, we want the boolean result
        conditionValue = execResult;
      } else {
        // For more complex conditions, evaluate them
        const conditionResult = await evaluate(actualCondition, childEnv);
        conditionValue = conditionResult.value;
      }
      
      // Compare values using shared logic
      let matches = await compareValues(expressionValue, conditionValue, childEnv);
      
      // Apply negation if needed
      if (isNegated) {
        matches = !matches;
      }
      
      if (matches) {
        anyNonNoneMatched = true;
        if (pair.action) {
          // Handle action which might be an array of nodes
          const actionNodes = Array.isArray(pair.action) ? pair.action : [pair.action];
          for (const actionNode of actionNodes) {
            await evaluate(actionNode, childEnv);
          }
          // Merge child environment nodes back to parent
          env.mergeChild(childEnv);
          // For @when, we don't want to propagate the action's output value to the document
          // The action should have already done what it needs to do (like @output writing to a file)
          return { value: '', env };
        }
      }
    }
    
    // Second pass: Handle none conditions if no non-none conditions matched
    if (!anyNonNoneMatched) {
      for (const pair of conditionPairs) {
        // Only process none conditions in second pass
        if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
          if (pair.action) {
            // Handle action which might be an array of nodes
            const actionNodes = Array.isArray(pair.action) ? pair.action : [pair.action];
            for (const actionNode of actionNodes) {
              await evaluate(actionNode, childEnv);
            }
            // Merge child environment nodes back to parent
            env.mergeChild(childEnv);
            return { value: '', env };
          }
        }
      }
    }
    
    // No match found
    return { value: '', env };
  } finally {
    // Child environment goes out of scope
  }
}

/**
 * Evaluates a block when directive: @when <var> <modifier>: [...]
 * WHY: Block forms enable different conditional evaluation strategies - first match
 * (classic switch), all conditions (AND logic), any condition (OR logic), or
 * independent evaluation of each condition.
 * GOTCHA: Default behavior (no modifier) differs based on presence of block action:
 *   - With action: acts like 'all:' (ALL conditions must match)
 *   - Without action: executes ALL matching individual actions
 * CONTEXT: Child environment ensures variable definitions inside when blocks are
 * scoped locally, preventing pollution of parent scope.
 */
async function evaluateWhenBlock(
  node: WhenBlockNode,
  env: Environment
): Promise<EvalResult> {
  const modifier = node.meta.modifier;

  // For comparison-based modifiers (first, any, all), we need the expression to compare against
  let expressionNodes: BaseMlldNode[] | undefined;

  // Store variable value if specified
  let originalValue: any;
  let variableName: string | undefined;


  if (node.values.variable && node.meta.hasVariable) {
    // The variable nodes contain the expression to evaluate
    expressionNodes = node.values.variable;


    // Extract variable name from the VariableReference node
    if (expressionNodes.length === 1 && expressionNodes[0].type === 'VariableReference') {
      const varRef = expressionNodes[0] as any;
      variableName = varRef.identifier;


      if (variableName) {
        // Store original value to restore later
        originalValue = env.hasVariable(variableName) ? env.getVariable(variableName) : undefined;
      }
    }
  }

  // Create a child environment for the when block
  let childEnv = env.createChild();

  // Process let and augmented assignments first to build up the environment
  for (const entry of node.values.conditions) {
    if (isLetAssignment(entry)) {
      childEnv = await evaluateLetAssignment(entry, childEnv);
    } else if (isAugmentedAssignment(entry)) {
      childEnv = await evaluateAugmentedAssignment(entry, childEnv);
    }
  }

  // Filter to only condition pairs for evaluation
  const conditions = node.values.conditions.filter(isConditionPair);
  
  try {
    let result: EvalResult;
    
    switch (modifier) {
      case 'first':
        result = await evaluateFirstMatch(conditions, childEnv, variableName, expressionNodes);
        break;
        
      case 'all':
        // 'all' modifier has been removed - this should never be reached
        throw new MlldConditionError(
          'The \'all\' modifier has been removed. Use the && operator instead.\n' +
          'Example: /when (@cond1 && @cond2) => action',
          'all',
          node.location
        );

      case 'any':
        // 'any' modifier has been removed - this should never be reached
        throw new MlldConditionError(
          'The \'any\' modifier has been removed. Use the || operator instead.\n' +
          'Example: /when (@cond1 || @cond2) => action',
          'any',
          node.location
        );
        
      case 'default':
        // Bare @when behavior depends on whether there's a block action
        if (node.values.action) {
          // With block action: behave like 'all:' - execute action if ALL conditions are true
          result = await evaluateAllMatches(conditions, childEnv, variableName, node.values.action);
        } else {
          // Without block action: execute all matching individual actions
          result = await evaluateAllMatches(conditions, childEnv, variableName);
        }
        break;
        
      default:
        throw new MlldConditionError(
          `Invalid when modifier: ${modifier}`,
          modifier as 'first' | 'all' | 'any' | 'default',
          node.location
        );
    }
    
    // Merge child environment nodes back to parent
    // This ensures output nodes created by actions are preserved
    if (process.env.DEBUG_WHEN) {
      logger.debug('Before merge:', {
        parentNodes: env.nodes.length,
        childNodes: childEnv.nodes.length,
        childInitialCount: childEnv.initialNodeCount,
        resultEnvNodes: result.env.nodes.length
      });
    }
    
    // The result.env contains the updated environment from the evaluation
    // We need to merge from result.env, not childEnv
    env.mergeChild(result.env);
    
    if (process.env.DEBUG_WHEN) {
      logger.debug('After merge:', {
        parentEnvNodes: env.nodes.length,
        resultValue: result.value
      });
    }
    
    // Return the result with the updated parent environment
    return { value: result.value, env };
  } finally {
    // Child environment goes out of scope
  }
}

/**
 * Evaluates conditions using 'first' modifier - executes first matching condition
 * WHY: Implements classic switch-case behavior where only the first matching branch
 * executes, providing mutual exclusion between conditions.
 * GOTCHA: Conditions are evaluated in order, so put more specific conditions first.
 * Unlike switch statements, there's no fallthrough - only one action executes.
 * CONTEXT: Useful for state machines, routing logic, and mutually exclusive branches.
 */
async function evaluateFirstMatch(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string,
  expressionNodes?: BaseMlldNode[]
): Promise<EvalResult> {
  // Validate none placement
  validateNonePlacement(conditions);
  
  // If we have expression nodes, evaluate them to get the value to compare against
  let expressionValue: any;
  if (expressionNodes && expressionNodes.length > 0) {
    
    if (expressionNodes.length === 1 && expressionNodes[0].type === 'Text') {
      expressionValue = (expressionNodes[0] as any).content;
    } else if (expressionNodes.length === 1 && expressionNodes[0].type === 'VariableReference') {
      // For variable references, get the actual value, not the output
      const varRef = expressionNodes[0] as any;
      const variable = env.getVariable(varRef.identifier);
      if (variable) {
        expressionValue = variable.value;
      }
      
    } else {
      const expressionResult = await evaluate(expressionNodes, env);
      expressionValue = expressionResult.value;
      
    }
  }
  
  // Track if any non-none condition matched
  let anyNonNoneMatched = false;
  
  for (const pair of conditions) {
    // Check if this is a none condition
    if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
      // For 'first' mode, none acts as a default case
      if (!anyNonNoneMatched) {
        // Execute the action for 'none'
        if (pair.action) {
          const actionNodes = Array.isArray(pair.action) ? pair.action : [pair.action];
          for (const actionNode of actionNodes) {
            await evaluate(actionNode, env);
          }
        }
        return { value: '', env };
      }
      continue;
    }
    let matches = false;
    
    if (expressionValue !== undefined) {
      // Compare expression value against condition value (like switch mode)
      let conditionValue: any;
      
      // Check for negation
      let isNegated = false;
      let actualCondition = pair.condition;
      
      if (actualCondition.length === 1 && actualCondition[0].type === 'UnaryExpression') {
        const unaryNode = actualCondition[0] as any;
        if (unaryNode.operator === '!') {
          isNegated = true;
          actualCondition = [unaryNode.operand];
        }
      }
      
      // Evaluate the condition value
      if (actualCondition.length === 1 && actualCondition[0].type === 'Text') {
        conditionValue = (actualCondition[0] as any).content;
      } else if (actualCondition.length === 1 && actualCondition[0].type === 'ExecInvocation') {
        // Handle ExecInvocation as a condition
        const execResult = await evaluateCondition(actualCondition, env);
        // For exec invocations, we want the boolean result
        conditionValue = execResult;
      } else {
        const conditionResult = await evaluate(actualCondition, env);
        conditionValue = conditionResult.value;
      }
      
      // Compare values using shared logic
      matches = await compareValues(expressionValue, conditionValue, env);
      
      
      // Apply negation if needed
      if (isNegated) {
        matches = !matches;
      }
    } else {
      // No expression value, fall back to truthiness evaluation
      matches = await evaluateCondition(pair.condition, env, variableName);
    }
    
    if (matches) {
      anyNonNoneMatched = true;
      if (pair.action) {
        const result = await evaluate(pair.action, env);
        // The action has already added its output nodes during evaluation
        // Just return the result
        return result;
      }
      return { value: '', env };
    }
  }
  
  return { value: '', env };
}

/**
 * Evaluates conditions using 'all' modifier
 * WHY: Supports two distinct use cases - AND logic (with block action) where ALL
 * conditions must be true, or independent evaluation (without block action) where
 * each true condition's action executes.
 * GOTCHA: Behavior changes based on presence of block action:
 *   - With block action: ALL conditions must be true (AND logic)
 *   - Without block action: Each true condition executes independently
 * Cannot mix block action with individual condition actions.
 * CONTEXT: AND logic useful for validation checks, independent evaluation useful
 * for applying multiple transformations or checks.
 */
async function evaluateAllMatches(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string,
  blockAction?: BaseMlldNode[]
): Promise<EvalResult> {
  // Validate none placement
  validateNonePlacement(conditions);
  
  // If we have a block action, check if ALL conditions are true first
  if (blockAction) {
    // Check for invalid syntax: all: with block action cannot have individual actions
    if (conditions.some(pair => pair.action)) {
      throw new MlldConditionError(
        'Invalid @when syntax: \'all:\' modifier cannot have individual actions for conditions when using a block action. Use either individual actions OR a block action after the conditions: @when all: [...] => @add "action"',
        'all',
        undefined
      );
    }
    
    let allMatch = true;
    
    for (const pair of conditions) {
      // Skip none conditions in all: block mode
      if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
        continue;
      }
      
      const conditionResult = await evaluateCondition(pair.condition, env, variableName);
      
      if (!conditionResult) {
        allMatch = false;
        break;
      }
    }
    
    // Execute block action only if all conditions matched
    if (allMatch) {
      if (process.env.DEBUG_WHEN) {
        logger.debug('Executing block action', { envNodesBefore: env.nodes.length });
      }
      const result = await evaluate(blockAction, env);
      if (process.env.DEBUG_WHEN) {
        logger.debug('Block action completed', {
          result,
          envNodesAfter: env.nodes.length
        });
      }
      return result;
    }
    
    return { value: '', env };
  }
  
  // Otherwise, execute individual actions for each true condition
  const results: string[] = [];
  let anyNonNoneMatched = false;
  
  // First pass: evaluate non-none conditions
  for (const pair of conditions) {
    // Skip none conditions in first pass
    if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
      continue;
    }
    
    const conditionResult = await evaluateCondition(pair.condition, env, variableName);
    
    if (conditionResult) {
      anyNonNoneMatched = true;
      if (pair.action) {
        const actionResult = await evaluate(pair.action, env);
        if (actionResult.value) {
          results.push(String(actionResult.value));
        }
      }
    }
  }
  
  // Second pass: evaluate none conditions if no non-none matched
  if (!anyNonNoneMatched) {
    for (const pair of conditions) {
      // Only process none conditions in second pass
      if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
        if (pair.action) {
          const actionResult = await evaluate(pair.action, env);
          if (actionResult.value) {
            results.push(String(actionResult.value));
          }
        }
      }
    }
  }
  
  // Join results with newlines, but only if we have multiple results
  // If single result, don't add trailing newline
  return { value: results.length > 1 ? results.join('\n') : results.join(''), env };
}

/**
 * Evaluates conditions using 'any' modifier - executes action if any condition matches
 * WHY: Implements OR logic where the block action executes if at least one condition
 * is true, useful for triggering actions based on multiple possible triggers.
 * GOTCHA: Requires a block action - individual condition actions are not allowed.
 * All conditions are evaluated (no short-circuit) to ensure consistent behavior.
 * CONTEXT: Useful for validation warnings, fallback logic, or actions that should
 * trigger on any of several conditions.
 */
async function evaluateAnyMatch(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string,
  blockAction?: BaseMlldNode[]
): Promise<EvalResult> {
  // Check for invalid syntax: any: cannot have individual actions
  if (conditions.some(pair => pair.action)) {
    throw new MlldConditionError(
      'Invalid @when syntax: \'any:\' modifier cannot have individual actions for conditions. Use a block action after the conditions instead: @when any: [...] => @add "action"',
      'any',
      undefined
    );
  }
  
  // First check if any condition is true
  let anyMatch = false;
  
  for (const pair of conditions) {
    const conditionResult = await evaluateCondition(pair.condition, env, variableName);
    
    if (conditionResult) {
      anyMatch = true;
      
      // Set variable to the matching condition's value if specified
      if (variableName && pair.condition.length > 0) {
        const conditionResult = await evaluate(pair.condition, env);
        const conditionValue = conditionResult.value;
        
        // Create a variable from the condition value
        const variable = typeof conditionValue === 'string' ?
          createSimpleTextVariable(variableName, conditionValue, {
            mx: {
              source: {
                directive: 'var',
                syntax: 'quoted',
                hasInterpolation: false,
                isMultiLine: false
              }
            }
          }) :
          createObjectVariable(variableName, conditionValue, {
            mx: {
              source: {
                directive: 'var',
                syntax: 'object',
                hasInterpolation: false,
                isMultiLine: false
              }
            }
          });
        env.setVariable(variableName, variable);
      }
      
      break;
    }
  }
  
  // Execute block action if any condition matched
  if (anyMatch && blockAction) {
    return await evaluate(blockAction, env);
  }
  
  return { value: '', env };
}

/**
 * Evaluates a condition expression to a boolean value
 */
export async function evaluateCondition(
  condition: BaseMlldNode[],
  env: Environment,
  variableName?: string
): Promise<boolean> {
  const deniedContext = env.getContextManager().peekDeniedContext();
  const deniedState = Boolean(deniedContext?.denied);

  // Handle new WhenCondition wrapper nodes from unified expressions
  if (condition.length === 1 && condition[0].type === 'WhenCondition') {
    const whenCondition = condition[0] as any;
    const expression = whenCondition.expression;
    
    // Evaluate the wrapped expression
    const result = await evaluateCondition([expression], env, variableName);
    
    // Apply negation if specified in the wrapper
    return whenCondition.negated ? !result : result;
  }
  
  // Check if this is a negation node (UnaryExpression with operator '!')
  if (condition.length === 1 && condition[0].type === 'UnaryExpression') {
    const unaryNode = condition[0] as any;
    if (unaryNode.operator === '!') {
      if (isDeniedLiteralNode(unaryNode.operand)) {
        return !deniedState;
      }
      const innerCondition = [unaryNode.operand];
      
      // Evaluate the inner condition and negate the result
      const innerResult = await evaluateCondition(innerCondition, env, variableName);
      return !innerResult;
    }
  }

  if (condition.length === 1 && isDeniedLiteralNode(condition[0])) {
    return deniedState;
  }
  
  // Check if this is an expression node (BinaryExpression, TernaryExpression, UnaryExpression)
  if (condition.length === 1) {
    const node = condition[0];
    if (node.type === 'BinaryExpression' || node.type === 'TernaryExpression' || node.type === 'UnaryExpression') {
      const { evaluateUnifiedExpression } = await import('./expressions');
      let resultValue: unknown;
      try {
        const expressionResult = await evaluateUnifiedExpression(node as any, env);
        resultValue = expressionResult.value;
      } catch (err) {
        // Add operator and operand previews for helpful diagnostics
        const op = (node as any).operator || (node as any).test?.type || node.type;
        const lhs = (node as any).left ?? (node as any).argument ?? (node as any).test;
        const rhs = (node as any).right ?? (node as any).consequent;
        const message = `Failed to evaluate condition expression (${op}).`;
        throw new MlldConditionError(message, undefined, node.location, {
          originalError: err as Error,
          errors: [
            {
              type: 'expression',
              count: 1,
              firstExample: {
                conditionIndex: 0,
                message: `op=${op}, left=${preview(lhs)}, right=${preview(rhs)}`
              }
            }
          ]
        } as any);
      }
      const truthy = isTruthy(resultValue);
      if (process.env.MLLD_DEBUG === 'true') {
        try {
          console.error('[evaluateCondition] expression node result:', {
            nodeType: node.type,
            result: resultValue,
            truthy
          });
        } catch {}
      }
      return truthy;
    }
  }
  
  // Check if this is an ExecInvocation node
  if (condition.length === 1 && condition[0].type === 'ExecInvocation') {
    const execNode = condition[0] as any;
    
    // Import the exec invocation evaluator
    const { evaluateExecInvocation } = await import('./exec-invocation');
    
    // Create a child environment for execution
    const childEnv = env.createChild();
    
    // If we have a comparison variable, pass it as the first implicit argument
    if (variableName) {
      const variable = env.getVariable(variableName);
      if (variable) {
        // Modify the ExecInvocation to include the comparison value as the first argument
        const modifiedExecNode = {
          ...execNode,
          commandRef: {
            ...execNode.commandRef,
            args: [
              // Insert the variable's value as the first argument
              {
                type: 'VariableReference',
                identifier: variableName,
                nodeId: 'implicit-when-arg',
                valueType: 'variable'
              },
              ...(execNode.commandRef.args || [])
            ]
          }
        };
        
    // Execute the modified invocation
    let result: any;
    try {
      result = await evaluateExecInvocation(modifiedExecNode, childEnv);
    } catch (err) {
      const name = modifiedExecNode?.commandRef?.name || 'exec';
      throw new MlldConditionError(
        `Failed to evaluate function in condition: ${name}`,
        undefined,
        (modifiedExecNode as any).location,
        { originalError: err as Error } as any
      );
    }
        
        // Check the result for truthiness
        if (result.stdout !== undefined) {
          // Command execution result
          if (result.exitCode !== undefined && result.exitCode !== 0) {
            return false;
          }
          if (result.value !== undefined && result.value !== result.stdout) {
            /**
             * Extract Variable value for truthiness evaluation
             * WHY: Truthiness checks need raw values because boolean logic operates on
             *      primitive types, not Variable metadata
             */
            const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
            const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
            return isTruthy(finalValue);
          }
          return isTruthy(result.stdout.trim());
        }
        
        /**
         * Extract Variable value for truthiness evaluation
         * WHY: Truthiness checks need raw values because boolean logic operates on
         *      primitive types, not Variable metadata
         */
        const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
        const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
        return isTruthy(finalValue);
      }
    }
    
    // No comparison variable - just execute the function and check its result
    let result: any;
    try {
      result = await evaluateExecInvocation(execNode, childEnv);
    } catch (err) {
      const name = (execNode as any)?.commandRef?.name || 'exec';
      throw new MlldConditionError(
        `Failed to evaluate function in condition: ${name}`,
        undefined,
        (execNode as any).location,
        { originalError: err as Error } as any
      );
    }
    
    // Check the result for truthiness
    if (result.stdout !== undefined) {
      // Command execution result
      if (result.exitCode !== undefined && result.exitCode !== 0) {
        return false;
      }
      if (result.value !== undefined && result.value !== result.stdout) {
        const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
        const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
        return isTruthy(finalValue);
      }
      return isTruthy(result.stdout.trim());
    }
    
    const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
    const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
    return isTruthy(finalValue);
  }
  
  // Create a child environment for condition evaluation
  const childEnv = env.createChild();
  
  // If a variable name is specified, set it to the condition value for evaluation
  if (variableName) {
    const variable = env.getVariable(variableName);
    if (variable) {
      // Set the _whenValue context for built-in functions
      childEnv.setVariable('_whenValue', variable);
    }
  }
  
  if (process.env.DEBUG_WHEN) {
    logger.debug('Evaluating condition:', { condition });
  }
  
  // Evaluate the condition with condition and expression context
  let result: any;
  try {
    result = await evaluate(condition, childEnv, { isCondition: true, isExpression: true });
  } catch (err) {
    throw new MlldConditionError(
      'Failed to evaluate condition value',
      undefined,
      (condition[0] as any)?.location,
      { originalError: err as Error } as any
    );
  }
  
  if (process.env.DEBUG_WHEN) {
    logger.debug('Condition evaluation result:', { result });
  }
  
  // If we have a variable to compare against
  if (variableName && childEnv.hasVariable('_whenValue')) {
    const whenValue = childEnv.getVariable('_whenValue');
    
    // Check if the condition is an executable (function call)
    if (result.value && typeof result.value === 'object' && result.value.type === 'executable') {
      // The executable should have already been evaluated with _whenValue as context
      // Just check its boolean result
      const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
      const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
      return isTruthy(finalValue);
    }
    
    // Get the actual value from the variable
    let actualValue: any;
    if (whenValue && typeof whenValue === 'object' && 'value' in whenValue) {
      actualValue = whenValue.value;
    } else {
      actualValue = whenValue;
    }
    
    // Compare the variable value with the condition value
    return compareValues(actualValue, result.value, childEnv);
  }
  
  // For command execution results, check stdout or exit code
  if (result.stdout !== undefined) {
    // This is a command execution result
    // First check exit code - 0 is true, non-zero is false
    if (result.exitCode !== undefined && result.exitCode !== 0) {
      return false;
    }
    // If we have a parsed value (from exec functions with return values), use that
    // This handles the case where JSON stringified empty string '""' should be falsy
    if (result.value !== undefined && result.value !== result.stdout) {
      /**
       * Extract Variable value for truthiness evaluation
       * WHY: Truthiness checks need raw values because boolean logic operates on
       *      primitive types, not Variable metadata
       */
      const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
      const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
      return isTruthy(finalValue);
    }
    // Otherwise check stdout - trim whitespace
    const trimmedStdout = result.stdout.trim();
    if (process.env.DEBUG_WHEN) {
      logger.debug('Trimmed stdout for truthiness:', { trimmedStdout });
    }
    return isTruthy(trimmedStdout);
  }
  
  /**
   * Extract Variable value for truthiness evaluation
   * WHY: Truthiness checks need raw values because boolean logic operates on
   *      primitive types, not Variable metadata
   */
  const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
  
  // Convert result to boolean
  return isTruthy(finalValue);
}

function isDeniedLiteralNode(node: BaseMlldNode | undefined): boolean {
  if (!node) {
    return false;
  }
  if (node.type === 'Literal' && typeof (node as any).value === 'string') {
    return (node as any).value.toLowerCase() === DENIED_KEYWORD;
  }
  if (node.type === 'Text' && typeof (node as any).content === 'string') {
    return (node as any).content.trim().toLowerCase() === DENIED_KEYWORD;
  }
  if (
    node.type === 'VariableReference' &&
    typeof (node as any).identifier === 'string' &&
    (node as any).identifier.toLowerCase() === DENIED_KEYWORD
  ) {
    return true;
  }
  return false;
}

function isDeniedField(field: any): boolean {
  if (!field) {
    return false;
  }
  if (typeof field.name === 'string' && field.name.toLowerCase() === DENIED_KEYWORD) {
    return true;
  }
  if (typeof field.identifier === 'string' && field.identifier.toLowerCase() === DENIED_KEYWORD) {
    return true;
  }
  return false;
}

export function conditionTargetsDenied(condition: BaseMlldNode[]): boolean {
  const visited = new Set<BaseMlldNode>();
  const stack = [...condition];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (visited.has(node)) {
      continue;
    }
    visited.add(node);

    if (isDeniedLiteralNode(node)) {
      return true;
    }

    if ((node as any).type === 'VariableReference') {
      const identifier = typeof (node as any).identifier === 'string'
        ? (node as any).identifier.toLowerCase()
        : '';
      if (identifier === DENIED_KEYWORD) {
        return true;
      }
      if (
        identifier === 'mx' &&
        Array.isArray((node as any).fields) &&
        (node as any).fields.some(isDeniedField)
      ) {
        return true;
      }
    }

    for (const value of Object.values(node as any)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            stack.push(item as BaseMlldNode);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        stack.push(value as BaseMlldNode);
      }
    }
  }

  return false;
}

/**
 * Determines if a value is truthy according to mlld rules
 * WHY: mlld has specific truthiness rules that differ from JavaScript. Empty strings,
 * empty arrays, and empty objects are falsy, while non-empty values are truthy.
 * GOTCHA: Unlike JavaScript, empty arrays [] and empty objects {} are falsy in mlld.
 * The string "false" is truthy (non-empty string), only the boolean false is falsy.
 * CONTEXT: Used in when conditions to determine if branches should execute, especially
 * important for the simple form: /when @var => /action (executes if @var is truthy).
 */
function isTruthy(value: any): boolean {
  // Handle Variable types
  if (value && typeof value === 'object' && 'type' in value && 'name' in value) {
    const variable = value as Variable;
    
    // Type-specific truthiness for Variables
    if (isTextLike(variable)) {
      // Check for mlld falsy string values
      const str = variable.value;
      if (str === '' || str.toLowerCase() === 'false' || str === '0') {
        return false;
      }
      return true;
    } else if (isArrayVariable(variable)) {
      return variable.value.length > 0;
    } else if (isObjectVariable(variable)) {
      return Object.keys(variable.value).length > 0;
    } else if (isCommandResult(variable)) {
      // Command results are truthy if they have output
      return variable.value.trim().length > 0;
    } else if (isPipelineInput(variable)) {
      assertStructuredValue(variable.value, 'when:isTruthy:pipeline-input');
      return asText(variable.value).length > 0;
    }
    
    // For other variable types, use their value
    return isTruthy(variable.value);
  }
  
  if (isStructuredValue(value)) {
    try {
      const structuredData = asData(value);
      return isTruthy(structuredData);
    } catch {
      return isTruthy(asText(value));
    }
  }
  
  // Handle null/undefined
  if (value === null || value === undefined) {
    return false;
  }
  
  // Handle booleans
  if (typeof value === 'boolean') {
    return value;
  }
  
  // Handle strings
  if (typeof value === 'string') {
    // Empty string is false
    if (value === '') {
      return false;
    }
    
    // String "false" is false (case insensitive)
    if (value.toLowerCase() === 'false') {
      return false;
    }
    
    // String "0" is false
    if (value === '0') {
      return false;
    }
    
    // All other strings are true
    return true;
  }
  
  // Handle numbers
  if (typeof value === 'number') {
    // 0 and NaN are false
    return value !== 0 && !isNaN(value);
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    // Empty array is false
    return value.length > 0;
  }
  
  // Handle objects
  if (typeof value === 'object') {
    // Empty object is false
    return Object.keys(value).length > 0;
  }
  
  // Default to true for other types
  return true;
}

/**
 * Check if a condition is the 'none' literal
 */
function isNoneCondition(condition: any): boolean {
  return condition?.type === 'Literal' && condition?.valueType === 'none';
}

/**
 * Validate that 'none' conditions are placed correctly in a when block
 */
function validateNonePlacement(conditions: any[]): void {
  let foundNone = false;
  let foundWildcard = false;
  
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i].condition || conditions[i];
    
    if (isNoneCondition(condition)) {
      foundNone = true;
    } else if (condition?.type === 'Literal' && condition?.valueType === 'wildcard') {
      foundWildcard = true;
      if (foundNone) {
        // * after none is technically valid but makes none unreachable
        continue;
      }
    } else if (foundNone) {
      throw new Error(
        'The "none" keyword can only appear as the last condition(s) in a when block'
      );
    }
    
    if (foundWildcard && isNoneCondition(condition)) {
      throw new Error(
        'The "none" keyword cannot appear after "*" (wildcard) as it would never be reached'
      );
    }
  }
}
