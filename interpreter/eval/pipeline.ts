import type { Environment } from '../env/Environment';
import type { PipelineCommand } from '@core/types';
import { createTextVariable } from '@core/types';
import { MlldCommandExecutionError } from '@core/errors';
import { resolveVariableValue } from '../core/interpreter';

/**
 * Execute a pipeline of transformation commands with @input threading
 */
export async function executePipeline(
  baseOutput: string,
  pipeline: PipelineCommand[],
  env: Environment,
  location?: any
): Promise<string> {
  let currentOutput = baseOutput;
  
  for (let i = 0; i < pipeline.length; i++) {
    const command = pipeline[i];
    
    // Create child environment with @input variable
    const pipelineEnv = env.createChild();
    
    // Check if INPUT already exists and update it, otherwise create it
    const existingInput = pipelineEnv.getVariable('INPUT');
    if (existingInput) {
      // Update existing INPUT variable
      existingInput.value = currentOutput;
    } else {
      // Create new INPUT variable
      const inputVar = createTextVariable('INPUT', currentOutput);
      // Mark as system variable to bypass reserved name check
      inputVar.metadata = { ...inputVar.metadata, isSystem: true };
      pipelineEnv.setVariable('INPUT', inputVar);
    }
    
    try {
      // Resolve the command reference
      const commandVar = await resolveCommandReference(command, pipelineEnv);
      
      if (!commandVar) {
        throw new MlldCommandExecutionError(
          `Pipeline command ${command.rawIdentifier} not found`,
          command.rawIdentifier,
          1,
          '',
          location
        );
      }
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('Pipeline command resolved:', {
          rawIdentifier: command.rawIdentifier,
          commandVarType: commandVar?.type,
          hasValue: !!commandVar?.value,
          valueType: commandVar?.value?.type
        });
      }
      
      // Execute the command with @INPUT as the first argument if no args provided
      let args = command.args || [];
      
      // Check if this is a direct command definition that expects parameters
      if (args.length === 0) {
        // Get the actual parameter names from the executable definition
        let paramNames: string[] | undefined;
        if (commandVar && commandVar.type === 'executable' && commandVar.value) {
          paramNames = commandVar.value.paramNames;
        } else if (commandVar && commandVar.paramNames) {
          paramNames = commandVar.paramNames;
        }
        
        if (paramNames && paramNames.length > 0) {
          // Single parameter - pass @INPUT directly
          if (paramNames.length === 1) {
            args = [{ type: 'Text', content: currentOutput }];
          } 
          // Multiple parameters - try smart JSON destructuring
          else {
            try {
              const parsed = JSON.parse(currentOutput);
              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                // Map JSON object properties to parameters by name
                args = paramNames.map(name => {
                  const value = parsed[name];
                  const content = value !== undefined ? 
                    (typeof value === 'string' ? value : JSON.stringify(value)) : 
                    '';
                  return {
                    type: 'Text',
                    content
                  };
                });
              } else {
                // Not an object, just pass as first parameter
                args = [{ type: 'Text', content: currentOutput }];
              }
            } catch {
              // Not JSON, pass as first parameter
              args = [{ type: 'Text', content: currentOutput }];
            }
          }
        }
      }
      
      const result = await executeCommandVariable(commandVar, args, pipelineEnv, currentOutput);
      
      // Check for empty output (pipeline termination)
      if (!result || result.trim() === '') {
        // Pipeline terminates early with empty result
        return '';
      }
      
      currentOutput = result;
      
    } catch (error) {
      // Enhance error with pipeline context
      if (error instanceof MlldCommandExecutionError) {
        throw new MlldCommandExecutionError(
          `Pipeline step ${i + 1} failed: ${error.message}`,
          command.rawIdentifier,
          error.exitCode,
          error.output,
          location || error.location
        );
      }
      throw error;
    }
  }
  
  // Debug logging
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('executePipeline returning:', {
      currentOutput,
      currentOutputType: typeof currentOutput,
      isNull: currentOutput === null,
      isUndefined: currentOutput === undefined,
      length: typeof currentOutput === 'string' ? currentOutput.length : 'N/A'
    });
  }
  
  return currentOutput;
}

/**
 * Resolve a command reference to an executable variable
 */
async function resolveCommandReference(
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
    
    // Resolve the base variable value for non-executables
    let value = await resolveVariableValue(baseVar, env);
    
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
async function executeCommandVariable(
  commandVar: any,
  args: any[],
  env: Environment,
  stdinInput?: string
): Promise<string> {
  // Check if this is a built-in transformer with direct implementation
  if (commandVar && commandVar.metadata?.isBuiltinTransformer && commandVar.metadata?.transformerImplementation) {
    try {
      const result = await commandVar.metadata.transformerImplementation(stdinInput || '');
      return String(result);
    } catch (error) {
      throw new MlldCommandExecutionError(
        `Transformer ${commandVar.name} failed: ${error.message}`,
        commandVar.location
      );
    }
  }
  
  // Handle both wrapped executable variables and direct definitions
  let execDef: any;
  
  if (commandVar && commandVar.type === 'executable' && commandVar.value) {
    // This is a wrapped executable variable
    execDef = commandVar.value;
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Executable definition extracted:', {
        type: execDef?.type,
        hasParamNames: !!execDef?.paramNames,
        hasCommandTemplate: !!execDef?.commandTemplate,
        hasCodeTemplate: !!execDef?.codeTemplate,
        hasTemplateContent: !!execDef?.templateContent,
        language: execDef?.language
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
      hasCommandTemplate: !!(commandVar?.commandTemplate),
      hasCodeTemplate: !!(commandVar?.codeTemplate),
      hasTemplateContent: !!(commandVar?.templateContent),
      hasTemplate: !!(commandVar?.template),
      keys: commandVar ? Object.keys(commandVar) : []
    };
    throw new Error(`Cannot execute non-executable variable in pipeline: ${JSON.stringify(varInfo)}`);
  }
  
  // Create environment with parameter bindings
  const execEnv = env.createChild();
  
  // Bind parameters if any
  if (execDef.paramNames) {
    for (let i = 0; i < execDef.paramNames.length; i++) {
      const paramName = execDef.paramNames[i];
      const argValue = i < args.length ? args[i] : null;
      
      // Convert argument to text variable
      const textValue = argValue === null ? '' :
                       typeof argValue === 'string' ? argValue :
                       argValue.content !== undefined ? argValue.content : String(argValue);
      
      execEnv.setParameterVariable(paramName, createTextVariable(paramName, textValue));
    }
  }
  
  // Execute based on type
  if (execDef.type === 'command' && execDef.commandTemplate) {
    // Interpolate command template with parameters
    const { interpolate } = await import('../core/interpreter');
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand);
    
    // Always pass pipeline input as stdin when available
    // This allows Unix utilities to work naturally while preserving @INPUT variable access
    const result = await env.executeCommand(command, { input: stdinInput } as any);
    return result;
  } else if (execDef.type === 'code' && execDef.codeTemplate) {
    // Interpolate code template
    const { interpolate } = await import('../core/interpreter');
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    const code = await interpolate(execDef.codeTemplate, execEnv, InterpolationContext.Default);
    
    // Build parameters object from bound variables
    const params: Record<string, any> = {};
    if (execDef.paramNames) {
      for (const paramName of execDef.paramNames) {
        const paramVar = execEnv.getVariable(paramName);
        if (paramVar) {
          params[paramName] = paramVar.value;
        }
      }
    }
    
    const result = await env.executeCode(code, execDef.language || 'javascript', params);
    return result;
  } else if (execDef.type === 'template' && execDef.template) {
    // Interpolate template
    const { interpolate } = await import('../core/interpreter');
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    const result = await interpolate(execDef.template, execEnv, InterpolationContext.Default);
    return result;
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}