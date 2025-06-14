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
      
      // Execute the command with @INPUT as the first argument if no args provided
      let args = command.args || [];
      
      // Check if this is a direct command definition that expects parameters
      if (args.length === 0) {
        if (commandVar.paramNames && commandVar.paramNames.length > 0) {
          // Command expects parameters, pass @INPUT as the first argument
          args = [{ type: 'Text', content: currentOutput }];
        } else if (commandVar.type === 'command' && commandVar.commandTemplate) {
          // Direct command definition, check if it has parameters
          const cmdDef = commandVar;
          if (cmdDef.paramNames && cmdDef.paramNames.length > 0) {
            args = [{ type: 'Text', content: currentOutput }];
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
    
    // Resolve the base variable value
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
    
    // Return the resolved command variable
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
  // Handle both wrapped executable variables and direct definitions
  let execDef: any;
  
  if (commandVar && commandVar.type === 'executable' && commandVar.value) {
    // This is a wrapped executable variable
    execDef = commandVar.value;
  } else if (commandVar && (commandVar.type === 'command' || commandVar.type === 'code' || commandVar.type === 'template') && (commandVar.commandTemplate || commandVar.codeTemplate || commandVar.templateContent)) {
    // This is a direct executable definition
    execDef = commandVar;
  } else {
    throw new Error(`Cannot execute non-executable variable in pipeline: ${JSON.stringify(commandVar)}`);
  }
  
  // Create environment with parameter bindings
  const execEnv = env.createChild();
  
  // Bind parameters if any
  if (execDef.paramNames && args.length > 0) {
    for (let i = 0; i < execDef.paramNames.length && i < args.length; i++) {
      const paramName = execDef.paramNames[i];
      const argValue = args[i];
      
      // Convert argument to text variable
      const textValue = typeof argValue === 'string' ? argValue :
                       argValue.content ? argValue.content : String(argValue);
      
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
  } else if (execDef.type === 'template' && execDef.templateContent) {
    // Interpolate template
    const { interpolate } = await import('../core/interpreter');
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    const result = await interpolate(execDef.templateContent, execEnv, InterpolationContext.Default);
    return result;
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}