import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';
import { isVariableReferenceValue, isTemplateValue } from '@core/types/var';
import { 
  isExecutable,
  isArray,
  isObject,
  isTextLike,
  isPath,
  isImported,
  isStructuredValueVariable,
  Variable
} from '@core/types/variable';
import { interpolate } from '../../core/interpreter';
import { accessField, accessFields } from '../../utils/field-access';
import { logger } from '@core/utils/logger';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { SecurityDescriptor } from '@core/types/security';
import { InterpolationContext } from '../../core/interpolation-context';

async function interpolateAndRecord(
  nodes: any,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
}

/**
 * Handles evaluation of variable references and related operations.
 * 
 * This evaluator processes:
 * - Raw VariableReference nodes (not wrapped in array)
 * - VariableReferenceWithTail (with pipelines and modifiers)
 * - Variable references with field access
 * - Template interpolation
 * - ExecInvocation nodes with pipeline support
 */
export class VariableReferenceEvaluator {
  constructor(private evaluateDataValue: (value: DataValue, env: Environment) => Promise<any>) {}

  /**
   * Checks if this evaluator can handle the given data value
   */
  canHandle(value: DataValue): boolean {
    // Handle raw VariableReference nodes
    if (value && typeof value === 'object' && value.type === 'VariableReference') {
      return true;
    }
    
    // Handle variable references with tail modifiers
    if (value && typeof value === 'object' && value.type === 'VariableReferenceWithTail') {
      return true;
    }
    
    // Handle standard variable references with field access
    if (isVariableReferenceValue(value)) {
      return true;
    }
    
    // Handle template interpolation
    if (isTemplateValue(value)) {
      return true;
    }
    
    // Handle ExecInvocation nodes
    if (value && typeof value === 'object' && value.type === 'ExecInvocation') {
      return true;
    }
    
    // Handle runExec nodes (run @command() in object context)
    if (value && typeof value === 'object' && value.type === 'runExec' && 'invocation' in value) {
      return true;
    }
    
    // Handle path nodes (from [/path/to/file])
    if (value && typeof value === 'object' && value.type === 'path') {
      return true;
    }
    
    // Handle content arrays (like template content)
    if (value && typeof value === 'object' && value.content && Array.isArray(value.content)) {
      return true;
    }
    
    // Handle executable code objects (from imported executable variables)
    if (value && typeof value === 'object' && 
        (value.type === 'code' || value.type === 'command') && 
        ('template' in value || 'codeTemplate' in value || 'commandTemplate' in value)) {
      return true;
    }
    
    return false;
  }

  /**
   * Evaluates variable references and related operations
   */
  async evaluate(value: DataValue, env: Environment): Promise<any> {
    // Handle raw VariableReference nodes (not wrapped in array)
    if (value && typeof value === 'object' && value.type === 'VariableReference') {
      return await this.evaluateRawVariableReference(value, env);
    }
    
    // Handle variable references with tail modifiers (pipelines, etc.)
    if (value && typeof value === 'object' && value.type === 'VariableReferenceWithTail') {
      return await this.evaluateVariableReferenceWithTail(value, env);
    }
    
    // Handle variable references (with potential field access)
    if (isVariableReferenceValue(value)) {
      return await this.evaluateVariableReference(value, env);
    }
    
    // Handle template interpolation
    if (isTemplateValue(value)) {
      return await interpolateAndRecord(value, env);
    }
    
    // Handle ExecInvocation nodes
    if (value && typeof value === 'object' && value.type === 'ExecInvocation') {
      return await this.evaluateExecInvocation(value, env);
    }
    
    // Handle runExec nodes (run @command() in object context)
    if (value && typeof value === 'object' && value.type === 'runExec' && 'invocation' in value) {
      return await this.evaluateRunExec(value, env);
    }
    
    // Handle path nodes (from [/path/to/file])
    if (value && typeof value === 'object' && value.type === 'path') {
      return await this.evaluatePathNode(value, env);
    }
    
    // Handle content arrays (like template content)
    if (value && typeof value === 'object' && value.content && Array.isArray(value.content)) {
      return await interpolateAndRecord(value.content, env);
    }
    
    // Handle executable code objects (from imported executable variables)
    if (value && typeof value === 'object' && 
        (value.type === 'code' || value.type === 'command') && 
        ('template' in value || 'codeTemplate' in value || 'commandTemplate' in value)) {
      // This is an executable variable definition - return it as-is
      // It will be handled by the execution system when invoked
      return value;
    }
    
    throw new Error(`VariableReferenceEvaluator cannot handle value type: ${typeof value}`);
  }

  /**
   * Evaluates a raw VariableReference node
   */
  private async evaluateRawVariableReference(value: any, env: Environment): Promise<any> {
    const variable = env.getVariable(value.identifier);
    if (!variable) {
      throw new Error(`Variable not found: ${value.identifier}`);
    }
    
    // For executable variables, return the variable itself (for lazy execution)
    if (isExecutable(variable)) {
      return variable;
    }
    
    const hasFieldAccess = Array.isArray(value.fields) && value.fields.length > 0;
    let result: any;
    if (hasFieldAccess) {
      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      result = await resolveVariable(variable, env, ResolutionContext.FieldAccess);
    } else {
      // Extract the actual value
      result = await this.extractVariableValue(variable, env);
    }
    this.attachProvenance(result, variable as Variable);
    
    // Apply field access if present
    if (hasFieldAccess) {
      // Apply each field access in sequence
      for (const field of value.fields) {
        // Handle variableIndex type - need to resolve the variable first
        if (field.type === 'variableIndex') {
          const { evaluateDataValue } = await import('../data-value-evaluator');
          const indexNode =
            typeof field.value === 'object'
              ? (field.value as any)
              : {
                  type: 'VariableReference',
                  valueType: 'varIdentifier',
                  identifier: String(field.value)
                };
          const indexValue = await evaluateDataValue(indexNode as any, env);
          // Create a new field with the resolved value
          const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
          const fieldResult = await accessField(result, resolvedField, { 
            preserveContext: true,
            env,
            sourceLocation: (value as any)?.location 
          });
          result = (fieldResult as any).value;
        } else {
          const fieldResult = await accessField(result, field, { 
            preserveContext: true,
            env,
            sourceLocation: (value as any)?.location 
          });
          result = (fieldResult as any).value;

          // Resolve nested variable references returned from AST objects
          if (
            result &&
            typeof result === 'object' &&
            result.type === 'VariableReference' &&
            'identifier' in result
          ) {
            const nestedVar = env.getVariable((result as any).identifier);
            if (!nestedVar) {
              throw new Error(`Variable not found: ${(result as any).identifier}`);
            }
            const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
            result = await resolveVariable(nestedVar, env, ResolutionContext.FieldAccess);
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Evaluates a VariableReferenceWithTail (with pipelines and modifiers)
   */
  private async evaluateVariableReferenceWithTail(value: any, env: Environment): Promise<any> {
    // First resolve the variable value
    const varRef = value.variable;
    const variable = env.getVariable(varRef.identifier);
    if (!variable) {
      throw new Error(`Variable not found: ${varRef.identifier}`);
    }
    
    // Get the base value using new type guards
    let result: any;
    if (isTextLike(variable)) {
      // All text-producing types
      result = variable.value;
    } else if (isPath(variable)) {
      result = variable.value.resolvedPath;
    } else if (isExecutable(variable)) {
      // If we have a pipeline, we need to execute the variable to get its value
      if (value.withClause && value.withClause.pipeline) {
        // Execute the function to get its result
        const { evaluateExecInvocation } = await import('../exec-invocation');
        result = await evaluateExecInvocation({
          type: 'ExecInvocation',
          identifier: varRef.identifier,
          args: [],
          withClause: null
        } as any, env);
      } else {
        // For non-pipeline cases, return the variable for lazy evaluation
        result = variable;
      }
    } else if (isImported(variable)) {
      // Preserve imported Variables to maintain type information
      result = variable;
    } else if (isObject(variable) || isArray(variable)) {
      // Handle structured data - preserve Variables in data structures
      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      result = await resolveVariable(variable, env, ResolutionContext.DataStructure);
    } else {
      // Fallback for any other types - preserve Variables
      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      result = await resolveVariable(variable, env, ResolutionContext.DataStructure);
    }
    
    // Apply field access if present
    this.attachProvenance(result, variable as Variable);

    if (varRef.fields && varRef.fields.length > 0) {
      // DEBUG: Log what we're about to access  
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('🔍 BEFORE FIELD ACCESS (VariableReferenceWithTail):', {
          variableIdentifier: varRef.identifier,
          fields: varRef.fields,
          resultType: typeof result,
          resultKeys: typeof result === 'object' && result !== null ? Object.keys(result) : 'N/A',
          resultValue: result
        });
      }
      
      const { accessFields } = await import('../../utils/field-access');
      const fieldResult = await accessFields(result, varRef.fields, { 
        preserveContext: true,
        env 
      });
      result = fieldResult.value;
    }
    
    // Apply pipeline if present
    if (value.withClause && value.withClause.pipeline) {
      // Use unified pipeline processor
      const { processPipeline } = await import('../../eval/pipeline/unified-processor');
      result = await processPipeline({
        value: result,
        env,
        node: value,
        identifier: varRef.identifier,
        descriptorHint: variable.mx ? varMxToSecurityDescriptor(variable.mx) : undefined
      });
    }
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('VariableReferenceWithTail final result:', {
        variableIdentifier: varRef.identifier,
        resultValue: result,
        resultType: typeof result,
        resultIsNull: result === null,
        resultIsUndefined: result === undefined
      });
    }
    
    return result;
  }

  /**
   * Evaluates a standard variable reference with potential field access
   */
  private async evaluateVariableReference(value: any, env: Environment): Promise<any> {
    const variable = env.getVariable(value.identifier);
    if (!variable) {
      throw new Error(`Variable not found: ${value.identifier}`);
    }
    
    // For executable variables, return the variable itself (for lazy execution)
    // This preserves the executable for later execution rather than executing it now
    if (isExecutable(variable)) {
      return variable;
    }
    
    const hasFieldAccess = Array.isArray(value.fields) && value.fields.length > 0;
    let result: any;
    if (hasFieldAccess) {
      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      result = await resolveVariable(variable, env, ResolutionContext.FieldAccess);
    } else {
      // Extract value using new type guards
      result = await this.extractVariableValue(variable, env);
    }
    this.attachProvenance(result, variable);
    
    // DEBUG: Log what we extracted
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('🔍 EXTRACTED VARIABLE VALUE:', {
        variableIdentifier: value.identifier,
        variableType: variable.type,
        resultType: typeof result,
        resultKeys: typeof result === 'object' && result !== null ? Object.keys(result) : 'N/A',
        resultValue: result
      });
    }
    
    // Apply field access if present
    if (hasFieldAccess) {
      // Apply each field access in sequence
      for (const field of value.fields) {
        // Handle variableIndex type - need to resolve the variable first
        if (field.type === 'variableIndex') {
          const indexVar = env.getVariable(field.value);
          if (!indexVar) {
            throw new Error(`Variable not found for index: ${field.value}`);
          }
          // Extract index value - WHY: Array/object indices must be raw values
          const { extractVariableValue: extract } = await import('@interpreter/utils/variable-resolution');
          const indexValue = await extract(indexVar, env);
          // Create a new field with the resolved value
          const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
          const fieldResult = await accessField(result, resolvedField, { 
            preserveContext: true,
            env,
            sourceLocation: (value as any)?.location 
          });
          result = (fieldResult as any).value;
        } else {
          const fieldResult = await accessField(result, field, { 
            preserveContext: true,
            env,
            sourceLocation: (value as any)?.location 
          });
          result = (fieldResult as any).value;
        }
      }
    }
    
    return result;
  }

  /**
   * Evaluates an ExecInvocation node with pipeline support
   */
  private async evaluateExecInvocation(value: any, env: Environment): Promise<any> {
    const { evaluateExecInvocation } = await import('../exec-invocation');
    
    // If the ExecInvocation has a pipeline, we need to handle it here
    // to ensure proper data type handling
    if (value.withClause && value.withClause.pipeline) {
      // Create a copy without the withClause to avoid double execution
      const nodeWithoutPipeline = {
        ...value,
        withClause: null
      };
      
      const result = await evaluateExecInvocation(nodeWithoutPipeline as any, env);
      
      // Use unified pipeline processor
      const { processPipeline } = await import('../../eval/pipeline/unified-processor');
      const pipelineResult = await processPipeline({
        value: result.value,
        env,
        node: value,
        identifier: value.identifier
      });
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('ExecInvocation pipeline result:', {
          pipelineResult,
          pipelineResultType: typeof pipelineResult,
          isPipelineInput: !!(pipelineResult && typeof pipelineResult === 'object' && 'text' in pipelineResult)
        });
      }
      
      // Try to parse the pipeline result back to maintain type consistency
      try {
        const parsed = JSON.parse(pipelineResult);
        return parsed;
      } catch {
        // If JSON parsing fails, return the string as-is
        return pipelineResult;
      }
    }
    
    // No pipeline, execute normally
    const result = await evaluateExecInvocation(value as any, env);
    
    // If the result is a JSON string, try to parse it back into an object/array
    if (typeof result.value === 'string') {
      try {
        const parsed = JSON.parse(result.value);
        return parsed;
      } catch {
        // If JSON parsing fails, return the string as-is
        return result.value;
      }
    }
    
    return result.value;
  }

  /**
   * Extracts the actual value from a variable using type guards
   * Note: This is used in contexts where we MUST extract the raw value
   */
  private async extractVariableValue(variable: any, env: Environment): Promise<any> {
    let result: any;
    if (isTextLike(variable)) {
      result = variable.value;
    } else if (isPath(variable)) {
      result = variable.value.resolvedPath;
    } else if (isImported(variable)) {
      result = variable.value;
    } else if (isObject(variable) || isArray(variable) || isStructuredValueVariable(variable)) {
      // Extract Variable value - WHY: Direct variable references in templates need raw values
      const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
      result = await extractVariableValue(variable, env);
    } else {
      // Extract Variable value - WHY: Direct variable references in templates need raw values
      const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
      result = await extractVariableValue(variable, env);
    }
    inheritExpressionProvenance(result, variable);
    return result;
  }

  /**
   * Evaluates a runExec node (run @command() in object context)
   */
  private async evaluateRunExec(value: any, env: Environment): Promise<any> {
    const { evaluateExecInvocation } = await import('../exec-invocation');
    const result = await evaluateExecInvocation(value.invocation as any, env);
    return result.value;
  }

  /**
   * Evaluates a path node (from [/path/to/file])
   */
  private async evaluatePathNode(value: any, env: Environment): Promise<any> {
    // Resolve path segments and read file
    const resolvedPath = await interpolateAndRecord(value.segments || [], env);
    const content = await env.fileSystem.readFile(resolvedPath);
    return content;
  }

  private attachProvenance(value: unknown, source?: Variable): void {
    if (!source) {
      return;
    }
    inheritExpressionProvenance(value, source);
  }
}
