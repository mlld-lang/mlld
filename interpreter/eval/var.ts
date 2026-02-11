import type { DirectiveNode, SourceLocation, VarValue } from '@core/types';
import type { ToolCollection } from '@core/types/tools';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { logger } from '@core/utils/logger';
import {
  Variable,
  VariableSource,
  VariableMetadataUtils,
  createSimpleTextVariable,
  createStructuredValueVariable,
  isExecutableVariable,
} from '@core/types/variable';
import { createCapabilityContext } from '@core/types/security';
import { isStructuredValue, extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { maybeAutosignVariable } from './auto-sign';
import { isExeReturnControl } from './exe-return';
import { createVarAssignmentContext } from './var/assignment-context';
import {
  createDescriptorState,
  extractDescriptorsFromDataAst
} from './var/security-descriptor';
import { createRhsContentEvaluator } from './var/rhs-content';
import { createReferenceEvaluator } from './var/reference-evaluator';
import { createExecutionEvaluator } from './var/execution-evaluator';
import { createRhsDispatcher } from './var/rhs-dispatcher';
import { createVariableBuilder } from './var/variable-builder';

export { extractDescriptorsFromDataAst };

export interface VarAssignmentResult {
  identifier: string;
  variable: Variable;
  evalResultOverride?: EvalResult;
}

/**
 * Create VariableSource metadata based on the value node type
 */
function createVariableSource(valueNode: VarValue | undefined, directive: DirectiveNode): VariableSource {
  const baseSource: VariableSource = {
    directive: 'var',
    syntax: 'quoted', // default
    hasInterpolation: false,
    isMultiLine: false
  };

  // Handle primitive values (numbers, booleans, null)
  if (typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null) {
    // For primitives, use the directive metadata to determine syntax
    if (directive.meta?.primitiveType) {
      baseSource.syntax = 'quoted'; // Primitives are treated like quoted values
    }
    return baseSource;
  }
  
  // Determine syntax type based on AST node
  if (valueNode.type === 'array') {
    baseSource.syntax = 'array';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'object') {
    baseSource.syntax = 'object';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'command') {
    baseSource.syntax = 'command';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'code') {
    baseSource.syntax = 'code';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'path') {
    baseSource.syntax = 'path';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'section') {
    baseSource.syntax = 'path'; // sections are path-based
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'VariableReference') {
    baseSource.syntax = 'reference';
  } else if (valueNode.type === 'NewExpression') {
    baseSource.syntax = 'reference';
  } else if (directive.meta?.wrapperType) {
    // Use wrapper type from directive metadata
    baseSource.wrapperType = directive.meta.wrapperType;
    if (directive.meta.wrapperType === 'singleQuote') {
      baseSource.syntax = 'quoted';
      baseSource.hasInterpolation = false;
    } else if (directive.meta.wrapperType === 'doubleQuote' || directive.meta.wrapperType === 'backtick' || directive.meta.wrapperType === 'doubleColon') {
      baseSource.syntax = 'template';
      baseSource.hasInterpolation = true; // Assume interpolation for these types
    } else if (directive.meta.wrapperType === 'tripleColon') {
      baseSource.syntax = 'template';
      baseSource.hasInterpolation = true; // Triple colon uses {{var}} interpolation
    }
  }

  // Multi-line content is determined during evaluation, not from raw AST
  // The isMultiLine property will be set based on the evaluated content

  return baseSource;
}

/**
 * Evaluate @var directives.
 * This is the unified variable assignment directive that replaces @text and @data.
 * Type is inferred from the RHS syntax.
 */
export async function prepareVarAssignment(
  directive: DirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<VarAssignmentResult> {
  const { baseDescriptor, capabilityKind, identifier, operationMetadata, securityLabels, sourceLocation } =
    createVarAssignmentContext(directive, env);
  const descriptorState = createDescriptorState(env);
  const {
    extractSecurityFromValue,
    interpolateWithSecurity,
    mergeResolvedDescriptor
  } = descriptorState;
  const rhsContentEvaluator = createRhsContentEvaluator(env, {
    interpolateWithSecurity,
    sourceLocation,
    withClause: directive.values?.withClause
  });
  const referenceEvaluator = createReferenceEvaluator({
    env,
    directive,
    descriptorState
  });
  const executionEvaluator = createExecutionEvaluator({
    context,
    descriptorState,
    directive,
    env,
    interpolateWithSecurity,
    sourceLocation
  });

  const finalizeVariable = (variable: Variable): Variable => {
    const resolvedSecurityDescriptor = descriptorState.getResolvedDescriptor();
    const descriptor = resolvedSecurityDescriptor
      ? env.mergeSecurityDescriptors(baseDescriptor, resolvedSecurityDescriptor)
      : baseDescriptor;
    const capabilityContext = createCapabilityContext({
      kind: capabilityKind,
      descriptor,
      metadata: { identifier },
      operation: operationMetadata
    });
    // Extract existing security from variable's mx
    const existingSecurity = extractSecurityFromValue(variable);
    const finalMetadata = VariableMetadataUtils.applySecurityMetadata(existingSecurity ? { security: existingSecurity } : undefined, {
      existingDescriptor: descriptor,
      capability: capabilityContext
    });
    // Update mx from the final security descriptor
    if (!variable.mx) {
      variable.mx = {};
    }
    if (finalMetadata.security) {
      updateVarMxFromDescriptor(variable.mx, finalMetadata.security);
    }
    return VariableMetadataUtils.attachContext(variable);
  };


  // Get the value node - this contains type information from the parser
  const valueNodes = directive.values?.value;
  
  // Debug: Log the value structure
  if (process.env.MLLD_DEBUG === 'true') {
    console.log(`\n=== Processing @${identifier} ===`);
    if (Array.isArray(valueNodes) && valueNodes.length > 0) {
      console.log('  Value node type:', valueNodes[0].type);
      console.log('  Has directive.values.withClause?', !!directive.values?.withClause);
      console.log('  Has directive.meta.withClause?', !!directive.meta?.withClause);
      if (directive.values?.withClause || directive.meta?.withClause) {
        const wc = directive.values?.withClause || directive.meta?.withClause;
        console.log('  Pipeline:', wc.pipeline?.map((p: any) => p.rawIdentifier).join(' | '));
      }
    }
  }
  if (!valueNodes || !Array.isArray(valueNodes) || valueNodes.length === 0) {
    throw new Error('Var directive missing value');
  }
  
  // For templates with multiple nodes (e.g., ::text {{var}}::), we need the whole array
  const valueNode = valueNodes.length === 1 ? valueNodes[0] : valueNodes;
  const isToolsCollection = directive.meta?.isToolsCollection === true;
  const rhsDispatcher = createRhsDispatcher({
    context,
    directive,
    env,
    executionEvaluator,
    identifier,
    interpolateWithSecurity,
    isToolsCollection,
    mergeResolvedDescriptor,
    referenceEvaluator,
    rhsContentEvaluator,
    sourceLocation
  });

  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[var.ts] Extracted valueNode:', {
      identifier,
      type: valueNode?.type,
      isArray: Array.isArray(valueNode),
      hasWithClause: !!(valueNode?.withClause),
      hasPipeline: !!(valueNode?.withClause?.pipeline)
    });
  }

  if (isToolsCollection && (!valueNode || typeof valueNode !== 'object' || valueNode.type !== 'object')) {
    throw new Error('Tool collections must be object literals');
  }

  try {
  let resolvedValue: any;
  let toolCollection: ToolCollection | undefined;
  const rhsResult = await rhsDispatcher.evaluate(valueNode);
  if (rhsResult.type === 'executable-variable') {
    const finalVar = finalizeVariable(rhsResult.variable);
    return {
      identifier,
      variable: finalVar,
      evalResultOverride: {
        value: finalVar,
        env,
        stdout: '',
        stderr: '',
        exitCode: 0
      }
    };
  }

  if (rhsResult.type === 'return-control') {
    const returnSource = createVariableSource(valueNode as any, directive);
    return {
      identifier,
      variable: createSimpleTextVariable(identifier, '', returnSource),
      evalResultOverride: { value: rhsResult.value, env }
    };
  }

  if (rhsResult.type === 'for-expression') {
    const finalVar = finalizeVariable(rhsResult.variable);
    return {
      identifier,
      variable: finalVar,
      evalResultOverride: { value: finalVar, env }
    };
  }

  resolvedValue = rhsResult.value;

  if (isToolsCollection) {
    toolCollection = normalizeToolCollection(resolvedValue, env);
    resolvedValue = toolCollection;
  }

  const resolvedValueDescriptor = extractSecurityDescriptor(resolvedValue, {
    recursive: true,
    mergeArrayElements: true
  });
  mergeResolvedDescriptor(resolvedValueDescriptor);

  const location = sourceLocation;
  const source = createVariableSource(valueNode, directive);
  const variableBuilder = createVariableBuilder({
    directive,
    extractSecurityFromValue,
    identifier,
    interpolateWithSecurity,
    location,
    resolvedValueDescriptor,
    securityLabels,
    source,
    valueNode
  });
  const { applySecurityOptions, baseCtx, baseInternal } = variableBuilder;
  let variable = await variableBuilder.build({
    resolvedValue,
    toolCollection
  });

  // Use unified pipeline processor
  const { processPipeline } = await import('./pipeline/unified-processor');
  
  // Skip pipeline processing if:
  // 1. This is an ExecInvocation with a withClause (already processed by evaluateExecInvocation)
  // 2. This is a VariableReference with pipes (already processed above around line 406)
  // 3. This is a load-content node with pipes (already processed by content-loader)
  let result = variable;
  const skipPipeline = (valueNode && valueNode.type === 'ExecInvocation' && valueNode.withClause) ||
                       (valueNode && valueNode.type === 'VariableReference' && valueNode.pipes) ||
                       (valueNode && valueNode.type === 'load-content' && valueNode.pipes);
  // If the command was executed via evaluateRun (stdin/pipeline already applied),
  // do not run pipeline processing again.
  const handledByRun = (valueNode && valueNode.type === 'command')
    && !!(directive.values?.withClause || directive.meta?.withClause);
  
  if (!skipPipeline && !handledByRun) {
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[var.ts] Calling processPipeline:', {
        identifier,
        variableType: variable.type,
        hasCtx: !!variable.mx,
        hasInternal: !!variable.internal,
        isRetryable: variable.internal?.isRetryable || false,
        hasSourceFunction: !!(variable.internal?.sourceFunction),
        sourceNodeType: (variable.internal?.sourceFunction as any)?.type
      });
    }
    // Process through unified pipeline (handles detection, validation, execution)
    result = await processPipeline({
      value: variable,
      env,
      node: valueNode,
      directive,
      identifier,
      location: directive.location,
      isRetryable: variable.internal?.isRetryable || false
    });
  }
  
  // If pipeline was executed, result will be a string
  // Create new variable with the result
    if (typeof result === 'string' && result !== variable.value) {
      const existingSecurity = extractSecurityFromValue(variable);
      const options = applySecurityOptions(
        {
          mx: { ...(variable.mx ?? {}), ...baseCtx },
          internal: { ...(variable.internal ?? {}), ...baseInternal }
        },
        existingSecurity
      );
    variable = createSimpleTextVariable(identifier, result, source, options);
  } else if (isStructuredValue(result)) {
    const existingSecurity = extractSecurityFromValue(variable);
    const options = applySecurityOptions(
      {
        mx: { ...(variable.mx ?? {}), ...baseCtx },
        internal: { ...(variable.internal ?? {}), ...baseInternal, isPipelineResult: true }
      },
      existingSecurity
    );
    variable = createStructuredValueVariable(identifier, result, source, options);
  }
  
  const finalVar = finalizeVariable(variable);
  
  // Debug logging for primitive values
  if (process.env.MLLD_DEBUG === 'true' && identifier === 'sum') {
    logger.debug('Setting variable @sum:', {
      identifier,
      resolvedValue,
      valueType: typeof resolvedValue,
      variableType: finalVar.type,
      variableValue: finalVar.value
    });
  }

  return { identifier, variable: finalVar };
  } catch (error) {
    throw error;
  }
}

export async function evaluateVar(
  directive: DirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const assignment =
    context?.precomputedVarAssignment ?? (await prepareVarAssignment(directive, env, context));
  if (assignment.evalResultOverride && isExeReturnControl(assignment.evalResultOverride.value)) {
    return assignment.evalResultOverride;
  }
  env.setVariable(assignment.identifier, assignment.variable);
  await maybeAutosignVariable(assignment.identifier, assignment.variable, env);
  return assignment.evalResultOverride ?? { value: '', env };
}

function normalizeToolCollection(raw: unknown, env: Environment): ToolCollection {
  if (!isPlainObject(raw)) {
    throw new Error('Tool collections must be object literals');
  }

  const collection: ToolCollection = {};

  for (const [toolName, toolValue] of Object.entries(raw)) {
    if (!isPlainObject(toolValue)) {
      throw new Error(`Tool '${toolName}' must be an object`);
    }

    const mlldRef = (toolValue as Record<string, unknown>).mlld;
    if (mlldRef === undefined || mlldRef === null) {
      throw new Error(`Tool '${toolName}' is missing 'mlld' reference`);
    }

    const mlldName = resolveToolMlldName(mlldRef, toolName);
    const execVar = env.getVariable(mlldName);
    if (!execVar || !isExecutableVariable(execVar)) {
      throw new Error(`Tool '${toolName}' references non-executable '@${mlldName}'`);
    }

    const paramNames = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
    const paramSet = new Set(paramNames);

    const description = toolValue.description;
    if (description !== undefined && typeof description !== 'string') {
      throw new Error(`Tool '${toolName}' description must be a string`);
    }

    const labels = normalizeStringArray(toolValue.labels, toolName, 'labels');
    const expose = normalizeStringArray(toolValue.expose, toolName, 'expose');
    const bind = toolValue.bind;
    const boundKeys =
      bind && isPlainObject(bind)
        ? Object.keys(bind)
        : [];

    if (bind !== undefined) {
      if (!isPlainObject(bind)) {
        throw new Error(`Tool '${toolName}' bind must be an object`);
      }
      const invalidKeys = Object.keys(bind).filter(key => !paramSet.has(key));
      if (invalidKeys.length > 0) {
        throw new Error(
          `Tool '${toolName}' bind keys must match parameters of '@${mlldName}': ${invalidKeys.join(', ')}`
        );
      }
    }

    if (expose) {
      const invalidExpose = expose.filter(name => !paramSet.has(name));
      if (invalidExpose.length > 0) {
        throw new Error(
          `Tool '${toolName}' expose values must match parameters of '@${mlldName}': ${invalidExpose.join(', ')}`
        );
      }
    }

    if (expose) {
      const overlap = boundKeys.filter(key => expose.includes(key));
      if (overlap.length > 0) {
        throw new Error(
          `Tool '${toolName}' expose values cannot include bound parameters: ${overlap.join(', ')}`
        );
      }

      const covered = new Set([...boundKeys, ...expose]);
      let lastCoveredIndex = -1;
      for (let i = 0; i < paramNames.length; i++) {
        if (covered.has(paramNames[i])) {
          lastCoveredIndex = i;
        }
      }
      if (lastCoveredIndex >= 0) {
        const missing: string[] = [];
        for (let i = 0; i <= lastCoveredIndex; i++) {
          const paramName = paramNames[i];
          if (!covered.has(paramName)) {
            missing.push(paramName);
          }
        }
        if (missing.length > 0) {
          throw new Error(
            `Tool '${toolName}' bind and expose must cover required parameters: ${missing.join(', ')}`
          );
        }
      }
    }

    collection[toolName] = {
      mlld: mlldName,
      ...(labels ? { labels } : {}),
      ...(description ? { description } : {}),
      ...(bind ? { bind } : {}),
      ...(expose ? { expose } : {})
    };
  }

  return collection;
}

function resolveToolMlldName(value: unknown, toolName: string): string {
  if (typeof value === 'string') {
    return value.startsWith('@') ? value.slice(1) : value;
  }
  if (value && typeof value === 'object' && isExecutableVariable(value as any)) {
    return (value as any).name;
  }
  if (value && typeof value === 'object' && '__executable' in (value as any)) {
    const name = (value as any).name;
    if (typeof name === 'string' && name.length > 0) {
      return name.startsWith('@') ? name.slice(1) : name;
    }
  }
  throw new Error(`Tool '${toolName}' has invalid 'mlld' reference`);
}

function normalizeStringArray(
  value: unknown,
  toolName: string,
  field: 'labels' | 'expose'
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Tool '${toolName}' ${field} must be an array of strings`);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
