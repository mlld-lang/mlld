import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';
import { isExecutable } from '@core/types/variable';
import { interpolate } from '../../core/interpreter';
import { 
  cartesianProduct, 
  validateArrayInputs, 
  isWithinPerformanceLimit 
} from '../../utils/cartesian-product';
import { logger } from '@core/utils/logger';

/**
 * Handles evaluation of foreach command expressions.
 * 
 * This evaluator processes foreach commands that iterate over arrays using
 * cartesian product iteration with parameterized command execution.
 * 
 * Features:
 * - Cartesian product iteration over multiple arrays
 * - Parameter binding and child environment management
 * - Command invocation with template, command, and code executables
 * - Performance limit validation and error context preservation
 */
export class ForeachCommandEvaluator {
  constructor(private evaluateDataValue: (value: DataValue, env: Environment) => Promise<any>) {}

  /**
   * Checks if this evaluator can handle the given data value
   */
  canHandle(value: DataValue): boolean {
    // Handle foreach command expressions
    if (typeof value === 'object' && value !== null && value.type === 'foreach') {
      return true;
    }
    
    // Handle objects with type 'foreach-command' (from grammar output)
    if (value && typeof value === 'object' && value.type === 'foreach-command') {
      return true;
    }
    
    return false;
  }

  /**
   * Evaluates a foreach command expression by iterating over arrays with a parameterized command
   */
  async evaluate(value: DataValue, env: Environment): Promise<any> {
    if (this.canHandle(value)) {
      return await this.evaluateForeachCommand(value, env);
    }
    
    throw new Error(`ForeachCommandEvaluator cannot handle value type: ${typeof value}`);
  }

  /**
   * Evaluates a foreach command expression by iterating over arrays with a parameterized command.
   * 
   * @param foreachExpr - The foreach command expression to evaluate
   * @param env - The evaluation environment
   * @returns Array of results from command execution
   */
  async evaluateForeachCommand(
    foreachExpr: any, // Use any for now since the grammar output structure might not match exactly
    env: Environment
  ): Promise<any[]> {
    const { execInvocation } = foreachExpr.value || foreachExpr;
    
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
    
    // 2. Evaluate all array arguments from the exec invocation
    const evaluatedArrays: any[][] = [];
    for (let i = 0; i < commandArgs.length; i++) {
      const arrayVar = commandArgs[i];
      const arrayValue = await this.evaluateDataValue(arrayVar, env);
      
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
    // For ExecutableVariable, paramNames is on the variable itself, not in value
    const paramCount = cmdVariable.paramNames?.length || definition.paramNames?.length || 0;
    if (evaluatedArrays.length !== paramCount) {
      const paramType = definition.sourceDirective === 'text' ? 'Text template' : 'Command';
      throw new Error(`${paramType} '${commandName}' expects ${paramCount} parameter${paramCount !== 1 ? 's' : ''}, but foreach is passing ${evaluatedArrays.length} array${evaluatedArrays.length !== 1 ? 's' : ''}`);
    }
    
    // 5. Generate cartesian product
    const tuples = cartesianProduct(evaluatedArrays);
    
    // 6. Execute command for each tuple
    const results: any[] = [];
    for (let i = 0; i < tuples.length; i++) {
      const tuple = tuples[i];
      
      try {
        // Create argument map for parameter substitution
        const argMap: Record<string, any> = {};
        // For ExecutableVariable, paramNames is on the variable itself
        const params = cmdVariable.paramNames || definition.paramNames || [];
        params.forEach((param: string, index: number) => {
          argMap[param] = tuple[index];
        });
        
        // Invoke the parameterized command with arguments
        const result = await this.invokeParameterizedCommand(cmdVariable, argMap, env);
        results.push(result);
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
    
    return results;
  }

  /**
   * Validates a foreach expression without executing it.
   * This is called during data directive evaluation to provide early error feedback.
   * 
   * @param foreachExpr - The foreach expression to validate
   * @param env - The evaluation environment
   * @throws Error if validation fails
   */
  async validateForeachExpression(
    foreachExpr: any,
    env: Environment
  ): Promise<void> {
    const { command, arrays } = foreachExpr.value || foreachExpr;
    
    // 1. Check if command exists
    const cmdVariable = env.getVariable(command.identifier);
    if (!cmdVariable) {
      throw new Error(`Command not found: ${command.identifier}`);
    }
    
    if (!isExecutable(cmdVariable)) {
      throw new Error(`Variable '${command.identifier}' cannot be used with foreach. Expected an @exec command or @text template with parameters, but got type: ${cmdVariable.type}`);
    }
    
    // 2. Validate array count matches parameter count
    const definition = cmdVariable.value;
    const paramCount = definition.paramNames?.length || 0;
    if (arrays.length !== paramCount) {
      const paramType = definition.sourceDirective === 'text' ? 'Text template' : 'Command';
      throw new Error(`${paramType} '${command.identifier}' expects ${paramCount} parameter${paramCount !== 1 ? 's' : ''}, but foreach is passing ${arrays.length} array${arrays.length !== 1 ? 's' : ''}`);
    }
    
    // Note: We don't evaluate the arrays here as they might contain variables
    // that aren't defined yet. Full validation happens during lazy evaluation.
  }

  /**
   * Invokes a parameterized command (exec or text template) with given arguments.
   * 
   * @param cmdVariable - The command variable to invoke
   * @param argMap - Map of parameter names to argument values  
   * @param env - The evaluation environment
   * @returns The result of command execution
   */
  private async invokeParameterizedCommand(
    cmdVariable: any,
    argMap: Record<string, any>,
    env: Environment
  ): Promise<any> {
    // Create a child environment with parameter bindings
    const childEnv = env.createChild();
    
    // Import variable creation functions
    const { createSimpleTextVariable, createObjectVariable, createArrayVariable } = await import('@core/types/variable');
    const { VariableSource } = await import('@core/types/variable');
    
    // Create default source for parameter variables
    const paramSource: VariableSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    
    // Bind arguments to parameter names
    for (const [paramName, paramValue] of Object.entries(argMap)) {
      // Create appropriate variable type based on the parameter value
      if (typeof paramValue === 'string') {
        const variable = createSimpleTextVariable(paramName, paramValue, paramSource, { isParameter: true });
        childEnv.setParameterVariable(paramName, variable);
      } else if (Array.isArray(paramValue)) {
        const variable = createArrayVariable(paramName, paramValue, false, paramSource, { isParameter: true });
        childEnv.setParameterVariable(paramName, variable);
      } else if (typeof paramValue === 'object' && paramValue !== null) {
        const variable = createObjectVariable(paramName, paramValue, false, paramSource, { isParameter: true });
        childEnv.setParameterVariable(paramName, variable);
      } else {
        // For numbers, booleans, etc., convert to text
        const variable = createSimpleTextVariable(paramName, String(paramValue), paramSource, { isParameter: true });
        childEnv.setParameterVariable(paramName, variable);
      }
    }
    
    const definition = cmdVariable.value;
    
    // Handle template executables
    if (definition.type === 'template') {
      // Execute text template with bound parameters
      const text = await interpolate(definition.template, childEnv);
      return text;
    } else if (definition.type === 'command') {
      // Execute command template with bound parameters
      if (!definition.template) {
        throw new Error(`Command executable has no template`);
      }
      const command = await interpolate(definition.template, childEnv);
      return await childEnv.executeCommand(command);
    } else if (definition.type === 'code') {
      // Execute code template with bound parameters
      if (!definition.template) {
        throw new Error(`Code executable has no template`);
      }
      
      const code = await interpolate(definition.template, childEnv);
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Foreach code execution:', {
          code,
          language: definition.language,
          argMap
        });
      }
      
      // Pass argMap as parameters for bash/shell to convert to environment variables
      const codeResult = await childEnv.executeCode(code, definition.language, argMap);
      
      // If the result looks like JSON (from return statement), parse it
      if (typeof codeResult === 'string' && 
          (codeResult.startsWith('"') || codeResult.startsWith('{') || codeResult.startsWith('[') || 
           codeResult === 'null' || codeResult === 'true' || codeResult === 'false' ||
           /^-?\d+(\.\d+)?$/.test(codeResult.trim()))) {
        try {
          const parsed = JSON.parse(codeResult);
          // Return the parsed value directly for data context
          return parsed;
        } catch {
          // Not valid JSON, use as-is
          return codeResult;
        }
      }
      if (typeof codeResult === 'string') {
        const trimmed = codeResult.trim();
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
          const numeric = Number(trimmed);
          if (!Number.isNaN(numeric)) {
            return numeric;
          }
        }
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        if (trimmed === 'null') return null;
      }
      
      return codeResult;
    } else if (definition.type === 'commandRef') {
      // TODO: Handle command references - for now throw error
      throw new Error(`Command reference execution in foreach not yet implemented`);
    } else {
      throw new Error(`Unsupported executable type: ${definition.type}`);
    }
  }
}
