import * as fs from 'fs';
import type { ExecInvocation } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import {
  isCommandExecutable,
  isCodeExecutable,
  isPartialExecutable
} from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import {
  isExecutableVariable,
  VariableMetadataUtils,
  createSimpleTextVariable
} from '@core/types/variable';
import type { Variable, VariableContext, VariableSource } from '@core/types/variable';
import { applyWithClause } from './with-clause';
import { MlldInterpreterError, MlldSecurityError, CircularReferenceError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import {
  asText,
  isStructuredValue,
  wrapStructured,
  collectAndMergeParameterDescriptors,
  extractSecurityDescriptor,
  applySecurityDescriptorToStructuredValue
} from '../utils/structured-value';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { coerceValueForStdin } from '../utils/shell-value';
import { wrapExecResult, wrapPipelineResult } from '../utils/structured-exec';
import { makeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import { normalizeTransformerResult } from '../utils/transformer-result';
import { varMxToSecurityDescriptor, updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import type { WhenExpressionNode } from '@core/types/when';
import { resolveWorkingDirectory } from '../utils/working-directory';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { enforceKeychainAccess } from '@interpreter/policy/keychain-policy';
import { runWithGuardRetry } from '../hooks/guard-retry-runner';
import {
  buildExecOperationPreview,
  deserializeShadowEnvs
} from './exec/context';
import {
  getStructuredSecurityDescriptor,
  getVariableSecurityDescriptor,
  setStructuredSecurityDescriptor
} from './exec/security-descriptor';
import {
  dispatchBuiltinMethod,
  evaluateBuiltinArguments,
  isBuiltinMethod,
  normalizeBuiltinTargetValue,
  resolveBuiltinInvocationObject
} from './exec/builtins';
import {
  createExecInvocationChunkEffect,
  finalizeExecInvocationStreaming,
  mergeExecInvocationStreamingFromDefinition,
  setupExecInvocationStreaming
} from './exec/streaming';
import {
  bindExecParameterVariables,
  evaluateExecInvocationArgs
} from './exec/args';
import { executeNonCommandExecutable } from './exec/non-command-handlers';
import { executeCommandExecutable } from './exec/command-handler';
import { executeCodeExecutable } from './exec/code-handler';
import {
  applyExecOutputPolicyLabels,
  createExecOperationContextAndEnforcePolicy,
  enforceExecParamLabelFlow,
  handleExecPreGuardDecision,
  prepareExecGuardInputs,
  runExecPostGuards,
  runExecPreGuards,
  stringifyExecGuardArg
} from './exec/guard-policy';

/**
 * Resolve stdin input from expression using shared shell classification.
 */
type ResolvedStdinInput = {
  text: string;
  descriptor?: SecurityDescriptor;
};

async function resolveStdinInput(
  stdinSource: unknown,
  env: Environment
): Promise<ResolvedStdinInput> {
  if (stdinSource === null || stdinSource === undefined) {
    return { text: '' };
  }

  const { evaluate } = await import('../core/interpreter');
  const result = await evaluate(stdinSource as any, env, { isExpression: true });
  let value = result.value;
  const descriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });

  const { isVariable, resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.CommandExecution);
  }

  return { text: coerceValueForStdin(value), descriptor };
}

const chainDebugEnabled = process.env.MLLD_DEBUG_CHAINING === '1';
function chainDebug(message: string, payload?: Record<string, unknown>): void {
  if (!chainDebugEnabled) {
    return;
  }
  try {
    const serialized = payload ? ` ${JSON.stringify(payload)}` : '';
    process.stdout.write(`[CHAIN] ${message}${serialized}\n`);
  } catch {
    process.stdout.write(`[CHAIN] ${message}\n`);
  }
}

const resolveVariableIndexValue = async (fieldValue: any, env: Environment): Promise<unknown> => {
  const { evaluateDataValue } = await import('./data-value-evaluator');
  const node =
    typeof fieldValue === 'object'
      ? (fieldValue as any)
      : {
          type: 'VariableReference',
          valueType: 'varIdentifier',
          identifier: String(fieldValue)
        };
  return evaluateDataValue(node as any, env);
};

/**
 * Evaluate an ExecInvocation node
 * This executes a previously defined exec command with arguments and optional tail modifiers
 */
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  const operationPreview = buildExecOperationPreview(node);
  return await runWithGuardRetry({
    env,
    operationContext: operationPreview,
    sourceRetryable: true,
    execute: () => evaluateExecInvocationInternal(node, env)
  });
}

async function evaluateExecInvocationInternal(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  let commandName: string | undefined; // Declare at function scope for finally block
  let endResolutionTrackingIfNeeded: () => void = () => {};

  const normalizeFields = (fields?: Array<{ type: string; value: any }>) =>
    (fields || []).map(field => {
      if (!field || typeof field !== 'object') return field;
      if (field.type === 'Field') {
        return { ...field, type: 'field' };
      }
      return field;
    });

  const streamingSetup = await setupExecInvocationStreaming(node, env);
  let streamingOptions = streamingSetup.streamingOptions;
  let streamingRequested = streamingSetup.streamingRequested;
  let streamingEnabled = streamingSetup.streamingEnabled;
  const hasStreamFormat = streamingSetup.hasStreamFormat;
  const pipelineId = streamingSetup.pipelineId;
  const streamingManager = streamingSetup.streamingManager;
  const chunkEffect = createExecInvocationChunkEffect({
    env,
    isStreamingEnabled: () => streamingEnabled,
    shouldSkipDefaultSinks: () => streamingOptions.skipDefaultSinks
  });


  try {
    const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
    let resultSecurityDescriptor: SecurityDescriptor | undefined;
    const mergeResultDescriptor = (descriptor?: SecurityDescriptor): void => {
      if (!descriptor) {
        return;
      }
      resultSecurityDescriptor = resultSecurityDescriptor
        ? env.mergeSecurityDescriptors(resultSecurityDescriptor, descriptor)
        : descriptor;
    };
  const interpolateWithResultDescriptor = (
    nodes: any,
    targetEnv: Environment = env,
    interpolationContext: InterpolationContext = InterpolationContext.Default
  ): Promise<string> => {
    return interpolate(nodes, targetEnv, interpolationContext, {
      collectSecurityDescriptor: descriptor => {
        if (descriptor) {
          mergeResultDescriptor(descriptor);
        }
      }
    });
  };

  const createParameterMetadata = (value: unknown) => {
    const descriptor = extractSecurityDescriptor(value);
    const metadata = descriptor
      ? VariableMetadataUtils.applySecurityMetadata(
          undefined,
          { existingDescriptor: descriptor }
        )
      : undefined;

    return {
      metadata,
      internal: {
        isSystem: true,
        isParameter: true
      }
    };
  };

  const createEvalResult = (
    value: unknown,
    targetEnv: Environment,
    options?: { type?: string; text?: string }
  ): EvalResult => {
    const wrapped = wrapExecResult(value, options);
    if (resultSecurityDescriptor) {
      const existing = getStructuredSecurityDescriptor(wrapped);
      const merged = existing
        ? env.mergeSecurityDescriptors(existing, resultSecurityDescriptor)
        : resultSecurityDescriptor;
      setStructuredSecurityDescriptor(wrapped, merged);
    }
    return {
      value: wrapped,
      env: targetEnv,
      stdout: asText(wrapped),
      stderr: '',
      exitCode: 0
    };
  };

  const toPipelineInput = (value: unknown, options?: { type?: string; text?: string }): unknown => {
    const structured = wrapExecResult(value, options);
    if (resultSecurityDescriptor) {
      setStructuredSecurityDescriptor(structured, resultSecurityDescriptor);
    }
    return structured;
  };

  const applyInvocationWithClause = async (
    value: unknown,
    wrapOptions?: { type?: string; text?: string }
  ): Promise<EvalResult> => {
    if (node.withClause) {
      if (node.withClause.pipeline) {
        const { processPipeline } = await import('./pipeline/unified-processor');
        const pipelineInputValue = toPipelineInput(value, wrapOptions);
        const pipelineResult = await processPipeline({
          value: pipelineInputValue,
          env,
          node,
          identifier: node.identifier,
          descriptorHint: resultSecurityDescriptor
        });
        return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, env);
      }
      return applyWithClause(value, node.withClause, env);
    }
    return createEvalResult(value, env, wrapOptions);
  };
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
  const nodeSourceLocation = astLocationToSourceLocation(node.location, env.getCurrentFilePath());

  // Get the command name from the command reference or legacy format
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

  // Resolve dynamic method names when the final segment is a variable index (e.g., @obj[@name]())
  const identifierNode = (node.commandRef as any)?.identifier?.[0];
  const identifierFields = normalizeFields(identifierNode?.fields);
  const lastField = identifierFields[identifierFields.length - 1];
  if (lastField?.type === 'variableIndex') {
    const resolvedName = await resolveVariableIndexValue(lastField.value, env);
    commandName = String(resolvedName);
  }
  
  if (!commandName) {
    throw new MlldInterpreterError('ExecInvocation has no command identifier');
  }

  // Check for circular reference before resolving (skip builtin methods and reserved names)
  const isBuiltinCommand = isBuiltinMethod(commandName);
  const isReservedName = env.hasVariable(commandName) &&
    (env.getVariable(commandName) as any)?.internal?.isReserved;
  const shouldTrackResolution = !isBuiltinCommand && !isReservedName;
  let resolutionTrackingActive = false;

  if (shouldTrackResolution && env.isResolving(commandName)) {
    throw new CircularReferenceError(
      `Circular reference detected: executable '@${commandName}' calls itself recursively without a terminating condition`,
      {
        identifier: commandName,
        location: nodeSourceLocation
      }
    );
  }

  // Mark this executable as being resolved (skip builtin methods and reserved names)
  if (shouldTrackResolution) {
    env.beginResolving(commandName);
    resolutionTrackingActive = true;
  }
  endResolutionTrackingIfNeeded = (): void => {
    if (!resolutionTrackingActive || !commandName) {
      return;
    }
    env.endResolving(commandName);
    resolutionTrackingActive = false;
  };

  // Check if this is a field access exec invocation (e.g., @obj.method())
  // or a method call on an exec result (e.g., @func(args).method())
  let variable;
  const commandRefWithObject = node.commandRef as any & { objectReference?: any; objectSource?: ExecInvocation };
  if (node.commandRef && (commandRefWithObject.objectReference || commandRefWithObject.objectSource)) {
    if (isBuiltinMethod(commandName)) {
      const builtinResolution = await resolveBuiltinInvocationObject({
        commandName,
        commandRefWithObject,
        env,
        normalizeFields,
        resolveVariableIndexValue,
        evaluateExecInvocationNode: evaluateExecInvocation
      });
      if (builtinResolution.kind === 'type-check-fallback') {
        return createEvalResult(builtinResolution.result, env);
      }

      let objectValue = builtinResolution.value.objectValue;
      const objectVar = builtinResolution.value.objectVar;
      const sourceDescriptor = builtinResolution.value.sourceDescriptor;

      if (process.env.DEBUG_EXEC) {
        logger.debug('Builtin invocation object value', {
          commandName,
          objectType: Array.isArray(objectValue) ? 'array' : typeof objectValue,
          objectPreview:
            typeof objectValue === 'string'
              ? objectValue.slice(0, 80)
              : Array.isArray(objectValue)
                ? `[array length=${objectValue.length}]`
                : objectValue && typeof objectValue === 'object'
                  ? Object.keys(objectValue)
                  : objectValue
        });
      }

      chainDebug('builtin invocation start', {
        commandName,
        hasObjectSource: Boolean(commandRefWithObject.objectSource),
        hasObjectReference: Boolean(commandRefWithObject.objectReference)
      });

      const targetDescriptor =
        sourceDescriptor ||
        (objectVar && varMxToSecurityDescriptor(objectVar.mx)) ||
        extractSecurityDescriptor(objectValue);
      mergeResultDescriptor(targetDescriptor);

      objectValue = normalizeBuiltinTargetValue(objectValue);

      chainDebug('resolved object value', {
        commandName,
        objectType: Array.isArray(objectValue) ? 'array' : typeof objectValue,
        preview:
          typeof objectValue === 'string'
            ? objectValue.slice(0, 80)
            : Array.isArray(objectValue)
              ? `[array length=${objectValue.length}]`
              : objectValue && typeof objectValue === 'object'
                ? '[object]'
                : objectValue
      });

      const evaluatedArgs = await evaluateBuiltinArguments(args, env);
      const quantifierEvaluator = (objectValue as any)?.__mlldQuantifierEvaluator;
      if (quantifierEvaluator && typeof quantifierEvaluator === 'function') {
        const quantifierResult = quantifierEvaluator(commandName, evaluatedArgs);
        return createEvalResult(quantifierResult, env);
      }

      const dispatchResult = dispatchBuiltinMethod({
        commandName,
        objectValue,
        evaluatedArgs
      });
      let result = dispatchResult.result;
      if (dispatchResult.propagateResultDescriptor) {
        inheritExpressionProvenance(result, objectVar ?? objectValue);
        const sourceDescriptorForResult =
          (objectVar && varMxToSecurityDescriptor(objectVar.mx)) || extractSecurityDescriptor(objectValue);
        if (sourceDescriptorForResult) {
          resultSecurityDescriptor = resultSecurityDescriptor
            ? env.mergeSecurityDescriptors(resultSecurityDescriptor, sourceDescriptorForResult)
            : sourceDescriptorForResult;
        }
      }
      
      // Apply post-invocation fields if present (e.g., @str.split(',')[1])
      const postFieldsBuiltin: any[] = (node as any).fields || [];
      if (postFieldsBuiltin && postFieldsBuiltin.length > 0) {
        const { accessField } = await import('../utils/field-access');
        for (const f of postFieldsBuiltin) {
          result = await accessField(result, f, { env, sourceLocation: nodeSourceLocation });
        }
      }
      
      const normalized = normalizeTransformerResult(commandName, result);
      const resolvedValue = normalized.value;
      const wrapOptions = normalized.options;
      inheritExpressionProvenance(resolvedValue, objectVar ?? objectValue);

      chainDebug('applying builtin pipeline', {
        commandName,
        pipelineLength: node.withClause?.pipeline?.length ?? 0
      });
      return applyInvocationWithClause(resolvedValue, wrapOptions);
    }
    // If this is a non-builtin method with objectSource, we do not (yet) support it
    if (commandRefWithObject.objectSource && !commandRefWithObject.objectReference) {
      throw new MlldInterpreterError(`Only builtin methods are supported on exec results (got: ${commandName})`);
    }
    
    // Get the object first
    const objectRef = commandRefWithObject.objectReference;
    // Try regular variable first, then resolver variable (for reserved names like @keychain)
    let objectVar = env.getVariable(objectRef.identifier);
    if (!objectVar) {
      // Check if it's a resolver variable (e.g., @keychain, @debug)
      objectVar = await env.getResolverVariable(objectRef.identifier);
    }
    if (!objectVar) {
      throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
    }
    
    // Extract Variable value for object field access - WHY: Need raw object to access fields
    const { extractVariableValue } = await import('../utils/variable-resolution');
    const objectValue = await extractVariableValue(objectVar, env);
    
    
    // Access the field
    if (objectRef.fields && objectRef.fields.length > 0) {
      const { accessFields } = await import('../utils/field-access');
      const accessedObject = await accessFields(objectValue, normalizeFields(objectRef.fields), {
        env,
        preserveContext: false,
        returnUndefinedForMissing: true,
        sourceLocation: objectRef.location
      });

      if (typeof accessedObject === 'object' && accessedObject !== null) {
        const fieldValue = (accessedObject as any)[commandName];
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
      let serializedInternal =
        (variable.internal as Record<string, unknown> | undefined) ??
        {};
      if (serializedInternal.capturedShadowEnvs && typeof serializedInternal.capturedShadowEnvs === 'object') {
        // Check if it needs deserialization (is plain object, not Map)
        const needsDeserialization = Object.entries(serializedInternal.capturedShadowEnvs).some(
          ([lang, env]) => env && !(env instanceof Map)
        );

        if (needsDeserialization) {
          serializedInternal = {
            ...serializedInternal,
            capturedShadowEnvs: deserializeShadowEnvs(serializedInternal.capturedShadowEnvs)
          };
        }
      }

      // Deserialize module environment if needed
      if (serializedInternal.capturedModuleEnv && !(serializedInternal.capturedModuleEnv instanceof Map)) {
        // Import the VariableImporter to reuse the proper deserialization logic
        const { VariableImporter } = await import('./import/VariableImporter');
        const importer = new VariableImporter(null); // ObjectResolver not needed for this
        const moduleEnvMap = importer.deserializeModuleEnv(serializedInternal.capturedModuleEnv);

        // Each executable in the module env needs access to the full env
        for (const [_, variable] of moduleEnvMap) {
          if (variable.type === 'executable') {
            variable.internal = {
              ...(variable.internal ?? {}),
              capturedModuleEnv: moduleEnvMap
            };
          }
        }

        serializedInternal = {
          ...serializedInternal,
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
          internal: {
            executableDef: variable.executableDef,
            ...serializedInternal
          }
        }
      );
    }
  } else {
    // Regular command lookup
    variable = env.getVariable(commandName);
    if (!variable) {
      // Try splitting on dot to handle variant access (e.g., "json.fromlist" -> "json" + variant "fromlist")
      if (commandName.includes('.')) {
        const parts = commandName.split('.');
        const baseName = parts[0];
        const variantName = parts.slice(1).join('.');

        const baseVar = env.getVariable(baseName);
        if (baseVar) {
          const variants = baseVar.internal?.transformerVariants as Record<string, MlldVariable> | undefined;
          if (variants && variantName in variants) {
            variable = variants[variantName];
          }
        }
      }

      if (!variable) {
        throw new MlldInterpreterError(`Command not found: ${commandName}`);
      }
    }

    // Check if this is a transformer variant access (e.g., @parse.fromlist)
    if (isExecutableVariable(variable) && node.commandRef) {
      const varRef = (node.commandRef as any).identifier?.[0] || node.commandRef;
      if (varRef && varRef.type === 'VariableReference' && varRef.fields && varRef.fields.length > 0) {
        const field = varRef.fields[0];
        if (field.type === 'field') {
          const variants = variable.internal?.transformerVariants as Record<string, MlldVariable> | undefined;
          if (variants && field.value in variants) {
            // Replace the variable with the variant
            variable = variants[field.value];
          }
        }
      }
    }
  }

  // Ensure it's an executable variable
  if (!isExecutableVariable(variable)) {
    throw new MlldInterpreterError(`Variable ${commandName} is not executable (type: ${variable.type})`);
  }
  
  // Special handling for built-in transformers
  if (variable.internal?.isBuiltinTransformer && variable.internal?.transformerImplementation) {
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
              const execDef = varObj.internal?.executableDef;
              if (execDef && 'type' in execDef) {
                typeInfo = `executable (${execDef.type})`;
              }
            }
            
            // Add source information if available
            if (varObj.source?.directive) {
              typeInfo += ` [from /${varObj.source.directive}]`;
            }
            
            // Pass the type info with a special marker
            const result = await variable.internal.transformerImplementation(`__MLLD_VARIABLE_OBJECT__:${typeInfo}`);
            const normalized = normalizeTransformerResult(commandName, result);
            const resolvedValue = normalized.value;
            const wrapOptions = normalized.options;
            
            // Clean up resolution tracking before returning
            endResolutionTrackingIfNeeded();
            return applyInvocationWithClause(resolvedValue, wrapOptions);
          }
        }
      }
    }
    
    // Special handling for @exists - return true when argument evaluation succeeds
    if (commandName === 'exists' || commandName === 'EXISTS') {
      const arg = args[0];
      const isGlobPattern = (value: string): boolean => /[\*\?\{\}\[\]]/.test(value);
      const isEmptyLoadArray = (value: unknown): boolean => {
        if (isStructuredValue(value)) {
          return (
            value.type === 'array' &&
            Array.isArray(value.data) &&
            value.data.length === 0
          );
        }
        return Array.isArray(value) && value.length === 0;
      };

      const resolveLoadContentSource = async (loadNode: any): Promise<string | undefined> => {
        const source = loadNode?.source;
        if (!source || typeof source !== 'object') {
          return undefined;
        }
        const actualSource =
          source.type === 'path' || source.type === 'url'
            ? source
            : source.segments && source.raw !== undefined
              ? { ...source, type: 'path' }
              : source;

        if (actualSource.type === 'path') {
          if (actualSource.meta?.hasVariables && Array.isArray(actualSource.segments)) {
            try {
              return (await interpolateWithResultDescriptor(actualSource.segments, env)).trim();
            } catch {
              return typeof actualSource.raw === 'string' ? actualSource.raw.trim() : undefined;
            }
          }
          if (typeof actualSource.raw === 'string') {
            return actualSource.raw.trim();
          }
        }

        if (actualSource.type === 'url') {
          if (typeof actualSource.raw === 'string') {
            return actualSource.raw.trim();
          }
          if (typeof actualSource.protocol === 'string' && typeof actualSource.host === 'string') {
            return `${actualSource.protocol}://${actualSource.host}${actualSource.path || ''}`;
          }
        }

        return undefined;
      };

      const isStringPathArgument = (value: unknown): boolean => {
        if (Array.isArray(value)) {
          return true;
        }
        if (!value || typeof value !== 'object') {
          return false;
        }
        if ('wrapperType' in value && Array.isArray((value as any).content)) {
          return true;
        }
        if ((value as any).type === 'Text') {
          return true;
        }
        if ((value as any).type === 'Literal' && (value as any).valueType === 'string') {
          return true;
        }
        return false;
      };

      const finalizeExistsResult = async (existsResult: boolean): Promise<EvalResult> => {
        endResolutionTrackingIfNeeded();
        return applyInvocationWithClause(existsResult);
      };

      if (!arg) {
        return finalizeExistsResult(false);
      }

      try {
        if (isStringPathArgument(arg)) {
          const resolvePathString = async (): Promise<string> => {
            if (Array.isArray(arg)) {
              return interpolateWithResultDescriptor(arg, env, InterpolationContext.Default);
            }
            if (arg && typeof arg === 'object' && (arg as any).type === 'Text') {
              return String((arg as any).content ?? '');
            }
            if (arg && typeof arg === 'object' && (arg as any).type === 'Literal') {
              return String((arg as any).value ?? '');
            }
            if (arg && typeof arg === 'object' && 'wrapperType' in arg && Array.isArray((arg as any).content)) {
              return interpolateWithResultDescriptor((arg as any).content, env, InterpolationContext.Default);
            }
            return String(arg ?? '');
          };

          const trimmedPath = (await resolvePathString()).trim();
          if (!trimmedPath) {
            return finalizeExistsResult(false);
          }

          const { processContentLoader } = await import('./content-loader');
          const loadNode = {
            type: 'load-content',
            source: { type: 'path', raw: trimmedPath }
          };
          const loadResult = await processContentLoader(loadNode as any, env);
          if (isGlobPattern(trimmedPath) && isEmptyLoadArray(loadResult)) {
            return finalizeExistsResult(false);
          }
          return finalizeExistsResult(true);
        }

        if (arg && typeof arg === 'object' && (arg as any).type === 'load-content') {
          const { processContentLoader } = await import('./content-loader');
          const loadResult = await processContentLoader(arg as any, env);
          const sourceString = await resolveLoadContentSource(arg);
          if (sourceString && isGlobPattern(sourceString) && isEmptyLoadArray(loadResult)) {
            return finalizeExistsResult(false);
          }
          return finalizeExistsResult(true);
        }

        if (arg && typeof arg === 'object' && (arg as any).type === 'ExecInvocation') {
          await evaluateExecInvocation(arg as any, env);
          return finalizeExistsResult(true);
        }

        if (arg && typeof arg === 'object' && (arg as any).type === 'VariableReference') {
          const varRef = arg as any;
          let targetVar = env.getVariable(varRef.identifier);
          if (!targetVar && env.hasVariable(varRef.identifier)) {
            targetVar = await env.getResolverVariable(varRef.identifier);
          }
          if (!targetVar) {
            return finalizeExistsResult(false);
          }

          const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
          let resolvedValue = await resolveVariable(targetVar, env, ResolutionContext.FieldAccess);
          let fieldMissing = false;
          if (varRef.fields && varRef.fields.length > 0) {
            const { accessField } = await import('../utils/field-access');
            const normalized = normalizeFields(varRef.fields);
            for (const field of normalized) {
              const fieldResult = await accessField(resolvedValue, field, {
                preserveContext: true,
                env,
                sourceLocation: nodeSourceLocation,
                returnUndefinedForMissing: true
              });
              resolvedValue = (fieldResult as any).value;
              if (resolvedValue === undefined) {
                fieldMissing = true;
                break;
              }
            }
          }

          if (fieldMissing) {
            return finalizeExistsResult(false);
          }

          if (varRef.pipes && varRef.pipes.length > 0) {
            const { processPipeline } = await import('./pipeline/unified-processor');
            await processPipeline({
              value: resolvedValue,
              env,
              node: varRef,
              identifier: varRef.identifier
            });
          }

          return finalizeExistsResult(true);
        }

        return finalizeExistsResult(true);
      } catch {
        return finalizeExistsResult(false);
      }
    }

    // Check if this is a multi-arg builtin transformer (like keychain functions)
    if (variable.internal?.keychainFunction) {
      // Keychain functions need all args passed as an array
      const evaluatedArgs: any[] = [];
      for (const arg of args) {
        let evalArg = arg;
        if (evalArg && typeof evalArg === 'object' && 'type' in evalArg) {
          const { evaluateDataValue } = await import('./data-value-evaluator');
          evalArg = await evaluateDataValue(evalArg as any, env);
        }
        if (typeof evalArg === 'string') {
          evaluatedArgs.push(evalArg);
        } else if (evalArg && typeof evalArg === 'object') {
          evaluatedArgs.push(await interpolateWithResultDescriptor([evalArg], env));
        } else {
          evaluatedArgs.push(String(evalArg));
        }
      }
      const keychainFunction = variable.internal?.keychainFunction;
      if (keychainFunction) {
        const service = String(evaluatedArgs[0] ?? '');
        const account = String(evaluatedArgs[1] ?? '');
        if (!service || !account) {
          throw new MlldInterpreterError('Keychain access requires service and account', {
            code: 'KEYCHAIN_PATH_INVALID'
          });
        }
        enforceKeychainAccess(
          env,
          { service, account, action: keychainFunction },
          node.location ? astLocationToSourceLocation(node.location) : undefined
        );
      }
      const result = await variable.internal.transformerImplementation(evaluatedArgs);
      const normalized = normalizeTransformerResult(commandName, result);
      let resolvedValue = normalized.value;
      const wrapOptions = normalized.options;

      if (keychainFunction === 'get' && resolvedValue !== null && resolvedValue !== undefined) {
        const keychainDescriptor = makeSecurityDescriptor({
          labels: ['secret'],
          taint: ['secret', 'src:keychain'],
          sources: ['keychain.get']
        });
        const existingDescriptor = extractSecurityDescriptor(resolvedValue, {
          recursive: true,
          mergeArrayElements: true
        });
        const mergedDescriptor = existingDescriptor
          ? env.mergeSecurityDescriptors(existingDescriptor, keychainDescriptor)
          : keychainDescriptor;
        if (isStructuredValue(resolvedValue)) {
          applySecurityDescriptorToStructuredValue(resolvedValue, mergedDescriptor);
        } else {
          const wrapped = wrapStructured(resolvedValue);
          applySecurityDescriptorToStructuredValue(wrapped, mergedDescriptor);
          resolvedValue = wrapped;
        }
      }

      endResolutionTrackingIfNeeded();

      if (node.withClause) {
        if (node.withClause.pipeline) {
          const { processPipeline } = await import('./pipeline/unified-processor');
          const pipelineInputValue = toPipelineInput(resolvedValue, wrapOptions);
          const pipelineResult = await processPipeline({
            value: pipelineInputValue,
            env,
            node,
            identifier: node.identifier,
            descriptorHint: resultSecurityDescriptor
          });
          return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, env);
        } else {
          return applyWithClause(resolvedValue, node.withClause, env);
        }
      }
      return { value: resolvedValue ?? '', wrapOptions };
    }

    // Regular transformer handling (single arg)
    let inputValue = '';
    if (args.length > 0) {
      let arg: any = args[0];
      if (arg && typeof arg === 'object' && 'type' in arg) {
        const { evaluateDataValue } = await import('./data-value-evaluator');
        arg = await evaluateDataValue(arg as any, env);
      }
      const transformerName = (variable.name ?? commandName ?? '').toLowerCase();
      if (transformerName === 'keep' || transformerName === 'keepstructured') {
        inputValue = arg as any;
      } else if (typeof arg === 'string') {
        inputValue = arg;
      } else if (arg && typeof arg === 'object') {
        inputValue = await interpolateWithResultDescriptor([arg], env);
      } else {
        inputValue = String(arg);
      }
    }

    // Call the transformer implementation directly
    const result = await variable.internal.transformerImplementation(inputValue);
    const normalized = normalizeTransformerResult(commandName, result);
    const resolvedValue = normalized.value;
    const wrapOptions = normalized.options;

    // Clean up resolution tracking before returning
    endResolutionTrackingIfNeeded();

    return applyInvocationWithClause(resolvedValue, wrapOptions);
  }
  
  // Get the full executable definition from metadata
  let definition = variable.internal?.executableDef as ExecutableDefinition;
  if (!definition) {
    throw new MlldInterpreterError(`Executable ${commandName} has no definition in metadata`);
  }
  const mcpTool = (variable.internal as any)?.mcpTool as
    | { name?: unknown; source?: unknown }
    | undefined;
  if (mcpTool && typeof mcpTool.name === 'string' && mcpTool.name.trim().length > 0) {
    const mcpName = mcpTool.name.trim();
    const mcpSource = typeof mcpTool.source === 'string' && mcpTool.source.trim().length > 0
      ? mcpTool.source.trim()
      : undefined;
    env.enforceMcpServerAllowed(mcpSource, {
      sourceLocation: nodeSourceLocation ?? undefined
    });
    const toolCandidates = [
      commandName,
      variable.name,
      mcpName
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const allowedByToolScope = toolCandidates.some(candidate => env.isToolAllowed(candidate, mcpName));
    if (!allowedByToolScope) {
      throw new MlldSecurityError(
        `MCP tool '${mcpName}' denied by env.tools`,
        {
          code: 'ENV_TOOL_DENIED',
          sourceLocation: nodeSourceLocation ?? undefined,
          env
        }
      );
    }
  }
  const isPartial = isPartialExecutable(definition);
  const boundArgs = isPartial && Array.isArray(definition.boundArgs) ? definition.boundArgs : [];
  if (isPartial) {
    definition = definition.base;
  }
  if (process.env.DEBUG_EXEC === 'true' && commandName === 'pipe') {
    // Debug aid for pipeline identity scenarios
    console.error('[debug-exec] definition for @pipe:', JSON.stringify(definition, null, 2));
  }
  ({ streamingRequested, streamingEnabled } = mergeExecInvocationStreamingFromDefinition(
    streamingRequested,
    streamingOptions,
    definition
  ));

  let whenExprNode: WhenExpressionNode | null = null;
  if (definition.language === 'mlld-when') {
    const candidate =
      Array.isArray(definition.codeTemplate) && definition.codeTemplate.length > 0
        ? (definition.codeTemplate[0] as WhenExpressionNode | undefined)
        : undefined;
    if (!candidate || candidate.type !== 'WhenExpression') {
      throw new MlldInterpreterError('mlld-when executable missing WhenExpression node');
    }
    whenExprNode = candidate;
  }
  
  // Create a child environment for parameter substitution
  let execEnv = env.createChild();

  // Set captured module environment for variable lookup fallback
  if (variable?.internal?.capturedModuleEnv instanceof Map) {
    execEnv.setCapturedModuleEnv(variable.internal.capturedModuleEnv);
  }

  // Handle command arguments - args were already extracted above
  const params = definition.paramNames || [];
  const { evaluatedArgStrings, evaluatedArgs } = await evaluateExecInvocationArgs({
    args,
    env,
    commandName,
    services: {
      interpolate: interpolateWithResultDescriptor,
      evaluateExecInvocation,
      mergeResultDescriptor
    }
  });

  if (process.env.MLLD_DEBUG_FIX === 'true') {
    console.error('[evaluateExecInvocation] evaluated args', {
      commandName,
      argCount: evaluatedArgs.length,
      argTypes: evaluatedArgs.map(a => (a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a)),
      argPreview: evaluatedArgs.map(a => {
        if (isStructuredValue(a)) return { structured: true, type: a.type, dataType: typeof a.data };
        if (a && typeof a === 'object') return { keys: Object.keys(a).slice(0, 5) };
        return a;
      })
    });
  }
  
  // Track original Variables for arguments
  const originalVariables: (Variable | undefined)[] = new Array(args.length);
  const guardVariableCandidates: (Variable | undefined)[] = new Array(args.length);
  const expressionSourceVariables: (Variable | undefined)[] = new Array(args.length);
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
          guardVariableCandidates[i] = variable;
        } else {
          originalVariables[i] = variable;
          guardVariableCandidates[i] = variable;
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
    } else if (
      arg &&
      typeof arg === 'object' &&
      'type' in arg &&
      arg.type === 'ExecInvocation'
    ) {
      const objectRef = (arg.commandRef as any)?.objectReference;
      if (
        objectRef &&
        typeof objectRef === 'object' &&
        objectRef.type === 'VariableReference' &&
        objectRef.identifier
      ) {
        const baseVariable = env.getVariable(objectRef.identifier);
        if (baseVariable) {
          expressionSourceVariables[i] = baseVariable;
        }
      }
    } else if (
      arg &&
      typeof arg === 'object' &&
      'type' in arg &&
      (arg.type === 'object' || arg.type === 'array')
    ) {
      // Inline object/array literals: scan AST for variable references with security labels
      const { extractDescriptorsFromDataAst } = await import('./var');
      const dataDescriptor = extractDescriptorsFromDataAst(arg, env);
      if (dataDescriptor && (dataDescriptor.labels.length > 0 || dataDescriptor.taint.length > 0)) {
        const guardInputSource: VariableSource = {
          directive: 'var',
          syntax: 'expression',
          hasInterpolation: false,
          isMultiLine: false
        };
        const syntheticVar = createSimpleTextVariable(
          '__inline_arg__',
          evaluatedArgStrings[i] ?? '',
          guardInputSource
        );
        syntheticVar.value = evaluatedArgs[i];
        if (!syntheticVar.mx) syntheticVar.mx = {};
        updateVarMxFromDescriptor(syntheticVar.mx as VariableContext, dataDescriptor);
        if ((syntheticVar.mx as any).mxCache) delete (syntheticVar.mx as any).mxCache;
        guardVariableCandidates[i] = syntheticVar;
      }
    }
  }

  if (boundArgs.length > 0) {
    const boundArgStrings = boundArgs.map(arg => stringifyExecGuardArg(arg));
    evaluatedArgs.unshift(...boundArgs);
    evaluatedArgStrings.unshift(...boundArgStrings);
    originalVariables.unshift(...Array.from({ length: boundArgs.length }, () => undefined));
    guardVariableCandidates.unshift(...Array.from({ length: boundArgs.length }, () => undefined));
    expressionSourceVariables.unshift(...Array.from({ length: boundArgs.length }, () => undefined));
  }
  
  const guardHelperImpl =
    (variable.internal as any)?.guardHelperImplementation;
  if (
    (variable.internal as any)?.isGuardHelper &&
    typeof guardHelperImpl === 'function'
  ) {
    const impl = guardHelperImpl as (args: readonly unknown[]) => unknown | Promise<unknown>;
    const helperResult = await impl(evaluatedArgs);
    return createEvalResult(helperResult, env);
  }

  let mcpSecurityDescriptor = (node as any).meta?.mcpSecurity as SecurityDescriptor | undefined;
  if (!mcpSecurityDescriptor) {
    const mcpTool = (variable.internal as any)?.mcpTool;
    if (mcpTool?.name) {
      mcpSecurityDescriptor = makeSecurityDescriptor({
        taint: ['src:mcp'],
        sources: [`mcp:${mcpTool.name}`]
      });
    }
  }
  const mcpToolLabels = (node as any).meta?.mcpToolLabels;
  const toolLabels = Array.isArray(mcpToolLabels)
    ? mcpToolLabels.filter(label => typeof label === 'string' && label.length > 0)
    : [];

  const { guardInputsWithMapping, guardInputs } = prepareExecGuardInputs({
    env,
    evaluatedArgs,
    evaluatedArgStrings,
    guardVariableCandidates,
    expressionSourceVariables,
    mcpSecurityDescriptor
  });
  let postHookInputs: readonly Variable[] = guardInputs;
  const execDescriptor = getVariableSecurityDescriptor(variable);
  const {
    operationContext,
    exeLabels,
    mergePolicyInputDescriptor
  } = await createExecOperationContextAndEnforcePolicy({
    node,
    definition,
    commandName,
    operationName: variable.name ?? commandName,
    toolLabels,
    env,
    execEnv,
    policyEnforcer,
    mcpSecurityDescriptor,
    execDescriptor,
    services: {
      interpolateWithResultDescriptor,
      getResultSecurityDescriptor: () => resultSecurityDescriptor,
      resolveStdinInput
    }
  });

  const finalizeResult = async (result: EvalResult): Promise<EvalResult> =>
    runExecPostGuards({
      env,
      execEnv,
      node,
      operationContext,
      postHookInputs,
      result,
      whenExprNode
    });

  return await env.withOpContext(operationContext, async () => {
    return AutoUnwrapManager.executeWithPreservation(async () => {
      const {
        preDecision,
        postHookInputs: nextPostHookInputs,
        transformedGuardSet
      } = await runExecPreGuards({
        env,
        node,
        operationContext,
        guardInputs,
        guardInputsWithMapping,
        guardVariableCandidates,
        evaluatedArgs,
        evaluatedArgStrings
      });
      postHookInputs = nextPostHookInputs;
      bindExecParameterVariables({
        params,
        evaluatedArgs,
        evaluatedArgStrings,
        originalVariables,
        guardVariableCandidates,
        definition,
        execEnv,
        transformedGuardSet,
        createParameterMetadata
      });

      // Capture descriptors from executable definition and parameters
      const descriptorPieces: SecurityDescriptor[] = [];
      const variableDescriptor = getVariableSecurityDescriptor(variable);
      if (variableDescriptor) {
        descriptorPieces.push(variableDescriptor);
      }
      const mergedParamDescriptor = collectAndMergeParameterDescriptors(params, execEnv);
      if (mergedParamDescriptor) {
        descriptorPieces.push(mergedParamDescriptor);
      }
      if (mcpSecurityDescriptor) {
        descriptorPieces.push(mcpSecurityDescriptor);
      }
      if (descriptorPieces.length > 0) {
        resultSecurityDescriptor =
          descriptorPieces.length === 1
            ? descriptorPieces[0]
            : env.mergeSecurityDescriptors(...descriptorPieces);
      }
      const paramFlowHandled = await enforceExecParamLabelFlow({
        env,
        execEnv,
        node,
        whenExprNode,
        policyEnforcer,
        operationContext,
        exeLabels,
        resultSecurityDescriptor
      });
      if (paramFlowHandled) {
        return finalizeResult(paramFlowHandled);
      }
      resultSecurityDescriptor = applyExecOutputPolicyLabels({
        policyEnforcer,
        exeLabels,
        resultSecurityDescriptor
      });
      if (resultSecurityDescriptor) {
        env.recordSecurityDescriptor(resultSecurityDescriptor);
      }

      const preGuardHandled = await handleExecPreGuardDecision({
        preDecision,
        node,
        env,
        execEnv,
        operationContext,
        whenExprNode
      });
      if (preGuardHandled) {
        return finalizeResult(preGuardHandled);
      }
  
  let result: unknown;
  let workingDirectory: string | undefined;
  if ('workingDir' in definition && (definition as any).workingDir) {
    workingDirectory = await resolveWorkingDirectory(
      (definition as any).workingDir as any,
      execEnv,
      {
        sourceLocation: node.location ?? undefined,
        directiveType: 'exec'
      }
    );
  }
  
  const nonCommandResult = await executeNonCommandExecutable({
    definition,
    commandName,
    node,
    nodeSourceLocation,
    env,
    execEnv,
    variable,
    params,
    evaluatedArgs,
    resultSecurityDescriptor,
    services: {
      interpolateWithResultDescriptor,
      toPipelineInput,
      evaluateExecInvocation
    }
  });
  if (nonCommandResult !== undefined) {
    result = nonCommandResult;
  }
  // Handle command executables
  else if (isCommandExecutable(definition)) {
    result = await executeCommandExecutable({
      definition,
      commandName,
      node,
      env,
      execEnv,
      variable,
      params,
      evaluatedArgs,
      evaluatedArgStrings,
      originalVariables,
      exeLabels,
      preDecisionMetadata: preDecision?.metadata,
      policyEnforcer,
      operationContext,
      mergePolicyInputDescriptor,
      workingDirectory,
      streamingEnabled,
      pipelineId,
      hasStreamFormat,
      suppressTerminal: streamingOptions.suppressTerminal === true,
      chunkEffect,
      services: {
        interpolateWithResultDescriptor,
        mergeResultDescriptor,
        getResultSecurityDescriptor: () => resultSecurityDescriptor,
        resolveStdinInput
      }
    });
  }
  // Handle code executables
  else if (isCodeExecutable(definition)) {
    const codeResult = await executeCodeExecutable({
      definition,
      commandName,
      node,
      env,
      execEnv,
      variable,
      params,
      evaluatedArgs,
      evaluatedArgStrings,
      workingDirectory,
      whenExprNode,
      services: {
        interpolateWithResultDescriptor,
        toPipelineInput,
        mergeResultDescriptor,
        getResultSecurityDescriptor: () => resultSecurityDescriptor,
        finalizeResult
      }
    });
    if (codeResult.kind === 'return') {
      return codeResult.evalResult;
    }
    result = codeResult.result;
    execEnv = codeResult.execEnv;
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
        current = await accessField(current, f, { env, sourceLocation: nodeSourceLocation });
      }
      result = current;
    } catch (e) {
      // Preserve existing behavior: if field access fails, surface error as interpreter error
      throw e;
    }
  }

  // Normalize Variable results into raw values (with StructuredValue wrappers when enabled)
  if (result && typeof result === 'object') {
    const { isVariable, extractVariableValue } = await import('../utils/variable-resolution');
    if (isVariable(result)) {
      const extracted = await extractVariableValue(result, execEnv);
      const typeHint = Array.isArray(extracted)
        ? 'array'
        : typeof extracted === 'object' && extracted !== null
          ? 'object'
          : 'text';
      const structured = wrapStructured(extracted as any, typeHint as any);
      result = structured;
    }
  }

  mergeResultDescriptor(extractSecurityDescriptor(result));

  if (resultSecurityDescriptor) {
    const structured = wrapExecResult(result);
    const existing = getStructuredSecurityDescriptor(structured);
    const merged = existing
      ? env.mergeSecurityDescriptors(existing, resultSecurityDescriptor)
      : resultSecurityDescriptor;
    setStructuredSecurityDescriptor(structured, merged);
    result = structured;
  }

  // Clean up resolution tracking after executable body completes, before pipeline/with clause processing
  // This allows pipelines to retry/re-execute the same function without false circular reference detection
  // Skip builtin methods and reserved names as they were never added to the resolution stack
  endResolutionTrackingIfNeeded();

  if (process.env.MLLD_DEBUG_FIX === 'true') {
    try {
      const summary = {
        commandName,
        type: typeof result,
        isStructured: isStructuredValue(result),
        keys: result && typeof result === 'object' ? Object.keys(result as any).slice(0, 5) : undefined,
        preview:
          isStructuredValue(result) && typeof (result as any).data === 'object'
            ? Object.keys((result as any).data || {}).slice(0, 5)
            : undefined,
        text:
          isStructuredValue(result) && typeof (result as any).text === 'string'
            ? String((result as any).text).slice(0, 120)
            : undefined
      };
      console.error('[evaluateExecInvocation] result summary', summary);
      if (
        commandName === 'needsMeta' ||
        commandName === 'jsDefault' ||
        commandName === 'jsKeep' ||
        commandName === 'agentsContext'
      ) {
        try {
          fs.appendFileSync('/tmp/mlld-debug.log', JSON.stringify(summary) + '\n');
        } catch {}
      }
    } catch {}
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
        return wrapExecResult(freshResult.value);
      };
      
      // Create synthetic source stage for retryable pipeline
      const SOURCE_STAGE = {
        rawIdentifier: '__source__',
        identifier: [],
        args: [],
        fields: [],
        rawArgs: []
      };

      // Attach builtin effects BEFORE prepending synthetic source
      // This ensures effects are attached to user-defined stages, not to __source__
      let userPipeline = node.withClause.pipeline;
      try {
        const { attachBuiltinEffects } = await import('./pipeline/effects-attachment');
        const { functionalPipeline } = attachBuiltinEffects(userPipeline as any);
        userPipeline = functionalPipeline as any;
      } catch {
        // If helper import fails, proceed without effect attachment
      }

      // Prepend synthetic source stage after effect attachment
      const normalizedPipeline = [SOURCE_STAGE, ...userPipeline];
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[exec-invocation] Creating pipeline with synthetic source:', {
          originalLength: node.withClause.pipeline.length,
          normalizedLength: normalizedPipeline.length,
          stages: normalizedPipeline.map((p: any) => Array.isArray(p) ? '[parallel]' : (p.rawIdentifier || 'unknown'))
        });
      }
      
      // Execute the pipeline with the ExecInvocation result as initial input
      // Mark it as retryable with the source function
      const pipelineInput = wrapExecResult(result);
      const pipelineResult = await executePipeline(
        pipelineInput,
        normalizedPipeline,
        execEnv,  // Use execEnv which has merged nodes
        node.location,
        node.withClause.format,
        true,  // isRetryable
        sourceFunction,
        true,  // hasSyntheticSource
        undefined,
        undefined,
        { returnStructured: true }
      );
      
      // Still need to handle other withClause features (trust, needs)
      let pipelineValue = wrapPipelineResult(pipelineResult);
      const pipelineDescriptor = getStructuredSecurityDescriptor(pipelineValue);
      const combinedDescriptor = pipelineDescriptor
        ? (resultSecurityDescriptor
            ? env.mergeSecurityDescriptors(pipelineDescriptor, resultSecurityDescriptor)
            : pipelineDescriptor)
        : resultSecurityDescriptor;
      if (combinedDescriptor) {
        setStructuredSecurityDescriptor(pipelineValue, combinedDescriptor);
        mergeResultDescriptor(combinedDescriptor);
      }
      const withClauseResult = await applyWithClause(
        pipelineValue,
        { ...node.withClause, pipeline: undefined },
        execEnv
      );
      const finalWithClauseResult = await finalizeResult(withClauseResult);
      return finalWithClauseResult;
    } else {
      const withClauseResult = await applyWithClause(result, node.withClause, execEnv);
      const finalWithClauseResult = await finalizeResult(withClauseResult);
      return finalWithClauseResult;
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
  const finalEvalResult = await finalizeResult(createEvalResult(result, execEnv));
  return finalEvalResult;
    });
  });
  } finally {
    // Ensure resolution tracking is always cleaned up, even on error paths.
    endResolutionTrackingIfNeeded();

    finalizeExecInvocationStreaming(env, streamingManager);
  }
}
