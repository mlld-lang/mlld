import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { isCommandExecutable, isCodeExecutable, isTemplateExecutable, isCommandRefExecutable, isSectionExecutable, isResolverExecutable, isPipelineExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { isExecutableVariable, createSimpleTextVariable, createObjectVariable, createArrayVariable, createPrimitiveVariable } from '@core/types/variable';
import { applyWithClause } from './with-clause';
import { checkDependencies, DefaultDependencyChecker } from './dependencies';
import { MlldInterpreterError, MlldCommandExecutionError } from '@core/errors';
import { CommandUtils } from '../env/CommandUtils';
import { logger } from '@core/utils/logger';
import { extractSection } from './show';
import { prepareValueForShadow } from '../env/variable-proxy';
import type { ShadowEnvironmentCapture } from '../env/types/ShadowEnvironmentCapture';
import { isLoadContentResult, isLoadContentResultArray, LoadContentResult } from '@core/types/load-content';
import { AutoUnwrapManager } from './auto-unwrap-manager';

/**
 * Coerce a value to a string for stdin input
 * Copied from run.ts to avoid export dependencies
 */
function coerceStdinString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Resolve stdin input from expression
 * Copied from run.ts to avoid export dependencies
 */
async function resolveStdinInput(stdinSource: unknown, env: Environment): Promise<string> {
  if (stdinSource === null || stdinSource === undefined) {
    return '';
  }

  const { evaluate } = await import('../core/interpreter');
  const result = await evaluate(stdinSource as any, env, { isExpression: true });
  let value = result.value;

  const { isVariable, resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.CommandExecution);
  }

  return coerceStdinString(value);
}

/**
 * Simple metadata shelf for preserving LoadContentResult metadata
 * This is a module-level implementation that works for synchronous operations
 */
class SimpleMetadataShelf {
  private shelf: Map<string, LoadContentResult> = new Map();
  
  storeMetadata(value: any): void {
    if (isLoadContentResultArray(value)) {
      for (const item of value) {
        if (isLoadContentResult(item)) {
          this.shelf.set(item.content, item);
        }
      }
    } else if (isLoadContentResult(value)) {
      this.shelf.set(value.content, value);
    }
  }
  
  restoreMetadata(value: any): any {
    if (!Array.isArray(value)) return value;
    
    const restored: any[] = [];
    let hasRestorable = false;
    
    for (const item of value) {
      if (typeof item === 'string' && this.shelf.has(item)) {
        restored.push(this.shelf.get(item));
        hasRestorable = true;
      } else {
        restored.push(item);
      }
    }
    
    return hasRestorable ? restored : value;
  }
  
  clear(): void {
    this.shelf.clear();
  }
}

// Module-level shelf instance
const metadataShelf = new SimpleMetadataShelf();

/**
 * Evaluate an ExecInvocation node
 * This executes a previously defined exec command with arguments and optional tail modifiers
 */
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[evaluateExecInvocation] Entry:', {
      hasCommandRef: !!node.commandRef,
      hasWithClause: !!node.withClause,
      hasPipeline: !!(node.withClause?.pipeline),
      pipelineLength: node.withClause?.pipeline?.length
    });
  }

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
  
  // Check if this is a field access exec invocation (e.g., @obj.method())
  // or a method call on an exec result (e.g., @func(args).method())
  let variable;
  const commandRefWithObject = node.commandRef as any & { objectReference?: any; objectSource?: ExecInvocation };
  if (node.commandRef && (commandRefWithObject.objectReference || commandRefWithObject.objectSource)) {
    // Check if this is a builtin method call (e.g., @list.includes())
    const builtinMethods = ['includes', 'length', 'indexOf', 'join', 'split', 'toLowerCase', 'toUpperCase', 'trim', 'startsWith', 'endsWith'];
    if (builtinMethods.includes(commandName)) {
      // Handle builtin methods on objects/arrays/strings
      let objectValue: any;

      if (commandRefWithObject.objectReference) {
        const objectRef = commandRefWithObject.objectReference;
        const objectVar = env.getVariable(objectRef.identifier);
        if (!objectVar) {
          throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
        }
        // Extract the value from the variable reference
        const { extractVariableValue } = await import('../utils/variable-resolution');
        objectValue = await extractVariableValue(objectVar, env);

        // Navigate through fields if present
        if (objectRef.fields && objectRef.fields.length > 0) {
          for (const field of objectRef.fields) {
            if (typeof objectValue === 'object' && objectValue !== null) {
              objectValue = (objectValue as any)[field.value];
            } else {
              throw new MlldInterpreterError(`Cannot access field ${field.value} on non-object`);
            }
          }
        }
      } else if (commandRefWithObject.objectSource) {
        // Evaluate the source ExecInvocation to obtain a value, then apply builtin method
        const srcResult = await evaluateExecInvocation(commandRefWithObject.objectSource, env);
        if (srcResult && typeof srcResult === 'object') {
          if (srcResult.value !== undefined) {
            const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
            objectValue = await resolveValue(srcResult.value, env, ResolutionContext.Default);
          } else if (typeof srcResult.stdout === 'string') {
            objectValue = srcResult.stdout;
          }
        }
      }

      // Fallback if we still don't have an object value
      if (typeof objectValue === 'undefined') {
        throw new MlldInterpreterError('Unable to resolve object value for builtin method invocation');
      }
      
      // Evaluate arguments
      const evaluatedArgs: any[] = [];
      for (const arg of args) {
        const { evaluateDataValue } = await import('./data-value-evaluator');
        const evaluatedArg = await evaluateDataValue(arg, env);
        evaluatedArgs.push(evaluatedArg);
      }
      
      // Apply the builtin method
      let result: any;
      switch (commandName) {
        case 'includes':
          if (Array.isArray(objectValue) || typeof objectValue === 'string') {
            result = objectValue.includes(evaluatedArgs[0]);
          } else {
            throw new MlldInterpreterError(`Cannot call .includes() on ${typeof objectValue}`);
          }
          break;
        case 'length':
          if (Array.isArray(objectValue) || typeof objectValue === 'string') {
            result = objectValue.length;
          } else {
            throw new MlldInterpreterError(`Cannot call .length() on ${typeof objectValue}`);
          }
          break;
        case 'indexOf':
          if (Array.isArray(objectValue) || typeof objectValue === 'string') {
            result = objectValue.indexOf(evaluatedArgs[0]);
          } else {
            throw new MlldInterpreterError(`Cannot call .indexOf() on ${typeof objectValue}`);
          }
          break;
        case 'join':
          if (Array.isArray(objectValue)) {
            result = objectValue.join(evaluatedArgs[0] || ',');
          } else {
            throw new MlldInterpreterError(`Cannot call .join() on ${typeof objectValue}`);
          }
          break;
        case 'split':
          if (typeof objectValue === 'string') {
            result = objectValue.split(evaluatedArgs[0] || '');
          } else {
            throw new MlldInterpreterError(`Cannot call .split() on ${typeof objectValue}`);
          }
          break;
        case 'toLowerCase':
          if (typeof objectValue === 'string') {
            result = objectValue.toLowerCase();
          } else {
            throw new MlldInterpreterError(`Cannot call .toLowerCase() on ${typeof objectValue}`);
          }
          break;
        case 'toUpperCase':
          if (typeof objectValue === 'string') {
            result = objectValue.toUpperCase();
          } else {
            throw new MlldInterpreterError(`Cannot call .toUpperCase() on ${typeof objectValue}`);
          }
          break;
        case 'trim':
          if (typeof objectValue === 'string') {
            result = objectValue.trim();
          } else {
            throw new MlldInterpreterError(`Cannot call .trim() on ${typeof objectValue}`);
          }
          break;
        case 'startsWith':
          if (typeof objectValue === 'string') {
            result = objectValue.startsWith(evaluatedArgs[0]);
          } else {
            throw new MlldInterpreterError(`Cannot call .startsWith() on ${typeof objectValue}`);
          }
          break;
        case 'endsWith':
          if (typeof objectValue === 'string') {
            result = objectValue.endsWith(evaluatedArgs[0]);
          } else {
            throw new MlldInterpreterError(`Cannot call .endsWith() on ${typeof objectValue}`);
          }
          break;
        default:
          throw new MlldInterpreterError(`Unknown builtin method: ${commandName}`);
      }
      
      // Apply post-invocation fields if present (e.g., @str.split(',')[1])
      const postFieldsBuiltin: any[] = (node as any).fields || [];
      if (postFieldsBuiltin && postFieldsBuiltin.length > 0) {
        const { accessField } = await import('../utils/field-access');
        for (const f of postFieldsBuiltin) {
          result = await accessField(result, f, { env, sourceLocation: node.location });
        }
      }
      
      // If a withClause (e.g., pipeline) is attached to this builtin invocation, apply it
      if (node.withClause) {
        if (node.withClause.pipeline) {
          const { processPipeline } = await import('./pipeline/unified-processor');
          const pipelineResult = await processPipeline({
            value: String(result),
            env,
            node,
            identifier: node.identifier
          });
          // Still need to handle other withClause features (trust, needs)
          return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, env);
        } else {
          return applyWithClause(String(result), node.withClause, env);
        }
      }

      // Return the result wrapped appropriately when no withClause is present
      return {
        value: result,
        env,
        stdout: typeof result === 'string' ? result : (Array.isArray(result) ? JSON.stringify(result, null, 2) : String(result)),
        stderr: '',
        exitCode: 0
      };
    }
    // If this is a non-builtin method with objectSource, we do not (yet) support it
    if (commandRefWithObject.objectSource && !commandRefWithObject.objectReference) {
      throw new MlldInterpreterError(`Only builtin methods are supported on exec results (got: ${commandName})`);
    }
    
    // Get the object first
    const objectRef = commandRefWithObject.objectReference;
    const objectVar = env.getVariable(objectRef.identifier);
    if (!objectVar) {
      throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
    }
    
    // Extract Variable value for object field access - WHY: Need raw object to access fields
    const { extractVariableValue } = await import('../utils/variable-resolution');
    const objectValue = await extractVariableValue(objectVar, env);
    
    
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

      // Deserialize module environment if needed
      if (metadata.capturedModuleEnv && !(metadata.capturedModuleEnv instanceof Map)) {
        // Import the VariableImporter to reuse the proper deserialization logic
        const { VariableImporter } = await import('./import/VariableImporter');
        const importer = new VariableImporter(null); // ObjectResolver not needed for this
        const moduleEnvMap = importer.deserializeModuleEnv(metadata.capturedModuleEnv);

        // Each executable in the module env needs access to the full env
        for (const [_, variable] of moduleEnvMap) {
          if (variable.type === 'executable' && variable.metadata) {
            variable.metadata.capturedModuleEnv = moduleEnvMap;
          }
        }

        metadata = {
          ...metadata,
          capturedModuleEnv: moduleEnvMap
        };
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
              if (node.withClause.pipeline) {
                // Use unified pipeline processor for pipeline part
                const { processPipeline } = await import('./pipeline/unified-processor');
                const pipelineResult = await processPipeline({
                  value: String(result),
                  env,
                  node,
                  identifier: node.identifier
                });
                // Still need to handle other withClause features (trust, needs)
                return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, env);
              } else {
                return applyWithClause(String(result), node.withClause, env);
              }
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
      if (node.withClause.pipeline) {
        // Use unified pipeline processor for pipeline part
        const { processPipeline } = await import('./pipeline/unified-processor');
        const pipelineResult = await processPipeline({
          value: String(result),
          env,
          node,
          identifier: node.identifier
        });
        // Still need to handle other withClause features (trust, needs)
        return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, env);
      } else {
        return applyWithClause(String(result), node.withClause, env);
      }
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
  let execEnv = env.createChild();

  // Set captured module environment for variable lookup fallback
  if (variable?.metadata?.capturedModuleEnv instanceof Map) {
    execEnv.setCapturedModuleEnv(variable.metadata.capturedModuleEnv);
  }

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
        case 'WhenExpression': {
          // Evaluate when-expression argument
          const { evaluateWhenExpression } = await import('./when-expression');
          const whenRes = await evaluateWhenExpression(arg as any, env);
          argValueAny = whenRes.value;
          // Stringify for argValue if object/array
          if (argValueAny === undefined) {
            argValue = 'undefined';
          } else if (typeof argValueAny === 'object') {
            try { argValue = JSON.stringify(argValueAny); } catch { argValue = String(argValueAny); }
          } else {
            argValue = String(argValueAny);
          }
          break;
        }
        case 'foreach':
        case 'foreach-command': {
          const { evaluateForeachCommand } = await import('./foreach');
          const arr = await evaluateForeachCommand(arg as any, env);
          argValueAny = arr;
          argValue = JSON.stringify(arr);
          break;
        }
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
            
            // WHY: Template variables store AST arrays for lazy evaluation,
            //      must interpolate before passing to executables
            const { isTemplate } = await import('@core/types/variable');
            if (isTemplate(variable)) {
              if (Array.isArray(value)) {
                value = await interpolate(value, env);
              } else if (variable.metadata?.templateAst && Array.isArray(variable.metadata.templateAst)) {
                value = await interpolate(variable.metadata.templateAst, env);
              }
            }
            
            // Handle field access (e.g., @user.name)
            if (varRef.fields && varRef.fields.length > 0) {
              const { accessFields } = await import('../utils/field-access');
              const accessed = await accessFields(value, varRef.fields, {
                env,
                preserveContext: false,
                sourceLocation: (varRef as any).location
              });
              value = accessed;
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
          
        case 'ExecInvocation': {
          const nestedResult = await evaluateExecInvocation(arg as ExecInvocation, env);
          if (nestedResult && nestedResult.value !== undefined) {
            argValueAny = nestedResult.value;
          } else if (nestedResult && nestedResult.stdout !== undefined) {
            argValueAny = nestedResult.stdout;
          } else {
            argValueAny = undefined;
          }

          if (argValueAny === undefined) {
            argValue = 'undefined';
          } else if (typeof argValueAny === 'object') {
            try {
              argValue = JSON.stringify(argValueAny);
            } catch {
              argValue = String(argValueAny);
            }
          } else {
            argValue = String(argValueAny);
          }
          break;
        }
        case 'Text':
          // Plain text nodes should remain strings; avoid JSON coercion that can
          // truncate large numeric identifiers (e.g., Discord snowflakes)
          argValue = await interpolate([arg], env, InterpolationContext.Default);
          argValueAny = argValue;
          break;
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
        // GOTCHA: Don't preserve template variables after interpolation,
        //         use the interpolated string value instead
        const { isTemplate } = await import('@core/types/variable');
        if (isTemplate(variable) && typeof evaluatedArgs[i] === 'string') {
          originalVariables[i] = undefined;
        } else {
          originalVariables[i] = variable;
        }
        
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
      else {
        const preservedValue = argValue !== undefined ? argValue : argStringValue;

        if (process.env.MLLD_DEBUG === 'true') {
          try {
            console.error('[exec-invocation] preservedValue', {
              paramName,
              typeofPreserved: typeof preservedValue,
              isArray: Array.isArray(preservedValue),
              preservedValue
            });
          } catch {}
        }

        if (preservedValue !== undefined && preservedValue !== null && typeof preservedValue === 'object' && !Array.isArray(preservedValue)) {
          // Object type - preserve structure
          paramVar = createObjectVariable(
            paramName,
            preservedValue,
            true,
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
        } else if (Array.isArray(preservedValue)) {
          // Array type - preserve structure
          paramVar = createArrayVariable(
            paramName,
            preservedValue,
            true,
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
        } else if (typeof preservedValue === 'number' || typeof preservedValue === 'boolean' || preservedValue === null) {
          // Primitive types - create appropriate Variable type
          paramVar = createPrimitiveVariable(
            paramName,
            preservedValue,
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
          // String or undefined - use SimpleTextVariable
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
  // Handle pipeline executables
  else if (isPipelineExecutable(definition)) {
    const { processPipeline } = await import('./pipeline/unified-processor');
    const pipelineResult = await processPipeline({
      value: '',
      env: execEnv,
      pipeline: definition.pipeline,
      format: definition.format,
      identifier: commandName,
      location: node.location,
      isRetryable: false
    });
    result = typeof pipelineResult === 'string' ? pipelineResult : String(pipelineResult ?? '');
  }
  // Handle command executables
  else if (isCommandExecutable(definition)) {
    // First, detect which parameters are referenced in the template BEFORE interpolation
    // This is crucial for deciding when to use bash fallback for large variables
    const referencedInTemplate = new Set<string>();
    try {
      const nodes = definition.commandTemplate as any[];
      if (Array.isArray(nodes)) {
        for (const n of nodes) {
          if (n && typeof n === 'object' && n.type === 'VariableReference' && typeof n.identifier === 'string') {
            referencedInTemplate.add(n.identifier);
          } else if (n && typeof n === 'object' && n.type === 'Text' && typeof (n as any).content === 'string') {
            // Also detect literal @name patterns in text segments
            for (const pname of params) {
              const re = new RegExp(`@${pname}(?![A-Za-z0-9_])`);
              if (re.test((n as any).content)) {
                referencedInTemplate.add(pname);
              }
            }
          }
        }
      }
    } catch {}
    
    // Interpolate the command template with parameters using ShellCommand context
    let command = await interpolate(definition.commandTemplate, execEnv, InterpolationContext.ShellCommand);
    // Normalize common escaped sequences for usability in oneliners
    // Only handle simple \n, \t, \r, \0 to their literal counterparts
    // Leave quotes/backslashes intact for shell correctness
    command = command
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\0/g, '\0');
    
    if (process.env.DEBUG_WHEN || process.env.DEBUG_EXEC) {
      logger.debug('Executing command', {
        command,
        commandTemplate: definition.commandTemplate
      });
    }
    
    // Build environment variables from parameters for shell execution
    // Only include parameters that are referenced in the command string to avoid
    // passing oversized, unused values into the environment (E2BIG risk).
    const envVars: Record<string, string> = {};
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Cache compiled regex per parameter for performance on large templates
    const paramRegexCache: Record<string, { simple: RegExp; braced: RegExp }> = {};
    const referencesParam = (cmd: string, name: string) => {
      // Prefer original template reference detection so interpolation doesn't hide usage
      if (referencedInTemplate.has(name)) return true;
      // Also check for $name (not followed by word char) or ${name}, avoiding escaped dollars (\$)
      if (!paramRegexCache[name]) {
        const n = escapeRegex(name);
        paramRegexCache[name] = {
          simple: new RegExp(`(^|[^\\\\])\\$${n}(?![A-Za-z0-9_])`),
          braced: new RegExp(`\\$\\{${n}\\}`)
        };
      }
      const { simple, braced } = paramRegexCache[name];
      return simple.test(cmd) || braced.test(cmd);
    };
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      if (!referencesParam(command, paramName)) continue; // skip unused params
      
      // Properly serialize proxy objects for execution
      const paramVar = execEnv.getVariable(paramName);
      if (paramVar && typeof paramVar.value === 'object' && paramVar.value !== null) {
        try {
          envVars[paramName] = JSON.stringify(paramVar.value);
        } catch {
          envVars[paramName] = evaluatedArgStrings[i];
        }
      } else {
        envVars[paramName] = evaluatedArgStrings[i];
      }
    }
    
    // Check if any referenced env var is oversized; if so, optionally fallback to bash heredoc
    const perVarMax = (() => {
      const v = process.env.MLLD_MAX_SHELL_ENV_VAR_SIZE;
      if (!v) return 128 * 1024; // 128KB default
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 128 * 1024;
    })();
    const needsBashFallback = Object.values(envVars).some(v => Buffer.byteLength(v || '', 'utf8') > perVarMax);
    const fallbackDisabled = (() => {
      const v = (process.env.MLLD_DISABLE_COMMAND_BASH_FALLBACK || '').toLowerCase();
      return v === '1' || v === 'true' || v === 'yes' || v === 'on';
    })();
    
    if (needsBashFallback && !fallbackDisabled) {
      // Build a bash-friendly command string where param refs stay as "$name"
      // so BashExecutor can inject them via heredoc.
      let fallbackCommand = '';
      try {
        const nodes = definition.commandTemplate as any[];
        if (Array.isArray(nodes)) {
          for (const n of nodes) {
            if (n && typeof n === 'object' && n.type === 'VariableReference' && typeof n.identifier === 'string' && params.includes(n.identifier)) {
              fallbackCommand += `"$${n.identifier}"`;
            } else if (n && typeof n === 'object' && 'content' in n) {
              fallbackCommand += String((n as any).content || '');
            } else if (typeof n === 'string') {
              fallbackCommand += n;
            } else {
              // Fallback: interpolate conservatively for unexpected nodes
              fallbackCommand += await interpolate([n as any], execEnv, InterpolationContext.ShellCommand);
            }
          }
        } else {
          fallbackCommand = command;
        }
      } catch {
        fallbackCommand = command;
      }

      // Validate base command semantics (keep same security posture)
      try {
        CommandUtils.validateAndParseCommand(fallbackCommand);
      } catch (error) {
        throw new MlldCommandExecutionError(
          error instanceof Error ? error.message : String(error),
          context?.sourceLocation,
          {
            command: fallbackCommand,
            exitCode: 1,
            duration: 0,
            stderr: error instanceof Error ? error.message : String(error),
            workingDirectory: (execEnv as any).getProjectRoot?.() || '',
            directiveType: context?.directiveType || 'run'
          }
        );
      }

      // Build params for bash execution using evaluated argument values, but only those referenced
      const codeParams: Record<string, any> = {};
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        if (!referencesParam(command, paramName)) continue;
        codeParams[paramName] = evaluatedArgs[i];
      }
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[exec-invocation] Falling back to bash heredoc for oversized command params', {
          fallbackSnippet: fallbackCommand.slice(0, 120),
          paramCount: Object.keys(codeParams).length
        });
      }
      const commandOutput = await execEnv.executeCode(fallbackCommand, 'sh', codeParams);
      // Try to parse as JSON if it looks like JSON
      if (typeof commandOutput === 'string' && commandOutput.trim()) {
        const trimmed = commandOutput.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            result = JSON.parse(trimmed);
          } catch {
            result = commandOutput;
          }
        } else {
          result = commandOutput;
        }
      } else {
        result = commandOutput;
      }
    } else {
      // Check for stdin support in withClause
      let stdinInput: string | undefined;
      if (definition.withClause && 'stdin' in definition.withClause) {
        // Resolve stdin input similar to run.ts
        stdinInput = await resolveStdinInput(definition.withClause.stdin, execEnv);
      }

      // Execute the command with environment variables and optional stdin
      const commandOptions = stdinInput !== undefined ? { env: envVars, input: stdinInput } : { env: envVars };
      const commandOutput = await execEnv.executeCommand(command, commandOptions);
      
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

    if (definition.withClause) {
      if (definition.withClause.needs) {
        const checker = new DefaultDependencyChecker();
        await checkDependencies(definition.withClause.needs, checker, variable.metadata?.definedAt || node.location);
      }

      if (definition.withClause.pipeline && definition.withClause.pipeline.length > 0) {
        const { processPipeline } = await import('./pipeline/unified-processor');
        const pipelineInput = typeof result === 'string'
          ? result
          : result === undefined || result === null
            ? ''
            : JSON.stringify(result);
        const pipelineResult = await processPipeline({
          value: pipelineInput,
          env: execEnv,
          pipeline: definition.withClause.pipeline,
          format: definition.withClause.format as string | undefined,
          isRetryable: false,
          identifier: commandName,
          location: variable.metadata?.definedAt || node.location
        });

        if (typeof pipelineResult === 'string') {
          const trimmed = pipelineResult.trim();
          if (trimmed) {
            try {
              result = JSON.parse(trimmed);
            } catch {
              result = pipelineResult;
            }
          } else {
            result = pipelineResult;
          }
        } else {
          result = pipelineResult;
        }
      }
    }
  }
  // Handle code executables
  else if (isCodeExecutable(definition)) {
    // Special handling for mlld-when expressions
    if (definition.language === 'mlld-when') {
      // console.log('🎯 EXEC-INVOCATION MLLD-WHEN HANDLER CALLED');
      
      // The codeTemplate contains the WhenExpression node
      const whenExprNode = definition.codeTemplate[0];
      if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
        throw new MlldInterpreterError('mlld-when executable missing WhenExpression node');
      }
      
      // Evaluate the when expression with the parameter environment
      const { evaluateWhenExpression } = await import('./when-expression');
      const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
      let value: any = whenResult.value;
      // Unwrap tagged show effects for non-pipeline exec-invocation (so /run echoes value)
      if (value && typeof value === 'object' && (value as any).__whenEffect === 'show') {
        value = (value as any).text ?? '';
      }
      result = value;
      // Update execEnv to the result which contains merged nodes
      execEnv = whenResult.env;
    } else if (definition.language === 'mlld-foreach') {
      // Special handling for mlld-foreach expressions
      const foreachNode = definition.codeTemplate[0];
      // Evaluate the foreach expression with the parameter environment
      const { evaluateForeachCommand } = await import('./foreach');
      result = await evaluateForeachCommand(foreachNode, execEnv);
    } else if (definition.language === 'mlld-for') {
      // Special handling for mlld-for expressions
      const forExprNode = definition.codeTemplate[0];
      if (!forExprNode || forExprNode.type !== 'ForExpression') {
        throw new MlldInterpreterError('mlld-for executable missing ForExpression node');
      }
      
      // Evaluate the for expression with the parameter environment
      const { evaluateForExpression } = await import('./for');
      result = await evaluateForExpression(forExprNode, execEnv);
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
            // Store metadata on shelf before unwrapping
            metadataShelf.storeMetadata(paramVar.value);
            
            // Auto-unwrap LoadContentResult objects for JS/Python
            const unwrappedValue = AutoUnwrapManager.unwrap(paramVar.value);
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
    if (
      variable.metadata?.capturedModuleEnv instanceof Map &&
      (definition.language === 'js' || definition.language === 'javascript' ||
        definition.language === 'node' || definition.language === 'nodejs')
    ) {
      for (const [capturedName, capturedVar] of variable.metadata.capturedModuleEnv) {
        if (codeParams[capturedName] !== undefined) {
          continue;
        }

        if (params.includes(capturedName)) {
          continue;
        }

        if (capturedVar.type === 'executable') {
          continue;
        }

        codeParams[capturedName] = prepareValueForShadow(capturedVar);

        if ((capturedVar.value === null || typeof capturedVar.value !== 'object') && capturedVar.type !== 'executable') {
          const subtype = capturedVar.type === 'primitive' && 'primitiveType' in capturedVar
            ? (capturedVar as any).primitiveType
            : (capturedVar as any).subtype;
          variableMetadata[capturedName] = {
            type: capturedVar.type,
            subtype,
            metadata: capturedVar.metadata,
            isVariable: true
          };
        }
      }
    }

    // NEW: Pass captured shadow environments for JS/Node execution
    const capturedEnvs = variable.metadata?.capturedShadowEnvs;
    if (capturedEnvs && (definition.language === 'js' || definition.language === 'javascript' || 
                         definition.language === 'node' || definition.language === 'nodejs')) {
      (codeParams as any).__capturedShadowEnvs = capturedEnvs;
      
    }
    
    // Execute the code with parameters and metadata
    const codeResult = await execEnv.executeCode(
      code,
      definition.language || 'javascript',
      codeParams,
      Object.keys(variableMetadata).length > 0 ? variableMetadata : undefined
    );
    
    // Process the result
    let processedResult: any;
    
    // If the result looks like JSON (from return statement), parse it
    if (typeof codeResult === 'string' && 
        (codeResult.startsWith('"') || codeResult.startsWith('{') || codeResult.startsWith('[') || 
         codeResult === 'null' || codeResult === 'true' || codeResult === 'false' ||
         /^-?\d+(\.\d+)?$/.test(codeResult))) {
      try {
        const parsed = JSON.parse(codeResult);
        processedResult = parsed;
      } catch {
        // Not valid JSON, use as-is
        processedResult = codeResult;
      }
    } else {
      processedResult = codeResult;
    }

    // Attempt to restore metadata from shelf
    result = metadataShelf.restoreMetadata(processedResult);
    
    // Clear the shelf to prevent memory leaks
    metadataShelf.clear();
    }
  }
  // Handle command reference executables
  else if (isCommandRefExecutable(definition)) {
    const refName = definition.commandRef;
    if (!refName) {
      throw new MlldInterpreterError(`Command reference ${commandName} has no target command`);
    }
    
    // Look up the referenced command
    // First check in the captured module environment (for imported executables)
    let refCommand = null;
    if (variable?.metadata?.capturedModuleEnv) {
      const capturedEnv = variable.metadata.capturedModuleEnv;
      if (capturedEnv instanceof Map) {
        // If it's a Map, we have proper Variables
        refCommand = capturedEnv.get(refName);
      } else if (capturedEnv && typeof capturedEnv === 'object') {
        // This shouldn't happen with proper deserialization, but handle it for safety
        refCommand = capturedEnv[refName];
      }
    }

    // Fall back to current environment if not found in captured environment
    if (!refCommand) {
      refCommand = env.getVariable(refName);
    }

    if (!refCommand) {
      throw new MlldInterpreterError(`Referenced command not found: ${refName}`);
    }

    // The commandArgs contains the original AST nodes for how to call the referenced command
    // We need to evaluate these nodes with the current invocation's parameters bound
    if (definition.commandArgs && definition.commandArgs.length > 0) {
      if (process.env.MLLD_DEBUG === 'true') {
        try {
          console.error('[EXEC INVOC] commandRef args shape:', (definition.commandArgs as any[]).map((a: any) => Array.isArray(a) ? 'array' : (a && typeof a === 'object' && a.type) || typeof a));
        } catch {}
      }
      // Evaluate each arg; handle interpolated string args that are arrays of parts
      let refArgs: any[] = [];
      const { evaluate, interpolate } = await import('../core/interpreter');
      const { InterpolationContext } = await import('../core/interpolation-context');
      
      for (const argNode of definition.commandArgs) {
        let value: any;
        // If this arg is an array of parts (from DataString with interpolation),
        // interpolate the whole array into a single string argument
        if (Array.isArray(argNode)) {
          value = await interpolate(argNode as any[], execEnv, InterpolationContext.Default);
        } else {
          // Evaluate the individual argument node
          const argResult = await evaluate(argNode as any, execEnv, { isExpression: true });
          value = argResult?.value;
        }
        if (value !== undefined) {
          refArgs.push(value);
        }
      }
      
      // Create a child environment that can access the referenced command
      const refEnv = env.createChild();
      // Set the captured module env so getVariable can find the command
      if (variable?.metadata?.capturedModuleEnv instanceof Map) {
        refEnv.setCapturedModuleEnv(variable.metadata.capturedModuleEnv);
      }

      // Create a new invocation node for the referenced command with the evaluated args
      const refInvocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: refName,
          args: refArgs  // Pass values directly like foreach does
        },
        // Pass along the pipeline if present
        ...(definition.withClause ? { withClause: definition.withClause } : {})
      };

      // Recursively evaluate the referenced command in the environment that has it
      const refResult = await evaluateExecInvocation(refInvocation, refEnv);
      result = refResult.value as string;
    } else {
      // Create a child environment that can access the referenced command
      const refEnv = env.createChild();
      // Set the captured module env so getVariable can find the command
      if (variable?.metadata?.capturedModuleEnv instanceof Map) {
        refEnv.setCapturedModuleEnv(variable.metadata.capturedModuleEnv);
      }

      // No commandArgs means just pass through the current invocation's args
      const refInvocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: refName,
          args: evaluatedArgs  // Pass values directly like foreach does
        },
        // Pass along the pipeline if present
        ...(definition.withClause ? { withClause: definition.withClause } : {})
      };

      // Recursively evaluate the referenced command in the environment that has it
      const refResult = await evaluateExecInvocation(refInvocation, refEnv);
      result = refResult.value as string;
    }
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
  
  // Apply post-invocation field/index access if present (e.g., @func()[1], @obj.method().2)
  const postFields: any[] = (node as any).fields || [];
  if (postFields && postFields.length > 0) {
    try {
      const { accessField } = await import('../utils/field-access');
      let current: any = result;
      for (const f of postFields) {
        current = await accessField(current, f, { env, sourceLocation: node.location });
      }
      result = current;
    } catch (e) {
      // Preserve existing behavior: if field access fails, surface error as interpreter error
      throw e;
    }
  }
  
  // Apply withClause transformations if present
  if (node.withClause) {
    if (node.withClause.pipeline) {
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[exec-invocation] Handling pipeline:', {
          pipelineLength: node.withClause.pipeline.length,
          stages: node.withClause.pipeline.map((p: any) => Array.isArray(p) ? '[parallel]' : (p.rawIdentifier || 'unknown'))
        });
      }
      
      // When an ExecInvocation has a pipeline, we need to create a special pipeline
      // where the ExecInvocation itself becomes stage 0, retryable
      const { executePipeline } = await import('./pipeline');
      
      // Create a source function that re-executes this ExecInvocation (without the pipeline)
      const sourceFunction = async () => {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[exec-invocation] sourceFunction called - re-executing ExecInvocation');
        }
        // Re-execute this same ExecInvocation but without the pipeline
        // IMPORTANT: Use execEnv not env, so the function parameters are available
        const nodeWithoutPipeline = { ...node, withClause: undefined };
        const freshResult = await evaluateExecInvocation(nodeWithoutPipeline, execEnv);
        return typeof freshResult.value === 'string' ? freshResult.value : JSON.stringify(freshResult.value);
      };
      
      // Create synthetic source stage for retryable pipeline
      const SOURCE_STAGE = {
        rawIdentifier: '__source__',
        identifier: [],
        args: [],
        fields: [],
        rawArgs: []
      };
      
      // Prepend synthetic source stage and attach builtin effects consistently
      let normalizedPipeline = [SOURCE_STAGE, ...node.withClause.pipeline];
      try {
        const { attachBuiltinEffects } = await import('./pipeline/effects-attachment');
        const { functionalPipeline } = attachBuiltinEffects(normalizedPipeline as any);
        normalizedPipeline = functionalPipeline as any;
      } catch {
        // If helper import fails, proceed without effect attachment
      }
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[exec-invocation] Creating pipeline with synthetic source:', {
          originalLength: node.withClause.pipeline.length,
          normalizedLength: normalizedPipeline.length,
          stages: normalizedPipeline.map((p: any) => Array.isArray(p) ? '[parallel]' : (p.rawIdentifier || 'unknown'))
        });
      }
      
      // Execute the pipeline with the ExecInvocation result as initial input
      // Mark it as retryable with the source function
      const pipelineResult = await executePipeline(
        typeof result === 'string' ? result : JSON.stringify(result),
        normalizedPipeline,
        execEnv,  // Use execEnv which has merged nodes
        node.location,
        node.withClause.format,
        true,  // isRetryable
        sourceFunction,
        true   // hasSyntheticSource
      );
      
      // Still need to handle other withClause features (trust, needs)
      return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, execEnv);
    } else {
      // applyWithClause expects a string input
      const stringResult = typeof result === 'string' ? result : JSON.stringify(result);
      return applyWithClause(stringResult, node.withClause, execEnv);
    }
  }
  
  if (process.env.MLLD_DEBUG === 'true') {
    try {
      console.log('[exec-invocation] returning result', {
        commandName,
        typeofResult: typeof result,
        isArrayResult: Array.isArray(result)
      });
    } catch {}
  }

  return {
    value: result,
    env: execEnv,  // Return execEnv which contains merged nodes from when expressions
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
