import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { isCommandExecutable, isCodeExecutable, isTemplateExecutable, isCommandRefExecutable, isSectionExecutable, isResolverExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { isExecutableVariable, createSimpleTextVariable, createObjectVariable, createArrayVariable, createPrimitiveVariable } from '@core/types/variable';
import { applyWithClause } from './with-clause';
import { MlldInterpreterError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { extractSection } from './show';
import { prepareValueForShadow } from '../env/variable-proxy';
import type { ShadowEnvironmentCapture } from '../env/types/ShadowEnvironmentCapture';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';

/**
 * Auto-unwrap LoadContentResult objects to their content property
 * WHY: LoadContentResult objects should behave like their content when passed to JS functions,
 * maintaining consistency with how they work in mlld contexts (interpolation, display, etc).
 * GOTCHA: LoadContentResultArray objects are unwrapped to arrays of content strings.
 * @param value - The value to potentially unwrap
 * @returns The unwrapped content or the original value
 */
function autoUnwrapLoadContent(value: any): any {
  // Handle single LoadContentResult
  if (isLoadContentResult(value)) {
    return value.content;
  }
  
  // Handle LoadContentResultArray - unwrap to array of content strings
  if (isLoadContentResultArray(value)) {
    return value.map(item => item.content);
  }
  
  // Return original value if not a LoadContentResult
  return value;
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
  
  // Get the command name from the command reference or legacy format
  let commandName: string;
  let args: any[] = [];
  
  // Handle legacy format where name and arguments are directly on the node
  if (!node.commandRef && (node as any).name) {
    commandName = (node as any).name;
    args = (node as any).arguments || [];
  } else if (node.commandRef) {
    // Handle new format with commandRef
    if ((node.commandRef as any).name) {
      commandName = (node.commandRef as any).name;
      args = node.commandRef.args || [];
    } else if (typeof node.commandRef.identifier === 'string') {
      // If identifier is a string, use it directly
      commandName = node.commandRef.identifier;
      args = node.commandRef.args || [];
    } else if (Array.isArray((node.commandRef as any).identifier) && (node.commandRef as any).identifier.length > 0) {
      // If identifier is an array, extract from the first node
      const identifierNode = (node.commandRef as any).identifier[0];
      if (identifierNode.type === 'VariableReference' && identifierNode.identifier) {
        commandName = identifierNode.identifier as string;
      } else if (identifierNode.type === 'Text' && identifierNode.content) {
        commandName = identifierNode.content;
      } else {
        throw new Error('Unable to extract command name from identifier array');
      }
      args = node.commandRef.args || [];
    } else {
      throw new Error('CommandReference missing both name and identifier');
    }
  } else {
    throw new Error('ExecInvocation node missing both commandRef and name');
  }
  
  if (!commandName) {
    throw new MlldInterpreterError('ExecInvocation has no command identifier');
  }
  
  // Check if this is a field access exec invocation (e.g., @demo.valueCmd())
  let variable;
  const commandRefWithObject = node.commandRef as any & { objectReference?: any }; // Type assertion to handle objectReference
  if (node.commandRef && commandRefWithObject.objectReference) {
    // Get the object first
    const objectRef = commandRefWithObject.objectReference;
    const objectVar = env.getVariable(objectRef.identifier);
    if (!objectVar) {
      throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
    }
    
    // Extract Variable value for object field access - WHY: Need raw object to access fields
    const { extractVariableValue } = await import('../utils/variable-resolution');
    const objectValue = await extractVariableValue(objectVar, env);
    
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
      // Deserialize shadow environments if needed
      let metadata = variable.metadata || {};
      if (metadata.capturedShadowEnvs && typeof metadata.capturedShadowEnvs === 'object') {
        // Check if it needs deserialization (is plain object, not Map)
        const needsDeserialization = Object.entries(metadata.capturedShadowEnvs).some(
          ([lang, env]) => env && !(env instanceof Map)
        );
        
        if (needsDeserialization) {
          metadata = {
            ...metadata,
            capturedShadowEnvs: deserializeShadowEnvs(metadata.capturedShadowEnvs)
          };
        }
      }
      
      if (process.env.DEBUG_MODULE_EXPORT || process.env.DEBUG_EXEC) {
        console.error('[DEBUG] Converting __executable object to ExecutableVariable:', {
          commandName,
          hasMetadata: !!metadata,
          hasCapturedEnvs: !!(metadata.capturedShadowEnvs),
          metadata
        });
      }
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
          ...metadata
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
    // Args were already extracted above
    
    // Special handling for @typeof - we need the Variable object, not just the value
    if (commandName === 'typeof' || commandName === 'TYPEOF') {
      if (args.length > 0) {
        const arg = args[0];
        
        // Check if it's a variable reference
        if (arg && typeof arg === 'object' && 'type' in arg && arg.type === 'VariableReference') {
          const varRef = arg as any;
          const varName = varRef.identifier;
          const varObj = env.getVariable(varName);
          
          if (varObj) {
            // Generate type information from the Variable object
            let typeInfo = varObj.type;
            
            // Handle subtypes for text variables
            if (varObj.type === 'simple-text' && 'subtype' in varObj) {
              // For simple-text, show the main type unless it has a special subtype
              const subtype = (varObj as any).subtype;
              if (subtype && subtype !== 'simple' && subtype !== 'interpolated-text') {
                typeInfo = subtype;
              }
            } else if (varObj.type === 'primitive' && 'primitiveType' in varObj) {
              typeInfo = `primitive (${(varObj as any).primitiveType})`;
            } else if (varObj.type === 'object') {
              const objValue = varObj.value;
              if (objValue && typeof objValue === 'object') {
                const keys = Object.keys(objValue);
                typeInfo = `object (${keys.length} properties)`;
              }
            } else if (varObj.type === 'array') {
              const arrValue = varObj.value;
              if (Array.isArray(arrValue)) {
                typeInfo = `array (${arrValue.length} items)`;
              }
            } else if (varObj.type === 'executable') {
              // Get executable type from metadata
              const execDef = varObj.metadata?.executableDef;
              if (execDef && 'type' in execDef) {
                typeInfo = `executable (${execDef.type})`;
              }
            }
            
            // Add source information if available
            if (varObj.source?.directive) {
              typeInfo += ` [from /${varObj.source.directive}]`;
            }
            
            // Pass the type info with a special marker
            const result = await variable.metadata.transformerImplementation(`__MLLD_VARIABLE_OBJECT__:${typeInfo}`);
            
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
        }
      }
    }
    
    // Regular transformer handling
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
  
  // Handle command arguments - args were already extracted above
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
            // For objects and arrays, use JSON.stringify to get proper string representation
            if (value === undefined) {
              argValue = 'undefined';
            } else if (typeof value === 'object' && value !== null) {
              try {
                argValue = JSON.stringify(value);
              } catch (e) {
                argValue = String(value);
              }
            } else {
              argValue = String(value);
            }
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
        // Primitive types - create appropriate Variable type
        if (typeof argValue === 'number' || typeof argValue === 'boolean' || argValue === null) {
          // Create PrimitiveVariable for number, boolean, null
          paramVar = createPrimitiveVariable(
            paramName,
            argValue,
            {
              directive: 'var',
              syntax: 'literal',
              hasInterpolation: false,
              isMultiLine: false
            },
            {
              isSystem: true,
              isParameter: true
            }
          );
        } else {
          // String or other types - use SimpleTextVariable
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
      
      // Properly serialize proxy objects for execution
      const paramVar = execEnv.getVariable(paramName);
      if (paramVar && typeof paramVar.value === 'object' && paramVar.value !== null) {
        // For objects and arrays, use JSON serialization
        try {
          envVars[paramName] = JSON.stringify(paramVar.value);
        } catch (e) {
          // Fallback to string version if JSON serialization fails
          envVars[paramName] = evaluatedArgStrings[i];
        }
      } else {
        // For primitives and other types, use the string version
        envVars[paramName] = evaluatedArgStrings[i];
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
    // Special handling for mlld-when expressions
    if (definition.language === 'mlld-when') {
      // The codeTemplate contains the WhenExpression node
      const whenExprNode = definition.codeTemplate[0];
      if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
        throw new MlldInterpreterError('mlld-when executable missing WhenExpression node');
      }
      
      // Evaluate the when expression with the parameter environment
      const { evaluateWhenExpression } = await import('./when-expression');
      const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
      result = whenResult.value;
    } else {
      // For bash/sh, don't interpolate the code template - bash handles its own variable substitution
      let code: string;
      if (definition.language === 'bash' || definition.language === 'sh') {
        // For bash/sh, just extract the raw code without interpolation
        if (Array.isArray(definition.codeTemplate)) {
          // If it's an array of nodes, concatenate their content
          code = definition.codeTemplate.map(node => {
            if (typeof node === 'string') return node;
            if (node && typeof node === 'object' && 'content' in node) return node.content || '';
            return '';
          }).join('');
        } else if (typeof definition.codeTemplate === 'string') {
          code = definition.codeTemplate;
        } else {
          code = '';
        }
      } else {
        // For other languages (JS, Python), interpolate as before
        code = await interpolate(definition.codeTemplate, execEnv);
      }
      
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
      } else if (paramVar) {
        // Always use enhanced Variable passing
        if (definition.language === 'bash' || definition.language === 'sh') {
          // Bash/sh get simple values - the BashExecutor will handle conversion
          // Just pass the Variable or proxy as-is, let the executor adapt it
          codeParams[paramName] = prepareValueForShadow(paramVar);
        } else {
          // Other languages (JS, Python) get proxies for rich type info
          // But first, check if it's a complex Variable that needs resolution
          if ((paramVar as any).isComplex && paramVar.value && typeof paramVar.value === 'object' && 'type' in paramVar.value) {
            // Complex Variable with AST - extract value - WHY: Shadow environments need evaluated values
            const { extractVariableValue: extractVal } = await import('../utils/variable-resolution');
            const resolvedValue = await extractVal(paramVar, execEnv);
            const resolvedVar = {
              ...paramVar,
              value: resolvedValue,
              isComplex: false
            };
            codeParams[paramName] = prepareValueForShadow(resolvedVar);
          } else {
            // Auto-unwrap LoadContentResult objects for JS/Python
            const unwrappedValue = autoUnwrapLoadContent(paramVar.value);
            if (unwrappedValue !== paramVar.value) {
              // Value was unwrapped, create a new variable with the unwrapped content
              const unwrappedVar = {
                ...paramVar,
                value: unwrappedValue,
                // Update type based on unwrapped value
                type: Array.isArray(unwrappedValue) ? 'array' : 'text'
              };
              codeParams[paramName] = prepareValueForShadow(unwrappedVar);
            } else {
              // No unwrapping needed, use original
              codeParams[paramName] = prepareValueForShadow(paramVar);
            }
          }
        }
        
        // Store metadata for primitives that can't be proxied (only for non-bash languages)
        if ((definition.language !== 'bash' && definition.language !== 'sh') && 
            (paramVar.value === null || typeof paramVar.value !== 'object')) {
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
            
          logger.debug(`Variable passing for ${paramName}:`, {
            variableType: paramVar.type,
            variableSubtype: subtype,
            hasMetadata: !!paramVar.metadata,
            isPrimitive: paramVar.value === null || typeof paramVar.value !== 'object',
            language: definition.language
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
    
    // NEW: Pass captured shadow environments for JS/Node execution
    const capturedEnvs = variable.metadata?.capturedShadowEnvs;
    if (capturedEnvs && (definition.language === 'js' || definition.language === 'javascript' || 
                         definition.language === 'node' || definition.language === 'nodejs')) {
      (codeParams as any).__capturedShadowEnvs = capturedEnvs;
      
      if (process.env.DEBUG_MODULE_EXPORT || process.env.DEBUG_EXEC) {
        console.error('[DEBUG] exec-invocation passing shadow envs:', {
          commandName,
          hasCapturedEnvs: !!capturedEnvs,
          capturedEnvs,
          language: definition.language
        });
      }
    }
    
    // Execute the code with parameters and metadata
    const codeResult = await execEnv.executeCode(
      code,
      definition.language || 'javascript',
      codeParams,
      Object.keys(variableMetadata).length > 0 ? variableMetadata : undefined
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

/**
 * Deserialize shadow environments after import (objects to Maps)
 * WHY: Shadow environments are expected as Maps internally
 */
function deserializeShadowEnvs(envs: any): ShadowEnvironmentCapture {
  const result: ShadowEnvironmentCapture = {};
  
  for (const [lang, shadowObj] of Object.entries(envs)) {
    if (shadowObj && typeof shadowObj === 'object') {
      // Convert object to Map
      const map = new Map<string, any>();
      for (const [name, func] of Object.entries(shadowObj)) {
        map.set(name, func);
      }
      result[lang as keyof ShadowEnvironmentCapture] = map;
    }
  }
  
  return result;
}