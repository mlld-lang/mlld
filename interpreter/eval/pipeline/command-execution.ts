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
  // Skip builtin commands - they don't have identifiers
  if ('type' in command && command.type === 'builtinCommand') {
    return null;
  }
  
  // Debug: log what we're trying to resolve
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[resolveCommandReference] Resolving:', {
      rawIdentifier: command.rawIdentifier,
      hasIdentifier: 'identifier' in command,
      identifierLength: ('identifier' in command && command.identifier) ? command.identifier.length : 0,
      identifierType: ('identifier' in command && command.identifier && command.identifier[0]) ? command.identifier[0].type : 'none'
    });
  }
  
  // The command.identifier is already an array of nodes from the parser
  if (!('identifier' in command) || !command.identifier || command.identifier.length === 0) {
    // Try to resolve by rawIdentifier as a fallback for transformers
    if (command.rawIdentifier) {
      const varName = command.rawIdentifier.replace('@', '');
      const variable = env.getVariable(varName);
      if (variable && variable.type === 'executable') {
        return variable;
      }
    }
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
): Promise<string | any> {  // Can return retry signal objects
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
      
      // Handle CommandRef type - need to resolve to actual executable
      if (execDef?.type === 'commandRef') {
        if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
          console.error('[executeCommandVariable] Resolving CommandRef:', {
            commandRef: execDef.commandRef,
            hasCommandArgs: !!execDef.commandArgs,
            hasWithClause: !!execDef.withClause
          });
        }
        
        // Get the actual executable from the environment
        const referencedCommand = env.getVariable(execDef.commandRef);
        if (!referencedCommand) {
          throw new Error(`CommandRef '${execDef.commandRef}' not found in environment`);
        }
        
        // Extract the executable definition from the referenced command
        if (referencedCommand.metadata?.executableDef) {
          execDef = referencedCommand.metadata.executableDef;
        } else if (referencedCommand.value && typeof referencedCommand.value === 'object') {
          execDef = referencedCommand.value;
        } else {
          throw new Error(`CommandRef '${execDef.commandRef}' does not have an executable definition`);
        }
        
        if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
          console.error('[executeCommandVariable] Resolved CommandRef to:', {
            type: execDef?.type,
            hasParamNames: !!execDef?.paramNames,
            paramNames: execDef?.paramNames,
            language: execDef?.language
          });
        }
      }
      
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
  
  // Get the format from the pipeline context BEFORE creating child
  const pipelineCtx = env.getPipelineContext();
  const format = pipelineCtx?.format;
  
  // Debug: Check what context the parent has
  if (process.env.MLLD_DEBUG === 'true') {
    const parentCtx = env.getUniversalContext();
    console.error('[executeCommandVariable] Parent (stageEnv) has context:', {
      try: parentCtx?.try,
      stage: parentCtx?.stage,
      isPipeline: parentCtx?.isPipeline,
      input: parentCtx?.input?.substring?.(0, 50) || parentCtx?.input,
      parentId: env.id || 'no-id',
      contextObjectId: parentCtx ? Object.keys(parentCtx).join(',') : 'null'
    });
  }
  
  // Create environment with parameter bindings
  const execEnv = env.createChild();
  
  // Debug: Check what context the child inherited
  if (process.env.MLLD_DEBUG === 'true') {
    const childCtx = execEnv.getUniversalContext();
    console.error('[executeCommandVariable] Child (execEnv) inherited context:', {
      try: childCtx?.try,
      stage: childCtx?.stage,
      isPipeline: childCtx?.isPipeline,
      input: childCtx?.input?.substring?.(0, 50) || childCtx?.input,
      childId: execEnv.id || 'no-id',
      contextObjectId: childCtx ? Object.keys(childCtx).join(',') : 'null'
    });
  }
  
  // CRITICAL: Update universal context with the input for this exec function
  // This ensures @ctx.input is available in when expressions and JS blocks
  // The parent environment already has the correct context from setPipelineContext
  if (pipelineCtx && stdinInput !== undefined) {
    // Parse JSON input if possible for @ctx.input to support field access
    let parsedInput: any = stdinInput;
    try {
      parsedInput = JSON.parse(stdinInput);
    } catch {
      // Keep as string if not valid JSON
    }
    
    execEnv.updateUniversalContext({
      input: parsedInput
    });
    
    if (process.env.MLLD_DEBUG === 'true') {
      const updatedCtx = execEnv.getUniversalContext();
      console.error('[executeCommandVariable] Child context after input update:', {
        try: updatedCtx?.try,
        stage: updatedCtx?.stage,
        isPipeline: updatedCtx?.isPipeline,
        input: updatedCtx?.input?.substring?.(0, 50) || updatedCtx?.input
      });
    }
  }
  
  // Check if universal context is enabled
  const { USE_UNIVERSAL_CONTEXT } = await import('@core/feature-flags');
  
  // CRITICAL: Create pipeline context variables (@p, @pipeline, @ctx) if in pipeline
  // Only create if not already present (execEnv might inherit them)
  if (pipelineCtx && !execEnv.getVariable('p')) {
    // Create the context object similar to what context-builder does
    const contextObj = {
      try: pipelineCtx.try || 1,
      tries: pipelineCtx.tries || [],
      stage: pipelineCtx.stage || 0,
      length: pipelineCtx.previousOutputs?.length || 0,
      // Add array access to previous outputs
      ...(pipelineCtx.previousOutputs ? 
        Object.fromEntries(pipelineCtx.previousOutputs.map((v, i) => [i, v])) : {})
    };
    
    // Add negative indexing support
    if (pipelineCtx.previousOutputs && pipelineCtx.previousOutputs.length > 0) {
      Object.defineProperty(contextObj, -1, {
        get: () => pipelineCtx.previousOutputs[pipelineCtx.previousOutputs.length - 1],
        enumerable: false
      });
      Object.defineProperty(contextObj, -2, {
        get: () => pipelineCtx.previousOutputs[pipelineCtx.previousOutputs.length - 2],
        enumerable: false
      });
    }
    
    // Create the variable using the factory
    const { createObjectVariable } = await import('@core/types/variable');
    const pipelineVar = createObjectVariable(
      'pipeline',
      contextObj,
      false,
      undefined,
      {
        isPipelineContext: true,
        isSystem: true
      }
    );
    
    if (USE_UNIVERSAL_CONTEXT) {
      // When universal context is enabled, only create @p and @pipeline aliases
      // @ctx is provided globally via UniversalContext
      execEnv.setParameterVariable('p', pipelineVar);
      execEnv.setParameterVariable('pipeline', pipelineVar);
    } else {
      // Legacy mode: Set all three aliases
      execEnv.setParameterVariable('ctx', pipelineVar);
      execEnv.setParameterVariable('p', pipelineVar);
      execEnv.setParameterVariable('pipeline', pipelineVar);
    }
  }
  
  // Parameter binding for executable functions
  if (execDef.paramNames) {
    // Check if args are variable references from an exec definition pipeline
    // This happens when pipeline stages use parameters like @upper(@text)
    const hasVariableRefArgs = args.some(arg => 
      arg && typeof arg === 'object' && 
      arg.type === 'VariableReference'
    );
    
    // Check if we're at stage 1 (source stage) where args bind directly
    // At stage 1 (first stage with 1-indexing), there's no stdin yet, so args always bind directly
    const isSourceStage = pipelineCtx && pipelineCtx.stage === 1;
    
    if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
      console.error('[executeCommandVariable] STAGE EXECUTION:', {
        functionName: execDef.name || cmd.rawIdentifier,
        internalStage: pipelineCtx?.stage,
        userVisibleStage: pipelineCtx?.stage !== undefined ? pipelineCtx.stage + 1 : undefined,
        isSourceStage,
        hasVariableRefArgs,
        paramNames: execDef.paramNames,
        args: args.map(a => ({
          type: a?.type,
          content: a?.content?.substring?.(0, 20),
          identifier: a?.identifier
        })),
        stdinInput: stdinInput?.substring?.(0, 50) || stdinInput,
        hasPipelineCtx: !!pipelineCtx
      });
    }
    
    // If we have variable reference args, we need to evaluate them to get their values
    // then bind those values to parameters (following old exec-invocation pattern)
    if (hasVariableRefArgs) {
      // Evaluate each VariableReference to get actual values
      const evaluatedArgs: any[] = [];
      
      for (const arg of args) {
        if (arg && typeof arg === 'object' && arg.type === 'VariableReference') {
          // Look up the variable in the parent environment (where parameters from calling function are bound)
          const parentEnv = execEnv.parent || execEnv;
          const variable = parentEnv.getVariable(arg.identifier);
          
          if (variable) {
            // Get the actual value from the variable (following old pattern from exec-invocation-old.ts)
            let value = variable.value;
            
            // Handle field access if present (e.g., @user.name)
            if (arg.fields && arg.fields.length > 0) {
              for (const field of arg.fields) {
                if (value && typeof value === 'object' && (field.type === 'field' || field.type === 'numericField')) {
                  value = value[field.value];
                } else if (Array.isArray(value) && (field.type === 'index' || field.type === 'arrayIndex')) {
                  const index = parseInt(field.value, 10);
                  value = isNaN(index) ? undefined : value[index];
                } else {
                  value = undefined;
                  break;
                }
              }
            }
            
            evaluatedArgs.push(value);
            
            if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
              console.error(`[executeCommandVariable] Evaluated @${arg.identifier} = "${value}"`);
            }
          } else {
            // Variable not found - use empty string as fallback
            evaluatedArgs.push('');
            if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
              console.error(`[executeCommandVariable] Variable not found: @${arg.identifier}, using empty string`);
            }
          }
        } else {
          // Not a VariableReference, use as-is
          evaluatedArgs.push(arg);
        }
      }
      
      // Now bind the evaluated values to parameters
      // At stage 0, args bind directly. At later stages, stdin goes to first param.
      for (let i = 0; i < execDef.paramNames.length; i++) {
        const paramName = execDef.paramNames[i];
        
        let valueToUse;
        if (isSourceStage) {
          // Stage 0: args bind directly (no stdin offset)
          valueToUse = i < evaluatedArgs.length ? evaluatedArgs[i] : '';
          if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
            console.error(`[executeCommandVariable] Stage 0 - binding arg directly: ${paramName} = "${valueToUse}"`);
          }
        } else {
          // Pipeline stages: first param gets stdin, args offset by 1
          const isPipelineFirstParam = i === 0 && pipelineCtx !== undefined && stdinInput !== undefined;
          
          if (isPipelineFirstParam) {
            valueToUse = stdinInput;
            if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
              console.error(`[executeCommandVariable] Pipeline stage - binding stdin to first param: ${paramName} = "${valueToUse}"`);
            }
          } else {
            // Args are offset by 1 in pipeline stages (since first param got stdin)
            const argIndex = i - 1;
            valueToUse = argIndex >= 0 && argIndex < evaluatedArgs.length ? evaluatedArgs[argIndex] : '';
            if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
              console.error(`[executeCommandVariable] Pipeline stage - binding arg to param: ${paramName} = "${valueToUse}"`);
            }
          }
        }
        
        // Convert to string for text variable creation
        const stringValue = typeof valueToUse === 'string' ? valueToUse :
                          valueToUse?.content !== undefined ? valueToUse.content :
                          String(valueToUse || '');
        
        const textVar = createSimpleTextVariable(
          paramName,
          stringValue,
          { directive: 'var', syntax: 'quoted', hasInterpolation: false, isMultiLine: false },
          { isPipelineParameter: !isSourceStage && i === 0 }
        );
        execEnv.setParameterVariable(paramName, textVar);
      }
    } else {
      // Normal parameter binding for direct invocations or literal args
      for (let i = 0; i < execDef.paramNames.length; i++) {
        const paramName = execDef.paramNames[i];
        
        // Key distinction: source stages (stage 0) bind args directly to params
        // Pipeline stages (stage > 0) use stdin for first param, offset args by 1
        let argValue;
        let isPipelineParam = false;
        
        if (isSourceStage) {
          // Source stage: args bind directly to params (no stdin offset)
          argValue = i < args.length ? args[i] : null;
          if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
            console.error(`[executeCommandVariable] Stage 0 binding: ${paramName} = ${argValue}`);
          }
        } else {
          // Pipeline stage: stdin goes to first param, args offset by 1
          const argIndex = pipelineCtx !== undefined && stdinInput !== undefined ? i - 1 : i;
          argValue = argIndex >= 0 && argIndex < args.length ? args[argIndex] : null;
          
          // First parameter in pipeline stage gets @input
          isPipelineParam = i === 0 && pipelineCtx !== undefined && stdinInput !== undefined;
        }
      
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
        } else if (typeof argValue === 'object' && !argValue.type && !argValue.content) {
          // Raw object (like pipeline context passed as @p)
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
      
      // Check if it's a retry signal before stringifying
      if (whenResult.value && typeof whenResult.value === 'object' && 
          (whenResult.value.__retry === true || whenResult.value.retry === true)) {
        return whenResult.value;
      }
      
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
    
    // CRITICAL: Add pipeline context variables if they exist
    // These are not in paramNames but need to be available in JS execution
    if (pipelineCtx) {
      const pipelineVar = execEnv.getVariable('pipeline');
      if (pipelineVar) {
        params['pipeline'] = pipelineVar.value;
        params['p'] = pipelineVar.value;
        params['ctx'] = pipelineVar.value;
        // Also add as 'context' for compatibility with JS code that uses context.try
        params['context'] = pipelineVar.value;
      }
    }
    
    const result = await env.executeCode(code, execDef.language || 'javascript', params);
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[executeCommandVariable] executeCode returned:', {
        resultType: typeof result,
        isRetrySignal: result && typeof result === 'object' && result.__retry === true,
        resultPreview: typeof result === 'object' ? JSON.stringify(result) : String(result).substring(0, 100)
      });
    }
    
    // Check for retry signal BEFORE stringifying
    if (result && typeof result === 'object' && 
        (result.__retry === true || result.retry === true)) {
      // Return the retry object as-is for proper detection
      return result;
    }
    
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