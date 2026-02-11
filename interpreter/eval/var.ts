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
  createInterpolatedTextVariable,
  createTemplateVariable,
  createExecutableVariable,
  createArrayVariable,
  createObjectVariable,
  createFileContentVariable,
  createSectionContentVariable,
  createComputedVariable,
  createCommandResultVariable,
  createStructuredValueVariable,
  createPrimitiveVariable,
  isExecutableVariable,
  type VariableMetadata,
  type VariableContext,
  type VariableInternalMetadata,
  type VariableFactoryInitOptions
} from '@core/types/variable';
import { createCapabilityContext, type SecurityDescriptor } from '@core/types/security';
import { isStructuredValue, asText, asData, extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { maybeAutosignVariable } from './auto-sign';
import { isExeReturnControl } from './exe-return';
import { createVarAssignmentContext } from './var/assignment-context';
import {
  createDescriptorState,
  extractDescriptorsFromDataAst,
  extractDescriptorsFromTemplateAst,
  type DescriptorCollector
} from './var/security-descriptor';
import {
  evaluateArrayItems,
  evaluateCollectionObject,
  hasComplexArrayItems,
  hasComplexValues
} from './var/collection-evaluator';
import { createRhsContentEvaluator } from './var/rhs-content';
import { createReferenceEvaluator } from './var/reference-evaluator';
import { createExecutionEvaluator, isExecutionValueNode } from './var/execution-evaluator';

export { extractDescriptorsFromDataAst };

export interface VarAssignmentResult {
  identifier: string;
  variable: Variable;
  evalResultOverride?: EvalResult;
}

/**
 * Safely convert a value to string, handling StructuredValue wrappers
 * WHY: Many code paths need to convert values to strings but must check
 *      for StructuredValue wrappers first to avoid producing [object Object]
 */
function valueToString(value: unknown): string {
  if (value === null) return ''; // Preserve legacy behaviour: null interpolates to empty
  if (value === undefined) return 'undefined'; // Preserve 'undefined' string for display
  if (typeof value === 'string') return value;
  if (isStructuredValue(value)) return asText(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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
  // Type-based routing based on the AST structure
  let resolvedValue: any;
  let toolCollection: ToolCollection | undefined;
  const templateAst: any = null; // Store AST for templates that need lazy interpolation
  
  if (valueNode && typeof valueNode === 'object' && valueNode.type === 'FileReference') {
    resolvedValue = await rhsContentEvaluator.evaluateFileReference(valueNode);
    
  // Check for primitive values first (numbers, booleans, null)
  } else if (typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null) {
    // Direct primitive values from the grammar
    resolvedValue = valueNode;
    
  } else if (valueNode.type === 'Literal') {
    // Handle literal nodes (booleans, numbers, strings)
    resolvedValue = valueNode.value;
    
  } else if (valueNode.type === 'array') {
    // Array literal: [1, 2, 3] or [,]
    
    // Check if this array has complex items that need lazy evaluation
    const isComplex = hasComplexArrayItems(valueNode.items || valueNode.elements || []);
    
    if (isComplex) {
      // For complex arrays, store the AST node for lazy evaluation
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('var.ts: Storing complex array AST for lazy evaluation:', {
          identifier,
          valueNode
        });
      }
      // Pre-scan AST for variable references to propagate security labels
      const dataDescriptor = extractDescriptorsFromDataAst(valueNode, env);
      if (dataDescriptor) {
        mergeResolvedDescriptor(dataDescriptor);
      }
      resolvedValue = valueNode;
    } else {
      resolvedValue = await evaluateArrayItems(
        valueNode.items || valueNode.elements || [],
        env,
        mergeResolvedDescriptor,
        context,
        sourceLocation
      );
    }
    
  } else if (valueNode.type === 'object') {
    // Object literal: { "key": "value" }
    if (isToolsCollection) {
      resolvedValue = await evaluateToolCollectionObject(
        valueNode,
        env,
        mergeResolvedDescriptor,
        context,
        sourceLocation
      );
    } else {
      // Check if this object has complex values that need lazy evaluation
      const isComplex = hasComplexValues(valueNode.entries || valueNode.properties);
      
      if (isComplex) {
        // For complex objects, store the AST node for lazy evaluation
        // Pre-scan AST for variable references to propagate security labels
        const dataDescriptor = extractDescriptorsFromDataAst(valueNode, env);
        if (dataDescriptor) {
          mergeResolvedDescriptor(dataDescriptor);
        }
        resolvedValue = valueNode;
      } else {
        resolvedValue = await evaluateCollectionObject(
          valueNode,
          env,
          mergeResolvedDescriptor,
          context,
          sourceLocation
        );
      }
    }
    
  } else if (valueNode.type === 'section') {
    resolvedValue = await rhsContentEvaluator.evaluateSection(valueNode);
    
  } else if (valueNode.type === 'load-content') {
    resolvedValue = await rhsContentEvaluator.evaluateLoadContent(valueNode);
    
  } else if (valueNode.type === 'path') {
    resolvedValue = await rhsContentEvaluator.evaluatePath(valueNode);
    
  } else if (valueNode.type === 'VariableReference') {
    // Variable reference: @otherVar
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Processing VariableReference in var.ts:', {
        identifier,
        varIdentifier: valueNode.identifier,
        hasFields: !!(valueNode.fields && valueNode.fields.length > 0),
        fields: valueNode.fields?.map(f => f.value)
      });
    }

    const referenceResult = await referenceEvaluator.evaluateVariableReference(
      valueNode,
      identifier
    );
    if (referenceResult.executableVariable) {
      const finalVar = finalizeVariable(referenceResult.executableVariable);
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
    resolvedValue = referenceResult.resolvedValue;

  } else if (Array.isArray(valueNode)) {
    // For backtick templates, we should extract the text content directly
    // Check if this is a simple text array (backtick template)
    if (valueNode.length === 1 && valueNode[0].type === 'Text' && directive.meta?.wrapperType === 'backtick') {
        resolvedValue = valueNode[0].content;
    } else if (directive.meta?.wrapperType === 'doubleColon' || directive.meta?.wrapperType === 'tripleColon') {
      // For double/triple colon templates, handle interpolation based on type
      if (directive.meta?.wrapperType === 'tripleColon') {
        // Triple colon uses {{var}} interpolation - store AST for lazy evaluation
        resolvedValue = valueNode; // Store the AST array as the value

        // Extract security descriptors from the template AST so labels persist
        // even before interpolation happens (fixes label persistence through templates)
        const astDescriptor = extractDescriptorsFromTemplateAst(valueNode, env);
        if (astDescriptor) {
          mergeResolvedDescriptor(astDescriptor);
        }

        logger.debug('Storing template AST for triple-colon template', {
          identifier,
          ast: valueNode,
          extractedLabels: astDescriptor?.labels
        });
      } else {
        // Double colon uses @var interpolation - interpolate now
        resolvedValue = await interpolateWithSecurity(valueNode);
      }
    } else {
      // Template or string content - need to interpolate
        resolvedValue = await interpolateWithSecurity(valueNode);
    }
    
  } else if (valueNode.type === 'Text' && 'content' in valueNode) {
    // Simple text content
    resolvedValue = valueNode.content;
    
  } else if (valueNode && valueNode.type === 'VariableReferenceWithTail') {
    // Variable with tail modifiers (e.g., @var @result = @data with { pipeline: [@transform] })
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Processing VariableReferenceWithTail in var.ts');
    }
    const referenceResult = await referenceEvaluator.evaluateVariableReferenceWithTail(
      valueNode,
      identifier
    );
    resolvedValue = referenceResult.resolvedValue;
    
  } else if (valueNode && (valueNode.type === 'BinaryExpression' || valueNode.type === 'TernaryExpression' || valueNode.type === 'UnaryExpression')) {
    // Handle expression nodes
    const { evaluateUnifiedExpression } = await import('./expressions');
    const result = await evaluateUnifiedExpression(valueNode, env);
    resolvedValue = result.value;

  } else if (isExecutionValueNode(valueNode)) {
    const executionResult = await executionEvaluator.evaluateExecutionBranch(
      valueNode,
      identifier
    );
    if (!executionResult) {
      throw new Error(`Execution evaluator returned no result for @${identifier}`);
    }
    if (executionResult.kind === 'return-control') {
      const returnSource = createVariableSource(valueNode as any, directive);
      return {
        identifier,
        variable: createSimpleTextVariable(identifier, '', returnSource),
        evalResultOverride: { value: executionResult.value, env }
      };
    }
    if (executionResult.kind === 'for-expression') {
      const finalVar = finalizeVariable(executionResult.variable);
      return {
        identifier,
        variable: finalVar,
        evalResultOverride: { value: finalVar, env }
      };
    }
    resolvedValue = executionResult.value;

  } else {
    // Default case - try to interpolate as text
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('var.ts: Default case for valueNode:', { valueNode });
    }
    resolvedValue = await interpolateWithSecurity([valueNode]);
  }

  if (isToolsCollection) {
    toolCollection = normalizeToolCollection(resolvedValue, env);
    resolvedValue = toolCollection;
  }

  const resolvedValueDescriptor = extractSecurityDescriptor(resolvedValue, {
    recursive: true,
    mergeArrayElements: true
  });
  mergeResolvedDescriptor(resolvedValueDescriptor);

  // Create and store the appropriate variable type
  const location = sourceLocation;
  const source = createVariableSource(valueNode, directive);
  const baseCtx: Partial<VariableContext> = { definedAt: location };
  const baseInternal: Partial<VariableInternalMetadata> = {};
  if (typeof directive.meta?.rawTemplate === 'string') {
    baseInternal.templateRaw = directive.meta.rawTemplate;
  }

  const cloneFactoryOptions = (
    overrides?: Partial<VariableFactoryInitOptions>
  ): VariableFactoryInitOptions => ({
    mx: { ...baseCtx, ...(overrides?.mx ?? {}) },
    internal: { ...baseInternal, ...(overrides?.internal ?? {}) }
  });

  const applySecurityOptions = (
    overrides?: Partial<VariableFactoryInitOptions>,
    existing?: SecurityDescriptor
  ): VariableFactoryInitOptions => {
    const options = cloneFactoryOptions(overrides);
    // Apply security metadata (still uses legacy metadata internally)
    const finalMetadata = VariableMetadataUtils.applySecurityMetadata(undefined, {
      labels: securityLabels,
      existingDescriptor: existing ?? resolvedValueDescriptor
    });
    // Update mx from security descriptor
    if (finalMetadata?.security) {
      updateVarMxFromDescriptor(options.mx ?? (options.mx = {}), finalMetadata.security);
    }
    if (finalMetadata) {
      options.metadata = {
        ...(options.metadata ?? {}),
        ...finalMetadata
      };
    }
    return options;
  };
  
  // Mark if value came from a function for pipeline retryability
  if (valueNode && (
    valueNode.type === 'ExecInvocation' || 
    valueNode.type === 'command' || 
    valueNode.type === 'code'
  )) {
    baseInternal.isRetryable = true;
    baseInternal.sourceFunction = valueNode; // Store the AST node for re-execution
  }

  let variable: Variable;

  if (process.env.MLLD_DEBUG === 'true') {
    console.log('Creating variable:', {
      identifier,
      valueNodeType: valueNode?.type,
      resolvedValue,
      resolvedValueType: typeof resolvedValue
    });
  }
  if (process.env.MLLD_DEBUG_IDS === 'true' && (identifier === 'squared' || identifier === 'ids')) {
    try {
      const structuredInfo = isStructuredValue(resolvedValue)
        ? {
            type: resolvedValue.type,
            text: resolvedValue.text,
            dataType: typeof resolvedValue.data,
            preview: resolvedValue.data && typeof resolvedValue.data === 'object'
              ? Array.isArray(resolvedValue.data)
                ? { length: resolvedValue.data.length, first: resolvedValue.data[0] }
                : { keys: Object.keys(resolvedValue.data).slice(0, 5) }
              : resolvedValue.data
          }
        : undefined;
      console.error('[var-debug]', {
        identifier,
        resolvedType: typeof resolvedValue,
        isStructured: isStructuredValue(resolvedValue),
        structuredInfo,
        rawValue: resolvedValue
      });
    } catch {}
  }

  // Check if resolvedValue is already a Variable that we should preserve
  const { isVariable } = await import('../utils/variable-resolution');
  if (isVariable(resolvedValue)) {
    // Preserve the existing Variable (e.g., when copying an executable)
    // Update its name and metadata to reflect the new assignment
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Preserving existing Variable:', {
        identifier,
        resolvedValueType: resolvedValue.type,
        resolvedValueName: resolvedValue.name
      });
    }
    const overrides: Partial<VariableFactoryInitOptions> = {
      mx: { ...(resolvedValue.mx ?? {}), ...baseCtx },
      internal: { ...(resolvedValue.internal ?? {}), ...baseInternal }
    };
    // Preserve security from existing variable
    const existingSecurity = extractSecurityFromValue(resolvedValue);
    const options = applySecurityOptions(overrides, existingSecurity);
    variable = {
      ...resolvedValue,
      name: identifier,
      definedAt: location,
      mx: options.mx,
      internal: options.internal
    };
    VariableMetadataUtils.attachContext(variable);
  } else if (isStructuredValue(resolvedValue)) {
    const options = applySecurityOptions(
      {
        internal: {
          isStructuredValue: true,
          structuredValueType: resolvedValue.type
        }
      },
      resolvedValueDescriptor
    );
    variable = createStructuredValueVariable(identifier, resolvedValue, source, options);

  } else if (resolvedValue && typeof resolvedValue === 'object' && (resolvedValue as any).__executable) {
    const execDef = (resolvedValue as any).executableDef ?? (resolvedValue as any).value;
    const options = applySecurityOptions(
      {
        internal: {
          executableDef: execDef
        }
      },
      resolvedValueDescriptor
    );
    variable = createExecutableVariable(
      identifier,
      'command',
      '',
      execDef?.paramNames || [],
      undefined,
      source,
      options
    );

  } else if (typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null) {
    // Direct primitive values - we need to preserve their types
    const options = applySecurityOptions();
    variable = createPrimitiveVariable(
      identifier,
      valueNode, // Use the actual primitive value
      source,
      options
    );

  } else if (valueNode.type === 'array') {
    const isComplex = hasComplexArrayItems(valueNode.items || valueNode.elements || []);
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('var.ts: Creating array variable:', {
        identifier,
        isComplex,
        resolvedValueType: typeof resolvedValue,
        resolvedValueIsArray: Array.isArray(resolvedValue),
        resolvedValue
      });
    }
    
    const options = applySecurityOptions();
    variable = createArrayVariable(identifier, resolvedValue, isComplex, source, options);
    
  } else if (valueNode.type === 'object') {
    const isComplex = toolCollection ? false : hasComplexValues(valueNode.entries || valueNode.properties);
    const options = applySecurityOptions(
      toolCollection
        ? {
            internal: {
              toolCollection,
              isToolsCollection: true
            }
          }
        : undefined
    );
    variable = createObjectVariable(identifier, resolvedValue, isComplex, source, options);
    
  } else if (valueNode.type === 'command') {
    const options = applySecurityOptions();
    variable = createCommandResultVariable(identifier, resolvedValue, valueNode.command, source, 
      undefined, undefined, options);
    
  } else if (valueNode.type === 'code') {
    // Need to get source code from the value node
    const sourceCode = valueNode.code || ''; // TODO: Verify how to extract source code
    const options = applySecurityOptions();
    variable = createComputedVariable(identifier, resolvedValue, 
      valueNode.language || 'js', sourceCode, source, options);
    
  } else if (valueNode.type === 'path') {
    const filePath = await interpolateWithSecurity(valueNode.segments);
    const options = applySecurityOptions();
    variable = createFileContentVariable(identifier, resolvedValue, filePath, source, options);
    
  } else if (valueNode.type === 'section') {
    const filePath = await interpolateWithSecurity(valueNode.path);
    const sectionName = await interpolateWithSecurity(valueNode.section);
    const options = applySecurityOptions();
    variable = createSectionContentVariable(identifier, resolvedValue, filePath, 
      sectionName, 'hash', source, options);
    
  } else if (valueNode.type === 'VariableReference') {
    // For VariableReference nodes, create variable based on resolved value type
    // This handles cases like @user.name where resolvedValue is the field value
    const actualValue = isStructuredValue(resolvedValue) ? asData(resolvedValue) : resolvedValue;
    const existingSecurity = extractSecurityFromValue(resolvedValue);
    if (typeof actualValue === 'string') {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createSimpleTextVariable(identifier, actualValue, source, options);
    } else if (typeof actualValue === 'number' || typeof actualValue === 'boolean' || actualValue === null) {
      const options = applySecurityOptions(undefined, existingSecurity);
      variable = createPrimitiveVariable(identifier, actualValue, source, options);
    } else if (Array.isArray(actualValue)) {
      const options = applySecurityOptions(undefined, existingSecurity);
      variable = createArrayVariable(identifier, actualValue, false, source, options);
    } else if (typeof actualValue === 'object' && actualValue !== null) {
      const options = applySecurityOptions(undefined, existingSecurity);
      variable = createObjectVariable(identifier, actualValue, false, source, options);
    } else {
      // Fallback to text
      const options = applySecurityOptions(undefined, existingSecurity);
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }
    
  } else if (valueNode.type === 'load-content') {
    const structuredValue = wrapLoadContentValue(resolvedValue);
    const options = applySecurityOptions({
      internal: {
        structuredValueMetadata: structuredValue.metadata
      }
    });
    variable = createStructuredValueVariable(identifier, structuredValue, source, options);
    resolvedValue = structuredValue;

  } else if (valueNode.type === 'foreach' || valueNode.type === 'foreach-command') {
    // Foreach expressions always return arrays
    const isComplex = false; // foreach results are typically simple values
    const options = applySecurityOptions();
    variable = createArrayVariable(identifier, resolvedValue, isComplex, source, options);

  } else if (valueNode.type === 'LoopExpression') {
    // Loop expressions can return any type based on done/continue behavior
    if (isStructuredValue(resolvedValue)) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createStructuredValueVariable(identifier, resolvedValue, source, options);
    } else if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createArrayVariable(identifier, resolvedValue, false, source, options);
      } else {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createObjectVariable(identifier, resolvedValue as Record<string, unknown>, false, source, options);
      }
    } else if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createPrimitiveVariable(identifier, resolvedValue, source, options);
    } else {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

  } else if (valueNode.type === 'WhenExpression') {
    // When expressions can return any type based on matching arm
    if (isStructuredValue(resolvedValue)) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createStructuredValueVariable(identifier, resolvedValue, source, options);
    } else if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createArrayVariable(identifier, resolvedValue, false, source, options);
      } else {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createObjectVariable(identifier, resolvedValue as Record<string, unknown>, false, source, options);
      }
    } else if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createPrimitiveVariable(identifier, resolvedValue, source, options);
    } else {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

  } else if (valueNode.type === 'ExecInvocation' || valueNode.type === 'ExeBlock') {
    // Exec invocations and blocks can return any type
    if (isStructuredValue(resolvedValue)) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createStructuredValueVariable(identifier, resolvedValue, source, options);
    } else if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createArrayVariable(identifier, resolvedValue, false, source, options);
      } else {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createObjectVariable(identifier, resolvedValue as Record<string, unknown>, false, source, options);
      }
    } else {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

  } else if (valueNode.type === 'NewExpression') {
    if (isStructuredValue(resolvedValue)) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createStructuredValueVariable(identifier, resolvedValue, source, options);
    } else if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createArrayVariable(identifier, resolvedValue, false, source, options);
      } else {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createObjectVariable(identifier, resolvedValue as Record<string, unknown>, false, source, options);
      }
    } else if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createPrimitiveVariable(identifier, resolvedValue, source, options);
    } else {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

  } else if (valueNode.type === 'VariableReferenceWithTail') {
    // Variable with tail modifiers - create based on resolved type
    const actualValue = isStructuredValue(resolvedValue) ? asData(resolvedValue) : resolvedValue;
    if (typeof actualValue === 'object' && actualValue !== null) {
      if (Array.isArray(actualValue)) {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createArrayVariable(identifier, actualValue, false, source, options);
      } else {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createObjectVariable(identifier, actualValue, false, source, options);
      }
    } else {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

  } else if (valueNode.type === 'Directive' && valueNode.kind === 'env') {
    // env expression result - create variable based on resolved value type
    if (isStructuredValue(resolvedValue)) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createStructuredValueVariable(identifier, resolvedValue, source, options);
    } else if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createArrayVariable(identifier, resolvedValue, false, source, options);
      } else {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        variable = createObjectVariable(identifier, resolvedValue as Record<string, unknown>, false, source, options);
      }
    } else if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createPrimitiveVariable(identifier, resolvedValue, source, options);
    } else {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

  } else if (directive.meta?.expressionType) {
    // Expression results - create appropriate variable type based on resolved value
    if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
      const options = applySecurityOptions();
      variable = createPrimitiveVariable(identifier, resolvedValue, source, options);
    } else if (Array.isArray(resolvedValue)) {
      const options = applySecurityOptions();
      variable = createArrayVariable(identifier, resolvedValue, false, source, options);
    } else if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      const options = applySecurityOptions();
      variable = createObjectVariable(identifier, resolvedValue, false, source, options);
    } else {
      // Expression returned string or other primitive
      const options = applySecurityOptions();
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }
    
  } else if (valueNode.type === 'Literal') {
    // Literal nodes - DON'T create variable yet, let it fall through to pipeline processing
    // The variable will be created after checking for pipelines

  } else {
    // Text variables - need to determine specific type
    const strValue = valueToString(resolvedValue);
    
    if (directive.meta?.wrapperType === 'singleQuote') {
      const options = applySecurityOptions();
      variable = createSimpleTextVariable(identifier, strValue, source, options);
    } else if (directive.meta?.isTemplateContent || directive.meta?.wrapperType === 'backtick' || directive.meta?.wrapperType === 'doubleQuote' || directive.meta?.wrapperType === 'doubleColon' || directive.meta?.wrapperType === 'tripleColon') {
      // Template variable
      let templateType: 'backtick' | 'doubleColon' | 'tripleColon' = 'backtick';
      if (directive.meta?.wrapperType === 'doubleColon') {
        templateType = 'doubleColon';
      } else if (directive.meta?.wrapperType === 'tripleColon') {
        templateType = 'tripleColon';
      }
      
      // For triple-colon templates, the value is the AST array, not a string
      const templateValue = directive.meta?.wrapperType === 'tripleColon' && Array.isArray(resolvedValue) 
        ? resolvedValue as any // Pass the AST array
        : strValue; // For other templates, use the string value
      const options = applySecurityOptions();
      variable = createTemplateVariable(
        identifier,
        templateValue,
        undefined,
        templateType as any,
        source,
        options
      );
    } else if (directive.meta?.wrapperType === 'doubleQuote' || source.hasInterpolation) {
      // Interpolated text - need to track interpolation points
      // For now, create without interpolation points - TODO: extract these from AST
      const options = applySecurityOptions();
      variable = createInterpolatedTextVariable(identifier, strValue, [], source, options);
    } else {
      // Default to simple text
      const options = applySecurityOptions();
      variable = createSimpleTextVariable(identifier, strValue, source, options);
    }
  }

  // Use unified pipeline processor
  const { processPipeline } = await import('./pipeline/unified-processor');
  
  // Create variable if not already created (for Literal nodes)
  if (!variable) {
    if (valueNode && valueNode.type === 'Literal') {
      if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
        const options = applySecurityOptions();
        variable = createPrimitiveVariable(identifier, resolvedValue, source, options);
      } else {
        const options = applySecurityOptions();
        variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
      }
    } else {
      const options = applySecurityOptions();
      variable = createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }
  }
  
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

async function evaluateToolCollectionObject(
  valueNode: any,
  env: Environment,
  collectDescriptor?: DescriptorCollector,
  context?: EvaluationContext,
  sourceLocation?: SourceLocation
): Promise<Record<string, unknown>> {
  return evaluateCollectionObject(
    valueNode,
    env,
    collectDescriptor,
    context,
    sourceLocation,
    true
  );
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
