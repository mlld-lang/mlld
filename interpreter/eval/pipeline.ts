import type { Environment } from '../env/Environment';
import type { PipelineCommand } from '@core/types';
import { MlldCommandExecutionError } from '@core/errors';
import { resolveVariableValue } from '../core/interpreter';
import { createPipelineInput, isPipelineInput } from '../utils/pipeline-input';
import { 
  createSimpleTextVariable, 
  createPipelineInputVariable,
  type VariableSource 
} from '@core/types/variable';

/**
 * Execute a pipeline of transformation commands with @input threading
 */
export async function executePipeline(
  baseOutput: string,
  pipeline: PipelineCommand[],
  env: Environment,
  location?: any,
  format?: string
): Promise<string> {
  let currentOutput = baseOutput;
  const previousOutputs: string[] = [];
  
  for (let i = 0; i < pipeline.length; i++) {
    const command = pipeline[i];
    
    // Set pipeline context in the environment
    env.setPipelineContext({
      stage: i + 1,
      totalStages: pipeline.length,
      currentCommand: command.rawIdentifier,
      input: currentOutput,
      previousOutputs: [...previousOutputs],
      format: format || 'json'
    });
    
    // Create child environment with @input variable
    const pipelineEnv = env.createChild();
    
    // Create pipeline input variable for this stage
    const pipelineInputObj = createPipelineInput(currentOutput, format || 'text');
    const inputSource: VariableSource = {
      directive: 'var',
      syntax: 'template',
      hasInterpolation: false,
      isMultiLine: false
    };
    
    const inputVar = createPipelineInputVariable(
      'INPUT',
      pipelineInputObj,
      (format || 'text') as 'json' | 'csv' | 'xml' | 'text',
      currentOutput,
      inputSource,
      i + 1, // stage number
      {
        isSystem: true,
        isPipelineInput: true
      }
    );
    
    // Set the pipeline input variable as a parameter (allows overriding reserved names)
    pipelineEnv.setParameterVariable('INPUT', inputVar);
    
    try {
      // Resolve the command reference
      const commandVar = await resolveCommandReference(command, pipelineEnv);
      
      if (!commandVar) {
        throw new MlldCommandExecutionError(
          `Pipeline command ${command.rawIdentifier} not found`,
          location,
          {
            command: command.rawIdentifier,
            exitCode: 1,
            duration: 0,
            workingDirectory: process.cwd()
          }
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
      
      // Store this stage's output for context
      previousOutputs.push(result);
      
    } catch (error) {
      // Clear pipeline context on error
      env.clearPipelineContext();
      
      // Enhance error with pipeline context
      if (error instanceof MlldCommandExecutionError) {
        throw new MlldCommandExecutionError(
          `Pipeline step ${i + 1} failed: ${error.message}`,
          location || error.sourceLocation,
          {
            command: command.rawIdentifier,
            exitCode: error.exitCode || 1,
            duration: 0,
            stdout: error.output,
            workingDirectory: process.cwd()
          }
        );
      }
      throw error;
    }
  }
  
  // Clear pipeline context when done
  env.clearPipelineContext();
  
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
      // Use the full definition from metadata
      execDef = commandVar.metadata.executableDef;
      
      // Also copy paramNames from the variable if not in execDef
      if (!execDef.paramNames && commandVar.paramNames) {
        execDef.paramNames = commandVar.paramNames;
      }
    } else {
      // Fall back to the simplified value structure
      // Map the simplified structure to what the pipeline expects
      const simplifiedValue = commandVar.value;
      if (simplifiedValue.type === 'code') {
        execDef = {
          type: 'code',
          codeTemplate: simplifiedValue.template, // template is already nodes from exe.ts
          language: simplifiedValue.language || 'javascript',
          paramNames: commandVar.paramNames || []
        };
      } else if (simplifiedValue.type === 'command') {
        execDef = {
          type: 'command',
          commandTemplate: simplifiedValue.template, // template is already nodes from exe.ts
          paramNames: commandVar.paramNames || []
        };
      } else {
        execDef = simplifiedValue;
      }
    }
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Executable definition extracted:', {
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
      // Deep inspection of value structure
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
  const format = pipelineCtx?.format; // Don't default to json - let it be undefined
  
  // Bind parameters if any
  if (execDef.paramNames) {
    for (let i = 0; i < execDef.paramNames.length; i++) {
      const paramName = execDef.paramNames[i];
      const argValue = i < args.length ? args[i] : null;
      
      // Check if this is the first parameter in a pipeline context
      const isPipelineParam = i === 0 && pipelineCtx !== undefined;
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('Parameter binding check:', {
          i,
          paramName,
          stdinInput: stdinInput ? stdinInput.substring(0, 50) + '...' : undefined,
          hasPipelineCtx: !!pipelineCtx,
          isPipelineParam,
          argValue: argValue ? String(argValue).substring(0, 50) + '...' : null
        });
      }
      
      if (isPipelineParam) {
        // Extract the actual value from the argument or stdin
        // For first stage of pipeline: value comes from stdinInput
        // For subsequent stages: value comes from args[0]
        const textValue = stdinInput !== undefined ? stdinInput :
                         argValue === null ? '' :
                         typeof argValue === 'string' ? argValue :
                         argValue.content !== undefined ? argValue.content : String(argValue);
        
        // For backwards compatibility: if no format is specified, pass string directly
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
          
          // Debug logging
          if (process.env.MLLD_DEBUG === 'true') {
            console.log('Creating pipeline parameter:', {
              paramName,
              format,
              textValue: textValue.substring(0, 50) + '...',
              wrappedInputKeys: Object.keys(wrappedInput)
            });
          }
          
          // Create a pipeline input variable
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
          
          if (process.env.MLLD_DEBUG === 'true') {
            console.log('Setting pipeline parameter variable:', {
              paramName,
              hasMetadata: !!pipelineVar.metadata,
              isPipelineInput: pipelineVar.metadata?.isPipelineInput,
              wrappedInputType: typeof wrappedInput
            });
          }
          
          execEnv.setParameterVariable(paramName, pipelineVar);
        }
      } else {
        // Regular parameter handling
        const textValue = argValue === null ? '' :
                         typeof argValue === 'string' ? argValue :
                         argValue.content !== undefined ? argValue.content : String(argValue);
        
        const paramSource: VariableSource = {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        };
        
        const paramVar = createSimpleTextVariable(
          paramName,
          textValue,
          paramSource,
          { isParameter: true }
        );
        
        execEnv.setParameterVariable(paramName, paramVar);
      }
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
          // Debug logging
          if (process.env.MLLD_DEBUG === 'true') {
            console.log('Processing parameter for JS execution:', {
              paramName,
              varType: paramVar.type,
              hasMetadata: !!paramVar.metadata,
              isPipelineInput: paramVar.metadata?.isPipelineInput,
              hasPipelineInput: !!paramVar.metadata?.pipelineInput,
              metadataKeys: paramVar.metadata ? Object.keys(paramVar.metadata) : []
            });
          }
          
          // Check if this is a pipeline input variable
          if (paramVar.type === 'pipeline-input') {
            // PipelineInputVariable stores the PipelineInput object in value
            params[paramName] = paramVar.value;
            
            if (process.env.MLLD_DEBUG === 'true') {
              console.log('Using PipelineInputVariable value for param:', paramName);
            }
          } else if (paramVar.metadata?.isPipelineInput && paramVar.metadata?.pipelineInput) {
            // Legacy: Use the wrapped pipeline input from metadata
            params[paramName] = paramVar.metadata.pipelineInput;
            
            if (process.env.MLLD_DEBUG === 'true') {
              console.log('Using wrapped pipeline input from metadata for param:', paramName);
            }
          } else {
            // Regular variable - use the value directly
            params[paramName] = paramVar.value;
          }
        }
      }
    }
    
    const result = await env.executeCode(code, execDef.language || 'javascript', params);
    
    // If the function returns a PipelineInput object, extract the text
    // This can happen if the function just returns its input parameter
    if (result && typeof result === 'object' && 'text' in result && 'type' in result) {
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('Pipeline function returned PipelineInput object, extracting text');
      }
      return String(result.text);
    }
    
    return String(result);
  } else if (execDef.type === 'template' && execDef.template) {
    // Interpolate template
    const { interpolate } = await import('../core/interpreter');
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    const result = await interpolate(execDef.template, execEnv, InterpolationContext.Default);
    return result;
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}