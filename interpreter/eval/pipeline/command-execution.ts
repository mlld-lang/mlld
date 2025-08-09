import type { Environment } from '../../env/Environment';
import type { PipelineCommand, VariableSource } from '@core/types';
import { MlldCommandExecutionError } from '@core/errors';
import { createPipelineInputVariable, createSimpleTextVariable } from '@core/types/variable';
import { createPipelineInput } from '../../utils/pipeline-input';
import { logger } from '@core/utils/logger';

/**
 * Resolve a command reference to an executable variable
 */
export async function resolveCommandReference(
  command: PipelineCommand,
  env: Environment
): Promise<any> {
  // The command.identifier is already an array of nodes from the parser
  if (!command.identifier || command.identifier.length === 0) {
    return null;
  }
  
  // Use the first node (should be a VariableReference node)
  const varRefNode = command.identifier[0];
  
  // Check if this is a variable reference with field access
  if (varRefNode.type === 'VariableReference') {
    const varRef = varRefNode as any;
    const baseVar = env.getVariable(varRef.identifier);
    
    if (!baseVar) {
      return null;
    }
    
    // For executable variables (like transformers), return the variable itself
    // For other types, we might need to resolve field access
    if (baseVar.type === 'executable') {
      return baseVar;
    }
    
    // Extract value for non-executable variables
    const { extractVariableValue } = await import('../../utils/variable-resolution');
    let value = await extractVariableValue(baseVar, env);
    
    // Navigate through field access if present
    if (varRef.fields && varRef.fields.length > 0) {
      for (const field of varRef.fields) {
        if ((field.type === 'field' || field.type === 'stringIndex' || field.type === 'numericField') && typeof value === 'object' && value !== null) {
          value = (value as Record<string, unknown>)[String(field.value)];
        } else if (field.type === 'arrayIndex' && Array.isArray(value)) {
          value = value[Number(field.value)];
        } else {
          const fieldName = String(field.value);
          throw new Error(`Cannot access field '${fieldName}' on ${typeof value}`);
        }
      }
    }
    
    // Return the resolved value
    return value;
  }
  
  return null;
}

/**
 * Execute a command variable with arguments
 */
export async function executeCommandVariable(
  commandVar: any,
  args: any[],
  env: Environment,
  stdinInput?: string
): Promise<string> {
  // Built-in transformer handling
  if (commandVar && commandVar.metadata?.isBuiltinTransformer && commandVar.metadata?.transformerImplementation) {
    try {
      const result = await commandVar.metadata.transformerImplementation(stdinInput || '');
      return String(result);
    } catch (error) {
      throw new MlldCommandExecutionError(
        `Transformer ${commandVar.name} failed: ${error.message}`,
        undefined,
        {
          command: commandVar.name,
          exitCode: 1,
          duration: 0,
          workingDirectory: process.cwd()
        }
      );
    }
  }
  
  // Handle both wrapped executable variables and direct definitions
  let execDef: any;
  
  if (commandVar && commandVar.type === 'executable' && commandVar.value) {
    // Check if we have the full ExecutableDefinition in metadata
    if (commandVar.metadata?.executableDef) {
      execDef = commandVar.metadata.executableDef;
      
      // Also copy paramNames from the variable if not in execDef
      if (!execDef.paramNames && commandVar.paramNames) {
        execDef.paramNames = commandVar.paramNames;
      }
    } else {
      // Fall back to the simplified value structure
      const simplifiedValue = commandVar.value;
      if (simplifiedValue.type === 'code') {
        execDef = {
          type: 'code',
          codeTemplate: simplifiedValue.template,
          language: simplifiedValue.language || 'javascript',
          paramNames: commandVar.paramNames || []
        };
      } else if (simplifiedValue.type === 'command') {
        execDef = {
          type: 'command',
          commandTemplate: simplifiedValue.template,
          paramNames: commandVar.paramNames || []
        };
      } else {
        execDef = simplifiedValue;
      }
    }
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('Executable definition extracted:', {
        type: execDef?.type,
        hasParamNames: !!execDef?.paramNames,
        hasCommandTemplate: !!execDef?.commandTemplate,
        hasCodeTemplate: !!execDef?.codeTemplate,
        hasTemplateContent: !!execDef?.templateContent,
        hasTemplate: !!execDef?.template,
        language: execDef?.language,
        fromMetadata: !!commandVar.metadata?.executableDef
      });
    }
  } else if (commandVar && (commandVar.type === 'command' || commandVar.type === 'code' || commandVar.type === 'template') && (commandVar.commandTemplate || commandVar.codeTemplate || commandVar.templateContent)) {
    // This is a direct executable definition
    execDef = commandVar;
  } else {
    // Enhanced error message with more detail
    const varInfo = {
      type: commandVar?.type,
      hasValue: !!commandVar?.value,
      valueType: commandVar?.value?.type,
      valueKeys: commandVar?.value ? Object.keys(commandVar.value) : [],
      hasCommandTemplate: !!(commandVar?.commandTemplate),
      hasCodeTemplate: !!(commandVar?.codeTemplate),
      hasTemplateContent: !!(commandVar?.templateContent),
      hasTemplate: !!(commandVar?.template),
      keys: commandVar ? Object.keys(commandVar) : [],
      valueStructure: commandVar?.value ? {
        type: commandVar.value.type,
        hasTemplate: !!(commandVar.value.template),
        hasCodeTemplate: !!(commandVar.value.codeTemplate),
        hasCommandTemplate: !!(commandVar.value.commandTemplate),
        language: commandVar.value.language,
        paramNames: commandVar.value.paramNames
      } : null
    };
    throw new Error(`Cannot execute non-executable variable in pipeline: ${JSON.stringify(varInfo, null, 2)}`);
  }
  
  // Create environment with parameter bindings
  const execEnv = env.createChild();
  
  // Get the format from the pipeline context
  const pipelineCtx = env.getPipelineContext();
  const format = pipelineCtx?.format;
  
  // Parameter binding for executable functions
  if (execDef.paramNames) {
    for (let i = 0; i < execDef.paramNames.length; i++) {
      const paramName = execDef.paramNames[i];
      // In pipelines, explicit args bind starting from the SECOND parameter
      // First parameter always gets @input (stdinInput) implicitly
      const argIndex = pipelineCtx !== undefined && stdinInput !== undefined ? i - 1 : i;
      const argValue = argIndex >= 0 && argIndex < args.length ? args[argIndex] : null;
      
      // First parameter in pipeline context ALWAYS gets @input
      const isPipelineParam = i === 0 && pipelineCtx !== undefined && stdinInput !== undefined;
      
      if (isPipelineParam) {
        // First parameter ALWAYS gets the pipeline input (stdinInput)
        const { AutoUnwrapManager } = await import('../auto-unwrap-manager');
        const unwrappedStdin = AutoUnwrapManager.unwrap(stdinInput || '');
        const textValue = unwrappedStdin || '';
        
        if (!format) {
          // Create a simple text variable instead of PipelineInput
          const textSource: VariableSource = {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          };
          
          const textVar = createSimpleTextVariable(
            paramName,
            textValue,
            textSource,
            { isPipelineParameter: true }
          );
          
          execEnv.setParameterVariable(paramName, textVar);
        } else {
          // Create wrapped input with format
          const wrappedInput = createPipelineInput(textValue, format);
          
          const pipelineSource: VariableSource = {
            directive: 'var',
            syntax: 'template',
            hasInterpolation: false,
            isMultiLine: false
          };
          
          const pipelineVar = createPipelineInputVariable(
            paramName,
            wrappedInput,
            format as 'json' | 'csv' | 'xml' | 'text',
            textValue,
            pipelineSource,
            pipelineCtx?.stage
          );
          
          execEnv.setParameterVariable(paramName, pipelineVar);
        }
      } else {
        // Regular parameter handling
        let paramValue: any;
        
        if (argValue === null) {
          paramValue = '';
        } else if (typeof argValue === 'string') {
          paramValue = argValue;
        } else if (argValue.type === 'Text' && argValue.content !== undefined) {
          paramValue = argValue.content;
        } else if (argValue.content !== undefined) {
          paramValue = argValue.content;
        } else {
          paramValue = String(argValue);
        }
        
        // Check if we're passing an object (like @p pipeline context)
        if (typeof paramValue === 'object' && paramValue !== null) {
          // For objects, create an object variable that preserves the actual object
          const paramVar = {
            type: 'object',
            name: paramName,
            value: paramValue,
            metadata: { 
              isParameter: true,
              isPipelineContext: paramValue.stage !== undefined
            }
          };
          
          execEnv.setParameterVariable(paramName, paramVar);
        } else {
          // For non-objects, create a text variable as before
          const paramSource: VariableSource = {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          };
          
          const paramVar = createSimpleTextVariable(
            paramName,
            String(paramValue),
            paramSource,
            { isParameter: true }
          );
          
          execEnv.setParameterVariable(paramName, paramVar);
        }
      }
    }
  }
  
  // Execute based on type
  if (execDef.type === 'command' && execDef.commandTemplate) {
    // Interpolate command template with parameters
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    
    const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand);
    
    // Always pass pipeline input as stdin when available
    const result = await env.executeCommand(command, { input: stdinInput } as any);
    return result;
  } else if (execDef.type === 'code' && execDef.codeTemplate) {
    // Special handling for mlld-when expressions
    if (execDef.language === 'mlld-when') {
      // The codeTemplate contains the WhenExpression node
      const whenExprNode = execDef.codeTemplate[0];
      if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
        throw new Error('mlld-when executable missing WhenExpression node');
      }
      
      // Evaluate the when expression with the parameter environment
      const { evaluateWhenExpression } = await import('../when-expression');
      const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
      
      // Return the result
      return String(whenResult.value || '');
    }
    
    // Regular JavaScript/code execution
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    
    const code = await interpolate(execDef.codeTemplate, execEnv, InterpolationContext.Default);
    
    // Build parameters object from bound variables
    const params: Record<string, any> = {};
    if (execDef.paramNames) {
      for (const paramName of execDef.paramNames) {
        const paramVar = execEnv.getVariable(paramName);
        if (paramVar) {
          // Check if this is a pipeline input variable
          if (paramVar.type === 'pipeline-input') {
            // PipelineInputVariable stores the PipelineInput object in value
            params[paramName] = paramVar.value;
          } else if (paramVar.metadata?.isPipelineInput && paramVar.metadata?.pipelineInput) {
            // Legacy: Use the wrapped pipeline input from metadata
            params[paramName] = paramVar.metadata.pipelineInput;
          } else {
            // Regular variable - use the value directly
            params[paramName] = paramVar.value;
          }
        }
      }
    }
    
    const result = await env.executeCode(code, execDef.language || 'javascript', params);
    
    // If the function returns a PipelineInput object, extract the text
    if (result && typeof result === 'object' && 'text' in result && 'type' in result) {
      return String(result.text);
    }
    
    return String(result);
  } else if (execDef.type === 'template' && execDef.template) {
    // Interpolate template
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    
    const result = await interpolate(execDef.template, execEnv, InterpolationContext.Default);
    return result;
  } else if (execDef.type === 'commandRef') {
    // Handle command references - recursively call the referenced command
    const refExecVar = env.getVariable(execDef.commandRef);
    if (!refExecVar) {
      throw new Error(`Referenced executable not found: ${execDef.commandRef}`);
    }
    
    // Recursively execute the referenced command with the same input
    const result = await executeCommandVariable(
      refExecVar,
      execDef.commandArgs ?? [],
      env,
      stdinInput
    );
    return result;
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}