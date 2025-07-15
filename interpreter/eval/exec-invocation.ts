import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { isCommandExecutable, isCodeExecutable, isTemplateExecutable, isCommandRefExecutable, isSectionExecutable, isResolverExecutable } from '@core/types/executable';
import { interpolate, resolveVariableValue } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { isExecutableVariable, createSimpleTextVariable, createObjectVariable, createArrayVariable } from '@core/types/variable';
import { applyWithClause } from './with-clause';
import { MlldInterpreterError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { extractSection } from './show';
import { prepareValueForShadow } from '../env/variable-proxy';

/**
 * Check if enhanced Variable passing to shadow environments is enabled
 */
function isEnhancedVariablePassingEnabled(): boolean {
  // Check environment variable
  const envVar = process.env.MLLD_ENHANCED_VARIABLE_PASSING;
  // Default to false until we fix primitive handling
  return envVar === 'true';
}

/**
 * Evaluate an ExecInvocation node
 * This executes a previously defined exec command with arguments and optional tail modifiers
 */
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  if (process.env.DEBUG_WHEN || process.env.DEBUG_EXEC) {
    logger.debug('evaluateExecInvocation called with:', { commandRef: node.commandRef });
  }
  
  // Get the command name from the command reference
  let commandName: string;
  
  // With improved type consistency, identifier is always VariableReferenceNode[]
  if (typeof node.commandRef.identifier === 'string') {
    // Legacy string format (should be rare)
    commandName = node.commandRef.identifier;
  } else if (Array.isArray(node.commandRef.identifier) && node.commandRef.identifier.length > 0) {
    // Extract from array of VariableReference nodes
    const identifierNode = node.commandRef.identifier[0];
    if (identifierNode.type === 'VariableReference' && identifierNode.identifier) {
      commandName = identifierNode.identifier as string;
    } else {
      commandName = (node.commandRef as any).name as string || '';
    }
  } else {
    commandName = (node.commandRef as any).name as string || '';
  }
  
  if (!commandName) {
    throw new MlldInterpreterError('ExecInvocation has no command identifier');
  }
  
  // Check if this is a field access exec invocation (e.g., @demo.valueCmd())
  let variable;
  const commandRefWithObject = node.commandRef as any & { objectReference?: any }; // Type assertion to handle objectReference
  if (commandRefWithObject.objectReference) {
    // Get the object first
    const objectRef = commandRefWithObject.objectReference;
    const objectVar = env.getVariable(objectRef.identifier);
    if (!objectVar) {
      throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
    }
    
    // Resolve the object value
    const objectValue = await resolveVariableValue(objectVar, env);
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Object reference in exec invocation', {
        objectRef: objectRef.identifier,
        objectVarType: objectVar.type,
        objectVarValue: typeof objectVar.value,
        objectVarIsComplex: (objectVar as any).isComplex,
        objectValueType: typeof objectValue,
        isString: typeof objectValue === 'string',
        objectKeys: typeof objectValue === 'object' && objectValue !== null ? Object.keys(objectValue) : 'not-object',
        objectValue: typeof objectValue === 'object' && objectValue !== null ? JSON.stringify(objectValue, null, 2).substring(0, 500) : objectValue
      });
    }
    
    // Access the field
    if (objectRef.fields && objectRef.fields.length > 0) {
      // Navigate through nested fields
      let currentValue = objectValue;
      for (const field of objectRef.fields) {
        if (process.env.DEBUG_EXEC) {
          logger.debug('Accessing field', {
            fieldType: field.type,
            fieldValue: field.value,
            currentValueType: typeof currentValue,
            currentValueKeys: typeof currentValue === 'object' && currentValue !== null ? Object.keys(currentValue) : 'not-object'
          });
        }
        if (typeof currentValue === 'object' && currentValue !== null) {
          currentValue = (currentValue as any)[field.value];
          if (process.env.DEBUG_EXEC) {
            logger.debug('Field access result', {
              fieldValue: field.value,
              resultType: typeof currentValue,
              resultKeys: typeof currentValue === 'object' && currentValue !== null ? Object.keys(currentValue) : 'not-object'
            });
          }
        } else {
          throw new MlldInterpreterError(`Cannot access field ${field.value} on non-object`);
        }
      }
      // Now access the command field
      if (typeof currentValue === 'object' && currentValue !== null) {
        const fieldValue = (currentValue as any)[commandName];
        variable = fieldValue;
      }
    } else {
      // Direct field access on the object
      if (typeof objectValue === 'object' && objectValue !== null) {
        // Handle AST object structure with type and properties
        let fieldValue;
        if (objectValue.type === 'object' && objectValue.properties) {
          fieldValue = objectValue.properties[commandName];
        } else {
          fieldValue = (objectValue as any)[commandName];
        }
        
        variable = fieldValue;
      }
    }
    
    if (!variable) {
      throw new MlldInterpreterError(`Method not found: ${commandName} on ${objectRef.identifier}`);
    }
    
    // Handle __executable objects from resolved imports
    if (typeof variable === 'object' && variable !== null && '__executable' in variable && variable.__executable) {
      // Convert the __executable object to a proper ExecutableVariable
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      variable = createExecutableVariable(
        commandName,
        'command', // Default type - the real type is in executableDef
        '', // Empty template - the real template is in executableDef
        variable.paramNames || [],
        undefined, // No language here - it's in executableDef
        {
          directive: 'exe',
          syntax: 'braces',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          executableDef: variable.executableDef,
          ...variable.metadata
        }
      );
    }
  } else {
    // Regular command lookup
    variable = env.getVariable(commandName);
    if (!variable) {
      throw new MlldInterpreterError(`Command not found: ${commandName}`);
    }
  }
  
  // Ensure it's an executable variable
  if (!isExecutableVariable(variable)) {
    throw new MlldInterpreterError(`Variable ${commandName} is not executable (type: ${variable.type})`);
  }
  
  // Special handling for built-in transformers
  if (variable.metadata?.isBuiltinTransformer && variable.metadata?.transformerImplementation) {
    // Get command arguments from the node
    const args = node.commandRef.args || [];
    
    // Evaluate the first argument to get the input value
    let inputValue = '';
    if (args.length > 0) {
      const arg = args[0];
      if (typeof arg === 'string') {
        inputValue = arg;
      } else if (arg && typeof arg === 'object') {
        inputValue = await interpolate([arg], env);
      } else {
        inputValue = String(arg);
      }
    }
    
    // Call the transformer implementation directly
    const result = await variable.metadata.transformerImplementation(inputValue);
    
    // Apply withClause transformations if present
    if (node.withClause) {
      return applyWithClause(String(result), node.withClause, env);
    }
    
    return {
      value: String(result),
      env,
      stdout: String(result),
      stderr: '',
      exitCode: 0
    };
  }
  
  // Get the full executable definition from metadata
  const definition = variable.metadata?.executableDef as ExecutableDefinition;
  if (!definition) {
    throw new MlldInterpreterError(`Executable ${commandName} has no definition in metadata`);
  }
  
  // Create a child environment for parameter substitution
  const execEnv = env.createChild();
  
  // Handle command arguments
  const args = node.commandRef.args || [];
  const params = definition.paramNames || [];
  
  // Evaluate arguments using consistent interpolate() pattern
  const evaluatedArgStrings: string[] = [];
  const evaluatedArgs: any[] = []; // Preserve original data types
  
  for (const arg of args) {
    let argValue: string;
    let argValueAny: any;
    
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      // Primitives: pass through directly
      argValue = String(arg);
      argValueAny = arg;
      
    } else if (arg && typeof arg === 'object' && 'type' in arg) {
      // AST nodes: evaluate based on type
      switch (arg.type) {
        case 'object':
          // Object literals: recursively evaluate properties (may contain exec invocations, etc.)
          const { evaluateDataValue } = await import('./data-value-evaluator');
          argValueAny = await evaluateDataValue(arg, env);
          argValue = JSON.stringify(argValueAny);
          break;
          
        case 'array':
          // Array literals: recursively evaluate items (may contain variables, exec calls, etc.)
          const { evaluateDataValue: evalArray } = await import('./data-value-evaluator');
          argValueAny = await evalArray(arg, env);
          argValue = JSON.stringify(argValueAny);
          break;
          
        case 'VariableReference':
          // Special handling for variable references to preserve objects
          const varRef = arg as any;
          const varName = varRef.identifier;
          const variable = env.getVariable(varName);
          
          if (variable) {
            // Get the actual value from the variable
            let value = variable.value;
            
            // Handle field access (e.g., @user.name)
            if (varRef.fields && varRef.fields.length > 0) {
              // Navigate through nested fields
              for (const field of varRef.fields) {
                if (value && typeof value === 'object' && (field.type === 'field' || field.type === 'numericField')) {
                  // Handle object field access (including numeric fields)
                  value = value[field.value];
                } else if (Array.isArray(value) && (field.type === 'index' || field.type === 'arrayIndex')) {
                  // Handle array index access
                  const index = parseInt(field.value, 10);
                  value = isNaN(index) ? undefined : value[index];
                } else {
                  // Field not found or invalid access
                  value = undefined;
                  break;
                }
              }
            }
            
            // Preserve the type of the final value
            argValueAny = value;
            argValue = value === undefined ? 'undefined' : String(value);
          } else {
            // Variable not found - use interpolation which will throw appropriate error
            argValue = await interpolate([arg], env, InterpolationContext.Default);
            argValueAny = argValue;
          }
          break;
          
        case 'ExecInvocation':
        case 'Text':
        default:
          // Other nodes: interpolate normally
          argValue = await interpolate([arg], env, InterpolationContext.Default);
          // Try to preserve structured data if it's JSON
          try {
            argValueAny = JSON.parse(argValue);
          } catch {
            argValueAny = argValue;
          }
          break;
      }
    } else {
      // Fallback for unexpected types
      argValue = String(arg);
      argValueAny = arg;
    }
    
    evaluatedArgStrings.push(argValue);
    evaluatedArgs.push(argValueAny);
  }
  
  // Track original Variables for arguments
  const originalVariables: (any | undefined)[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg && typeof arg === 'object' && 'type' in arg && arg.type === 'VariableReference') {
      const varRef = arg as any;
      const varName = varRef.identifier;
      const variable = env.getVariable(varName);
      if (variable && !varRef.fields) {
        // Only preserve if no field access
        originalVariables[i] = variable;
        
        if (process.env.MLLD_DEBUG === 'true') {
          const subtype = variable.type === 'primitive' && 'primitiveType' in variable 
            ? (variable as any).primitiveType 
            : variable.subtype;
            
          logger.debug(`Preserving original Variable for arg ${i}:`, {
            varName,
            variableType: variable.type,
            variableSubtype: subtype,
            isPrimitive: typeof variable.value !== 'object' || variable.value === null
          });
        }
      }
    }
  }
  
  // Bind evaluated arguments to parameters
  for (let i = 0; i < params.length; i++) {
    const paramName = params[i];
    const argValue = evaluatedArgs[i]; // Use the preserved type value
    const argStringValue = evaluatedArgStrings[i];
    
    if (argValue !== undefined) {
      let paramVar;
      
      // Check if we have the original Variable
      const originalVar = originalVariables[i];
      if (originalVar) {
        // Use the original Variable directly, just update the name
        paramVar = {
          ...originalVar,
          name: paramName,
          metadata: {
            ...originalVar.metadata,
            isSystem: true,
            isParameter: true
          }
        };
        
        if (process.env.MLLD_DEBUG === 'true') {
          const subtype = paramVar.type === 'primitive' && 'primitiveType' in paramVar 
            ? (paramVar as any).primitiveType 
            : paramVar.subtype;
            
          logger.debug(`Using original Variable for param ${paramName}:`, {
            type: paramVar.type,
            subtype: subtype,
            hasMetadata: !!paramVar.metadata
          });
        }
      }
      // Create appropriate variable type based on actual data
      else if (typeof argValue === 'object' && argValue !== null && !Array.isArray(argValue)) {
        // Object type - preserve structure
        paramVar = createObjectVariable(
          paramName,
          argValue,
          true, // isComplex = true for objects from parameters
          {
            directive: 'var',
            syntax: 'object',
            hasInterpolation: false,
            isMultiLine: false
          },
          {
            isSystem: true,
            isParameter: true
          }
        );
      } else if (Array.isArray(argValue)) {
        // Array type - preserve structure
        paramVar = createArrayVariable(
          paramName,
          argValue,
          true, // isComplex = true for arrays from parameters
          {
            directive: 'var',
            syntax: 'array',
            hasInterpolation: false,
            isMultiLine: false
          },
          {
            isSystem: true,
            isParameter: true
          }
        );
      } else {
        // Primitive types - use string representation
        paramVar = createSimpleTextVariable(
          paramName, 
          argStringValue,
          {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          },
          {
            isSystem: true,
            isParameter: true
          }
        );
      }
      
      execEnv.setParameterVariable(paramName, paramVar);
    }
  }
  
  let result: string;
  
  // Handle template executables
  if (isTemplateExecutable(definition)) {
    // Interpolate the template with the bound parameters
    result = await interpolate(definition.template, execEnv);
  }
  // Handle command executables
  else if (isCommandExecutable(definition)) {
    // Interpolate the command template with parameters
    const command = await interpolate(definition.commandTemplate, execEnv);
    
    if (process.env.DEBUG_WHEN || process.env.DEBUG_EXEC) {
      logger.debug('Executing command', {
        command,
        commandTemplate: definition.commandTemplate
      });
    }
    
    // Build environment variables from parameters for shell execution
    const envVars: Record<string, string> = {};
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgStrings[i]; // Use string version for env vars
      if (argValue !== undefined) {
        envVars[paramName] = String(argValue);
      }
    }
    
    // Execute the command with environment variables
    const commandOutput = await execEnv.executeCommand(command, { env: envVars });
    
    // Try to parse as JSON if it looks like JSON
    if (typeof commandOutput === 'string' && commandOutput.trim()) {
      const trimmed = commandOutput.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          result = JSON.parse(trimmed);
        } catch {
          // Not valid JSON, use as-is
          result = commandOutput;
        }
      } else {
        result = commandOutput;
      }
    } else {
      result = commandOutput;
    }
  }
  // Handle code executables
  else if (isCodeExecutable(definition)) {
    // Interpolate the code template with parameters
    const code = await interpolate(definition.codeTemplate, execEnv);
    
    // Import ASTEvaluator for normalizing array values
    const { ASTEvaluator } = await import('../core/ast-evaluator');
    
    // Build params object for code execution
    const codeParams: Record<string, any> = {};
    const variableMetadata: Record<string, any> = {};
    
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      
      // Check if this parameter is a pipeline input variable
      const paramVar = execEnv.getVariable(paramName);
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Checking parameter:', {
          paramName,
          hasParamVar: !!paramVar,
          paramVarType: paramVar?.type,
          isPipelineInput: paramVar?.type === 'pipeline-input'
        });
      }
      if (paramVar && paramVar.type === 'pipeline-input') {
        // Pass the pipeline input object directly for code execution
        codeParams[paramName] = paramVar.value;
      } else if (isEnhancedVariablePassingEnabled() && paramVar) {
        // Enhanced mode: Pass Variable as proxy to shadow environment
        codeParams[paramName] = prepareValueForShadow(paramVar);
        
        // Store metadata for primitives that can't be proxied
        if (paramVar.value === null || typeof paramVar.value !== 'object') {
          // Handle PrimitiveVariable which has primitiveType instead of subtype
          const subtype = paramVar.type === 'primitive' && 'primitiveType' in paramVar 
            ? (paramVar as any).primitiveType 
            : paramVar.subtype;
          
          variableMetadata[paramName] = {
            type: paramVar.type,
            subtype: subtype,
            metadata: paramVar.metadata,
            isVariable: true
          };
        }
        
        if (process.env.DEBUG_EXEC || process.env.MLLD_DEBUG === 'true') {
          const subtype = paramVar.type === 'primitive' && 'primitiveType' in paramVar 
            ? (paramVar as any).primitiveType 
            : paramVar.subtype;
            
          logger.debug(`Enhanced Variable passing for ${paramName}:`, {
            variableType: paramVar.type,
            variableSubtype: subtype,
            hasMetadata: !!paramVar.metadata,
            isPrimitive: paramVar.value === null || typeof paramVar.value !== 'object',
            enhancedMode: true
          });
        }
      } else if (paramVar && paramVar.metadata?.actualValue !== undefined) {
        // Use the actual value from the parameter variable if available
        // Normalize arrays to ensure plain JavaScript values
        const actualValue = paramVar.metadata.actualValue;
        codeParams[paramName] = await ASTEvaluator.evaluateToRuntime(actualValue, execEnv);
        
        // Debug primitive values
        if (process.env.DEBUG_EXEC) {
          logger.debug(`Using actualValue for ${paramName}:`, {
            actualValue: paramVar.metadata.actualValue,
            type: typeof paramVar.metadata.actualValue
          });
        }
      } else {
        // Use the evaluated argument value directly - this preserves primitives
        const argValue = evaluatedArgs[i];
        // Normalize arrays to ensure plain JavaScript values
        codeParams[paramName] = await ASTEvaluator.evaluateToRuntime(argValue, execEnv);
        
        // Debug primitive values
        if (process.env.DEBUG_EXEC) {
          logger.debug(`Code parameter ${paramName}:`, {
            argValue,
            type: typeof argValue,
            isNumber: typeof argValue === 'number',
            evaluatedArgs_i: evaluatedArgs[i],
            evaluatedArgStrings_i: evaluatedArgStrings[i]
          });
        }
      }
    }
    
    // Execute the code with parameters and metadata
    const codeResult = await execEnv.executeCode(
      code,
      definition.language || 'javascript',
      codeParams,
      isEnhancedVariablePassingEnabled() && Object.keys(variableMetadata).length > 0 ? variableMetadata : undefined
    );
    
    // If the result looks like JSON (from return statement), parse it
    if (typeof codeResult === 'string' && 
        (codeResult.startsWith('"') || codeResult.startsWith('{') || codeResult.startsWith('[') || 
         codeResult === 'null' || codeResult === 'true' || codeResult === 'false' ||
         /^-?\d+(\.\d+)?$/.test(codeResult))) {
      try {
        const parsed = JSON.parse(codeResult);
        // Keep the parsed value as the result
        result = parsed;
      } catch {
        // Not valid JSON, use as-is
        result = codeResult;
      }
    } else {
      result = codeResult;
    }
  }
  // Handle command reference executables
  else if (isCommandRefExecutable(definition)) {
    const refName = definition.commandRef;
    if (!refName) {
      throw new MlldInterpreterError(`Command reference ${commandName} has no target command`);
    }
    
    // Look up the referenced command
    const refCommand = env.getVariable(refName);
    if (!refCommand) {
      throw new MlldInterpreterError(`Referenced command not found: ${refName}`);
    }
    
    // Create a new invocation node for the referenced command
    const refInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: refName,
        args: evaluatedArgs.map(arg => ({
          type: 'Text',
          content: arg
        }))
      }
    };
    
    // Recursively evaluate the referenced command
    const refResult = await evaluateExecInvocation(refInvocation, env);
    result = refResult.value as string;
  }
  // Handle section executables
  else if (isSectionExecutable(definition)) {
    // Interpolate the path template to get the file path
    const filePath = await interpolate(definition.pathTemplate, execEnv);
    
    // Interpolate the section template to get the section name
    const sectionName = await interpolate(definition.sectionTemplate, execEnv);
    
    // Read the file content
    const fileContent = await execEnv.readFile(filePath);
    
    // Extract the section using llmxml or fallback to basic extraction
    const llmxmlInstance = env.getLlmxml();
    let sectionContent: string;
    
    try {
      // getSection expects just the title without the # prefix
      const titleWithoutHash = sectionName.replace(/^#+\s*/, '');
      sectionContent = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
        includeNested: true
      });
    } catch (error) {
      // Fallback to basic extraction if llmxml fails
      sectionContent = extractSection(fileContent, sectionName);
    }
    
    // Handle rename if present
    if (definition.renameTemplate) {
      const newTitle = await interpolate(definition.renameTemplate, execEnv);
      const lines = sectionContent.split('\n');
      if (lines.length > 0 && lines[0].match(/^#+\s/)) {
        const newTitleTrimmed = newTitle.trim();
        const newHeadingMatch = newTitleTrimmed.match(/^(#+)(\s+(.*))?$/);
        
        if (newHeadingMatch) {
          if (!newHeadingMatch[3]) {
            // Just header level
            const originalText = lines[0].replace(/^#+\s*/, '');
            lines[0] = `${newHeadingMatch[1]} ${originalText}`;
          } else {
            // Full replacement
            lines[0] = newTitleTrimmed;
          }
        } else {
          // Just text - keep original level
          const originalLevel = lines[0].match(/^#+/)?.[0] || '#';
          lines[0] = `${originalLevel} ${newTitleTrimmed}`;
        }
        
        sectionContent = lines.join('\n');
      }
    }
    
    result = sectionContent;
  }
  // Handle resolver executables
  else if (isResolverExecutable(definition)) {
    // For resolver executables, we need to construct the full resolver path
    // with parameter interpolation
    let resolverPath = definition.resolverPath;
    
    // Replace parameter placeholders in the resolver path
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgs[i];
      if (argValue !== undefined) {
        // Replace @paramName in the resolver path
        resolverPath = resolverPath.replace(new RegExp(`@${paramName}\\b`, 'g'), argValue);
      }
    }
    
    // Prepare payload if present
    let payload: any = undefined;
    if (definition.payloadTemplate) {
      // Interpolate the payload template
      const payloadStr = await interpolate(definition.payloadTemplate, execEnv);
      try {
        // Try to parse as JSON
        payload = JSON.parse(payloadStr);
      } catch {
        // If not valid JSON, use as string
        payload = payloadStr;
      }
    }
    
    // Invoke the resolver through the ResolverManager
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      throw new MlldInterpreterError('Resolver manager not available');
    }
    
    // Resolve the resolver with the appropriate context
    const resolverResult = await resolverManager.resolve(resolverPath, {
      context: 'exec-invocation',
      basePath: env.getBasePath(),
      payload
    });
    
    // Extract content from resolver result
    if (resolverResult && typeof resolverResult === 'object' && 'content' in resolverResult) {
      // ResolverContent interface
      result = resolverResult.content;
    } else if (typeof resolverResult === 'string') {
      result = resolverResult;
    } else if (resolverResult && typeof resolverResult === 'object') {
      // For objects, serialize to JSON
      result = JSON.stringify(resolverResult, null, 2);
    } else {
      result = String(resolverResult);
    }
  } else {
    throw new MlldInterpreterError(`Unknown executable type: ${(definition as any).type}`);
  }
  
  // Apply withClause transformations if present
  if (node.withClause) {
    // applyWithClause expects a string input
    const stringResult = typeof result === 'string' ? result : JSON.stringify(result);
    return applyWithClause(stringResult, node.withClause, env);
  }
  
  return {
    value: result,
    env,
    // For stdout, convert the parsed value back to string for backward compatibility
    // but preserve the actual value in the value field for truthiness checks
    stdout: typeof result === 'string' ? result : 
            (typeof result === 'object' && result !== null ? JSON.stringify(result) : String(result)),
    stderr: '',
    exitCode: 0
  };
}