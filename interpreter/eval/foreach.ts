import type { Environment } from '../env/Environment';
import { isExecutable } from '@core/types/variable';
import { logger } from '@core/utils/logger';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';

function hasArrayData(value: unknown): value is { data: unknown[] } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (!('data' in value)) {
    return false;
  }
  const { data } = value as { data?: unknown };
  return Array.isArray(data);
}

/**
 * Evaluate a foreach command expression by applying an executable to arrays of values.
 * Uses the standard evaluateExecInvocation() for consistent parameter handling.
 * 
 * @param foreachExpr - The foreach command expression to evaluate
 * @param env - The evaluation environment
 * @returns Array of results from command execution
 */
export async function evaluateForeachCommand(
  foreachExpr: any,
  env: Environment
): Promise<any> {
  // Debug logging
  if (process.env.MLLD_DEBUG === 'true') {
    logger.debug('evaluateForeachCommand called with:', { foreachExpr });
  }
  
  const node = (foreachExpr && typeof foreachExpr === 'object' && 'value' in foreachExpr)
    ? (foreachExpr as any).value
    : foreachExpr;
  const { execInvocation, arrays } = node;
  
  // Extract command name and arguments from execInvocation
  let commandName: string;
  let commandArgs: any[] = [];
  
  if (execInvocation.type === 'ExecInvocation') {
    // Handle @func(args) exec invocation
    commandName = execInvocation.commandRef.name;
    commandArgs = execInvocation.commandRef.args || [];
  } else if (execInvocation.identifier) {
    // Handle @var variable reference (legacy support)
    commandName = execInvocation.identifier;
  } else {
    throw new Error('Invalid foreach command structure');
  }
  
  // 1. Resolve the command variable
  const cmdVariable = env.getVariable(commandName);
  if (!cmdVariable) {
    throw new Error(`Command not found: ${commandName}`);
  }
  
  if (!isExecutable(cmdVariable)) {
    throw new Error(`Variable '${commandName}' cannot be used with foreach. Expected an @exec command or @text template with parameters, but got type: ${cmdVariable.type}`);
  }
  
  // 2. Evaluate all array arguments (use arrays property from AST)
  const { evaluateDataValue } = await import('./data-value-evaluator');
  const evaluatedArrays: any[][] = [];
  
  // Use the arrays property from the foreach AST node
  const arrayNodes = arrays || commandArgs;
  
  for (let i = 0; i < arrayNodes.length; i++) {
    const arrayVar = arrayNodes[i];
    const arrayValue = await evaluateDataValue(arrayVar, env);
    if (isStructuredValue(arrayValue)) {
      let structuredData = asData(arrayValue) as unknown;

      if (!Array.isArray(structuredData)) {
        // Some structured wrappers store nested structured data (e.g., PipelineInput)
        if (hasArrayData(structuredData)) {
          structuredData = structuredData.data;
        } else if (typeof structuredData === 'string') {
          try {
            const parsed = JSON.parse(structuredData);
            if (Array.isArray(parsed)) {
              structuredData = parsed;
            }
          } catch {
            // Ignore parse failure; we'll try text fallback next
          }
        }
      }

      if (!Array.isArray(structuredData) && typeof arrayValue.text === 'string') {
        try {
          const parsed = JSON.parse(arrayValue.text);
          if (Array.isArray(parsed)) {
            structuredData = parsed;
          }
        } catch {
          // Ignore parse failure and fall through to error
        }
      }

      if (!Array.isArray(structuredData)) {
        throw new Error(`Argument ${i + 1} to foreach must be an array, got structured ${arrayValue.type}`);
      }

      evaluatedArrays.push(structuredData);
      continue;
    }
    
    if (!Array.isArray(arrayValue)) {
      throw new Error(`Argument ${i + 1} to foreach must be an array, got ${typeof arrayValue}`);
    }
    
    evaluatedArrays.push(arrayValue);
  }
  
  // 3. Validate array inputs and performance limits
  validateArrayInputs(evaluatedArrays);
  
  if (!isWithinPerformanceLimit(evaluatedArrays)) {
    const totalCombinations = evaluatedArrays.reduce((total, arr) => total * arr.length, 1);
    throw new Error(`Foreach operation would generate ${totalCombinations} combinations, which exceeds the performance limit. Consider reducing array sizes or using more specific filtering.`);
  }
  
  // 4. Check parameter count matches array count
  const definition = cmdVariable.value;
  const paramCount = cmdVariable.paramNames?.length || definition.paramNames?.length || 0;
  if (evaluatedArrays.length !== paramCount) {
    const paramType = definition.sourceDirective === 'text' ? 'Text template' : 'Command';
    throw new Error(`${paramType} '${commandName}' expects ${paramCount} parameter${paramCount !== 1 ? 's' : ''}, but foreach is passing ${evaluatedArrays.length} array${evaluatedArrays.length !== 1 ? 's' : ''}`);
  }
  
  // 5. Generate cartesian product
  const tuples = cartesianProduct(evaluatedArrays);
  
  // 6. Execute command for each tuple using standard exec invocation
  const { evaluateExecInvocation } = await import('./exec-invocation');
  const results: any[] = [];
  
  for (let i = 0; i < tuples.length; i++) {
    const tuple = tuples[i];

    try {
      // Create an ExecInvocation node with the current tuple values as arguments
      const execInvocationNode = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: commandName,
          args: tuple // Use tuple values directly as arguments
        },
        withClause: null
      };
      
      // Use the standard exec invocation evaluator
      const result = await evaluateExecInvocation(execInvocationNode as any, env);
      results.push(result.value);
    } catch (error) {
      // Include iteration context in error message
      const params = cmdVariable.paramNames || definition.paramNames || [];
      const iterationContext = params.map((param: string, index: number) => 
        `${param}: ${JSON.stringify(tuple[index])}`
      ).join(', ');
      
      throw new Error(
        `Error in foreach iteration ${i + 1} (${iterationContext}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  let finalResults: unknown = results;

  const withClause = node.with || foreachExpr.with;
  const batchPipelineConfig =
    node.batchPipeline ||
    withClause?.batchPipeline ||
    foreachExpr.batchPipeline;

  const batchStages = Array.isArray(batchPipelineConfig)
    ? batchPipelineConfig
    : batchPipelineConfig?.pipeline;

  if (batchStages && batchStages.length > 0) {
    const { processPipeline } = await import('./pipeline/unified-processor');
    const { createArrayVariable } = await import('@core/types/variable');

    const batchInput = createArrayVariable(
      'foreach-batch-input',
      results,
      false,
      {
        directive: 'foreach',
        syntax: 'expression',
        hasInterpolation: false,
        isMultiLine: false
      },
      { isBatchInput: true }
    );

    try {
      const pipelineResult = await processPipeline({
        value: batchInput,
        env,
        pipeline: batchStages,
        identifier: `foreach-batch-${commandName}`,
        location: foreachExpr.location,
        isRetryable: false
      });

      const { isVariable, extractVariableValue } = await import('../utils/variable-resolution');

      if (isStructuredValue(pipelineResult)) {
        finalResults = pipelineResult;
      } else if (isVariable(pipelineResult)) {
        finalResults = await extractVariableValue(pipelineResult, env);
      } else {
        finalResults = pipelineResult;
      }
    } catch (error) {
      logger.warn(
        `Batch pipeline failed for foreach: ${error instanceof Error ? error.message : String(error)}`
      );
      finalResults = results;
    }
  }

  return finalResults;
}

/**
 * Evaluate a foreach section expression.
 */
export async function evaluateForeachSection(
  foreachExpr: any,
  env: Environment
): Promise<any> {
  // Implementation for section-based foreach
  // This would handle cases like: foreach "section" from [path](@array)
  // For now, delegate to command-based foreach
  return evaluateForeachCommand(foreachExpr, env);
}

/**
 * Validate foreach expression structure and arguments.
 */
export async function validateForeachExpression(
  foreachExpr: any,
  env: Environment
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    // Basic structure validation
    if (!foreachExpr || typeof foreachExpr !== 'object') {
      errors.push('Foreach expression must be an object');
      return { valid: false, errors };
    }
    
    const { execInvocation } = foreachExpr.value || foreachExpr;
    if (!execInvocation) {
      errors.push('Foreach expression missing exec invocation');
      return { valid: false, errors };
    }
    
    // Command validation
    let commandName: string;
    if (execInvocation.type === 'ExecInvocation') {
      commandName = execInvocation.commandRef.name;
    } else if (execInvocation.identifier) {
      commandName = execInvocation.identifier;
    } else {
      errors.push('Invalid foreach command structure');
      return { valid: false, errors };
    }
    
    const cmdVariable = env.getVariable(commandName);
    if (!cmdVariable) {
      errors.push(`Command not found: ${commandName}`);
    } else if (!isExecutable(cmdVariable)) {
      errors.push(`Variable '${commandName}' is not executable`);
    }
    
    return { valid: errors.length === 0, errors };
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    return { valid: false, errors };
  }
}

// Helper functions

function validateArrayInputs(arrays: any[][]): void {
  if (arrays.length === 0) {
    throw new Error('Foreach requires at least one array argument');
  }
  
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i];
    if (!Array.isArray(arr)) {
      throw new Error(`Argument ${i + 1} must be an array`);
    }
    if (arr.length === 0) {
      throw new Error(`Array ${i + 1} cannot be empty`);
    }
  }
}

function isWithinPerformanceLimit(arrays: any[][]): boolean {
  const MAX_COMBINATIONS = 10000; // Configurable limit
  const totalCombinations = arrays.reduce((total, arr) => total * arr.length, 1);
  return totalCombinations <= MAX_COMBINATIONS;
}

function cartesianProduct(arrays: any[][]): any[][] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return arrays[0].map(item => [item]);
  
  const result: any[][] = [];
  const [head, ...tail] = arrays;
  const tailProduct = cartesianProduct(tail);
  
  for (const headItem of head) {
    for (const tailItem of tailProduct) {
      result.push([headItem, ...tailItem]);
    }
  }
  
  return result;
}
