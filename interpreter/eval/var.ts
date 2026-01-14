import * as fs from 'fs';
import type { DirectiveNode, VarValue, VariableNodeArray } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { astLocationToSourceLocation } from '@core/types';
import { logger } from '@core/utils/logger';
import { applyHeaderTransform } from './show';
import {
  Variable,
  VariableSource,
  VariableMetadataUtils,
  createSimpleTextVariable,
  createInterpolatedTextVariable,
  createTemplateVariable,
  createArrayVariable,
  createObjectVariable,
  createFileContentVariable,
  createSectionContentVariable,
  createComputedVariable,
  createCommandResultVariable,
  createStructuredValueVariable,
  createPrimitiveVariable,
  type VariableMetadata,
  type VariableContext,
  type VariableInternalMetadata,
  type VariableFactoryInitOptions
} from '@core/types/variable';
import type { SecurityDescriptor, DataLabel, CapabilityKind } from '@core/types/security';
import { createCapabilityContext, makeSecurityDescriptor } from '@core/types/security';
import { isStructuredValue, asText, asData, extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';
import { updateVarMxFromDescriptor, varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';

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

type DescriptorCollector = (descriptor?: SecurityDescriptor) => void;

async function interpolateAndCollect(
  nodes: any,
  env: Environment,
  mergeDescriptor?: DescriptorCollector,
  interpolationContext: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  if (!mergeDescriptor) {
    return interpolate(nodes, env, interpolationContext);
  }
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, interpolationContext, {
    collectSecurityDescriptor: collected => {
      if (collected) {
        descriptors.push(collected);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1
        ? descriptors[0]
        : env.mergeSecurityDescriptors(...descriptors);
    mergeDescriptor(merged);
  }
  return text;
}

/**
 * Evaluate @var directives.
 * This is the unified variable assignment directive that replaces @text and @data.
 * Type is inferred from the RHS syntax.
 */
export async function prepareVarAssignment(
  directive: DirectiveNode,
  env: Environment
): Promise<VarAssignmentResult> {
  // Extract identifier from array
  const identifierNodes = directive.values?.identifier as VariableNodeArray | undefined;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Var directive missing identifier');
  }
  
  const identifierNode = identifierNodes[0];
  if (!identifierNode || typeof identifierNode !== 'object' || !('identifier' in identifierNode)) {
    throw new Error('Invalid identifier node structure');
  }
  const identifier = identifierNode.identifier;
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Var directive identifier must be a simple variable name');
  }

  const securityLabels = (directive.meta?.securityLabels ?? directive.values?.securityLabels) as DataLabel[] | undefined;
  const baseDescriptor = makeSecurityDescriptor({ labels: securityLabels });
  const capabilityKind = directive.kind as CapabilityKind;
  const operationMetadata = {
    kind: 'var',
    identifier,
    location: directive.location
  };

  let resolvedSecurityDescriptor: SecurityDescriptor | undefined;
  const mergeResolvedDescriptor = (descriptor?: SecurityDescriptor): void => {
    if (!descriptor) {
      return;
    }
    resolvedSecurityDescriptor = resolvedSecurityDescriptor
      ? env.mergeSecurityDescriptors(resolvedSecurityDescriptor, descriptor)
      : descriptor;
  };
  const mergePipelineDescriptor = (
    ...descriptors: (SecurityDescriptor | undefined)[]
  ): SecurityDescriptor | undefined => {
    const resolved = descriptors.filter(Boolean) as SecurityDescriptor[];
    if (resolved.length === 0) {
      return undefined;
    }
    if (resolved.length === 1) {
      return resolved[0];
    }
    return env.mergeSecurityDescriptors(...resolved);
  };
  const descriptorFromVariable = (variable?: Variable): SecurityDescriptor | undefined => {
    if (!variable?.mx) {
      return undefined;
    }
    return varMxToSecurityDescriptor(variable.mx);
  };
  const interpolateWithSecurity = (
    nodes: any,
    interpolationContext: InterpolationContext = InterpolationContext.Default
  ): Promise<string> => {
    return interpolateAndCollect(nodes, env, mergeResolvedDescriptor, interpolationContext);
  };

  /**
   * Extract security descriptor from a value (Variable, StructuredValue, or plain value)
   */
  const extractSecurityFromValue = (value: any): SecurityDescriptor | undefined => {
    if (!value) return undefined;
    // Check if it's a Variable with .mx
    if (typeof value === 'object' && 'mx' in value && value.mx) {
      const mx = value.mx;
      const hasLabels = Array.isArray(mx.labels) && mx.labels.length > 0;
      const hasTaint = Array.isArray(mx.taint) && mx.taint.length > 0;
      if (hasLabels || hasTaint) {
        return {
          labels: mx.labels,
          taint: mx.taint,
          sources: mx.sources,
          policyContext: mx.policy ?? undefined
        } as SecurityDescriptor;
      }
    }
    return undefined;
  };

  const finalizeVariable = (variable: Variable): Variable => {
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

  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[var.ts] Extracted valueNode:', {
      identifier,
      type: valueNode?.type,
      isArray: Array.isArray(valueNode),
      hasWithClause: !!(valueNode?.withClause),
      hasPipeline: !!(valueNode?.withClause?.pipeline)
    });
  }

  try {
  // Type-based routing based on the AST structure
  let resolvedValue: any;
  const templateAst: any = null; // Store AST for templates that need lazy interpolation
  
  if (valueNode && typeof valueNode === 'object' && valueNode.type === 'FileReference') {
    const { processContentLoader } = await import('./content-loader');
    const { accessField } = await import('../utils/field-access');
    const loadContentNode = {
      type: 'load-content' as const,
      source: valueNode.source,
      options: valueNode.options,
      pipes: valueNode.pipes
    };
    const rawResult = await processContentLoader(loadContentNode as any, env);
    let structuredResult = isStructuredValue(rawResult) ? rawResult : wrapLoadContentValue(rawResult);
    if (valueNode.fields && valueNode.fields.length > 0) {
      for (const field of valueNode.fields) {
        structuredResult = await accessField(structuredResult, field, { env });
      }
    }
    resolvedValue = structuredResult;
    
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
      resolvedValue = valueNode;
    } else {
      // Process simple array items immediately
      const processedItems = [];
      for (const item of (valueNode.items || [])) {
        if (item && typeof item === 'object') {
          if ('content' in item && Array.isArray(item.content)) {
            // This is wrapped content (like from a string literal)
            const interpolated = await interpolateWithSecurity(item.content);
            processedItems.push(interpolated);
          } else if (item.type === 'Text' && 'content' in item) {
            // Direct text content
            processedItems.push(item.content);
          } else if (typeof item === 'object' && item.type) {
            // Other node types - evaluate them
            const evaluated = await evaluateArrayItem(item, env, mergeResolvedDescriptor);
            processedItems.push(evaluated);
          } else {
            // Primitive values
            processedItems.push(item);
          }
        } else {
          // Direct primitive value
          processedItems.push(item);
        }
      }
      resolvedValue = processedItems;
    }
    
  } else if (valueNode.type === 'object') {
    // Object literal: { "key": "value" }

    // Check if this object has complex values that need lazy evaluation
    const isComplex = hasComplexValues(valueNode.entries || valueNode.properties);
    
    if (isComplex) {
      // For complex objects, store the AST node for lazy evaluation
      resolvedValue = valueNode;
    } else {
      // Process simple object properties immediately
      const processedObject: Record<string, any> = {};

      // Handle entries format (new)
      if (valueNode.entries) {
        for (const entry of valueNode.entries) {
          if (entry.type === 'pair') {
            const key = entry.key;
            const propValue = entry.value;
          // Each property value might need interpolation
          if (propValue && typeof propValue === 'object' && 'content' in propValue && Array.isArray(propValue.content)) {
            // Handle wrapped string content (quotes, backticks, etc.)
            processedObject[key] = await interpolateWithSecurity(propValue.content as any);
          } else if (propValue && typeof propValue === 'object' && propValue.type === 'array') {
            // Handle array values in objects
            const processedArray = [];
            
            // Debug logging for Phase 2
            if (identifier === 'complex' && key === 'users') {
              logger.debug('Processing users array items:', {
                itemCount: (propValue.items || []).length,
                firstItem: propValue.items?.[0]
              });
            }
            
            for (const item of (propValue.items || [])) {
              const evaluated = await evaluateArrayItem(item, env, mergeResolvedDescriptor);
              processedArray.push(evaluated);
            }
            processedObject[key] = processedArray;
          } else if (propValue && typeof propValue === 'object' && propValue.type === 'object') {
            // Handle nested objects recursively
            const nestedObj: Record<string, any> = {};
            // Handle entries format
            if (propValue.entries) {
              for (const nestedEntry of propValue.entries) {
                if (nestedEntry.type === 'pair') {
                  nestedObj[nestedEntry.key] = await evaluateArrayItem(nestedEntry.value, env, mergeResolvedDescriptor);
                }
              }
            }
            // Handle properties format (legacy)
            else if (propValue.properties) {
              for (const [nestedKey, nestedValue] of Object.entries(propValue.properties)) {
                nestedObj[nestedKey] = await evaluateArrayItem(nestedValue, env, mergeResolvedDescriptor);
              }
            }
            processedObject[key] = nestedObj;
          } else if (propValue && typeof propValue === 'object' && propValue.type) {
            // Handle other node types (load-content, VariableReference, etc.)
            processedObject[key] = await evaluateArrayItem(propValue, env, mergeResolvedDescriptor);
          } else if (propValue && typeof propValue === 'object' && 'needsInterpolation' in propValue && Array.isArray(propValue.parts)) {
            // Handle strings with @references that need interpolation
            processedObject[key] = await interpolateWithSecurity(propValue.parts);
          } else {
            // For primitive types (numbers, booleans, null, strings), use as-is
            processedObject[key] = propValue;
          }
          }
          // Spread entries shouldn't be here (isComplex would be true)
        }
      }
      // Handle properties format (legacy)
      else if (valueNode.properties) {
        for (const [key, propValue] of Object.entries(valueNode.properties)) {
          // Each property value might need interpolation
          if (propValue && typeof propValue === 'object' && 'content' in propValue && Array.isArray(propValue.content)) {
            // Handle wrapped string content (quotes, backticks, etc.)
            processedObject[key] = await interpolateWithSecurity(propValue.content as any);
          } else if (propValue && typeof propValue === 'object' && propValue.type === 'array') {
            // Handle array values in objects
            const processedArray = [];
            for (const item of (propValue.items || [])) {
              const evaluated = await evaluateArrayItem(item, env, mergeResolvedDescriptor);
              processedArray.push(evaluated);
            }
            processedObject[key] = processedArray;
          } else if (propValue && typeof propValue === 'object' && propValue.type === 'object') {
            // Handle nested objects recursively
            const nestedObj: Record<string, any> = {};
            const nestedData = propValue.entries || propValue.properties;
            if (nestedData) {
              if (propValue.entries) {
                for (const nestedEntry of propValue.entries) {
                  if (nestedEntry.type === 'pair') {
                    nestedObj[nestedEntry.key] = await evaluateArrayItem(nestedEntry.value, env, mergeResolvedDescriptor);
                  }
                }
              } else if (propValue.properties) {
                for (const [nestedKey, nestedValue] of Object.entries(propValue.properties)) {
                  nestedObj[nestedKey] = await evaluateArrayItem(nestedValue, env, mergeResolvedDescriptor);
                }
              }
            }
            processedObject[key] = nestedObj;
          } else if (propValue && typeof propValue === 'object' && propValue.type) {
            // Handle other node types (load-content, VariableReference, etc.)
            processedObject[key] = await evaluateArrayItem(propValue, env, mergeResolvedDescriptor);
          } else if (propValue && typeof propValue === 'object' && 'needsInterpolation' in propValue && Array.isArray((propValue as any).parts)) {
            // Handle strings with @references that need interpolation
            processedObject[key] = await interpolateWithSecurity((propValue as any).parts);
          } else {
            // For primitive types (numbers, booleans, null, strings), use as-is
            processedObject[key] = propValue;
          }
        }
      }
      resolvedValue = processedObject;
    }
    
  } else if (valueNode.type === 'section') {
    // Section extraction: [file.md # Section]
    const filePath = await interpolateWithSecurity(valueNode.path);
    const sectionName = await interpolateWithSecurity(valueNode.section);
    
    // Read file and extract section
    const fileContent = await env.readFile(filePath);
    const { llmxmlInstance } = await import('../utils/llmxml-instance');
    
    try {
      resolvedValue = await llmxmlInstance.getSection(fileContent, sectionName, {
        includeNested: true,
        includeTitle: true
      });
    } catch (error) {
      // Fallback to basic extraction
      resolvedValue = extractSection(fileContent, sectionName);
    }
    
    // Check if we have an asSection modifier in the withClause
    if (directive.values?.withClause?.asSection) {
      const newHeader = await interpolateWithSecurity(directive.values.withClause.asSection);
      resolvedValue = applyHeaderTransform(resolvedValue, newHeader);
    }
    
  } else if (valueNode.type === 'load-content') {
    // Content loader: <file.md> or <file.md # Section>
    const { processContentLoader } = await import('./content-loader');
    
    // Pass the withClause to the content loader if it has asSection
    if (directive.values?.withClause?.asSection) {
      if (!valueNode.options) {
        valueNode.options = {};
      }

      // Check if this is a glob pattern - use transform instead of section.renamed
      const isGlob = valueNode.source?.raw?.includes('*') || valueNode.source?.raw?.includes('?');

      if (isGlob) {
        // For globs, use options.transform which content-loader expects for array transforms
        valueNode.options.transform = {
          type: 'template',
          parts: directive.values.withClause.asSection
        };
      } else {
        // For single files with sections, use options.section.renamed
        if (!valueNode.options.section) {
          valueNode.options.section = {};
        }
        valueNode.options.section.renamed = {
          type: 'rename-template',
          parts: directive.values.withClause.asSection
        };
      }
    }
    
    resolvedValue = await processContentLoader(valueNode, env);
    
  } else if (valueNode.type === 'path') {
    // Path dereference: [README.md]
    const filePath = await interpolateWithSecurity(valueNode.segments);
    resolvedValue = await env.readFile(filePath);
    
  } else if (valueNode.type === 'code') {
    // Code execution: run js { ... } or js { ... }
    const { evaluateCodeExecution } = await import('./code-execution');
    const result = await evaluateCodeExecution(valueNode, env);
    resolvedValue = result.value;
    
    // Infer variable type from result
    
  } else if (valueNode.type === 'command') {
    // Shell command: run { ... }
    // If a withClause is present on the /var directive (e.g., stdin/pipeline),
    // delegate to evaluateRun so that stdin and pipelines are applied correctly.
    const withClause = (directive.values?.withClause || directive.meta?.withClause) as any | undefined;
    const hasWithClause = !!withClause;
    let handledByRunEvaluator = false;

    if (hasWithClause) {
      const { evaluateRun } = await import('./run');
      const runDirective: any = {
        type: 'Directive',
        nodeId: (directive as any).nodeId ? `${(directive as any).nodeId}-run` : undefined,
        location: directive.location,
        kind: 'run',
        subtype: 'runCommand',
        source: 'command',
        values: {
          command: valueNode.command,
          withClause
        },
        raw: {
          command: Array.isArray(valueNode.command)
            ? (valueNode.meta?.raw || '')
            : String(valueNode.command),
          withClause
        },
        meta: {
          // Mark as data value so evaluateRun does not emit document output
          isDataValue: true
        }
      };
      const result = await evaluateRun(runDirective, env);
      resolvedValue = result.value;
      handledByRunEvaluator = true;
    } else {
      // Regular command without withClause: execute directly
      if (Array.isArray(valueNode.command)) {
        // New: command is an array of AST nodes that need interpolation
        const interpolatedCommand = await interpolateWithSecurity(
          valueNode.command,
          InterpolationContext.ShellCommand
        );
        resolvedValue = await env.executeCommand(interpolatedCommand);
      } else {
        // Legacy: command is a raw string (for backward compatibility)
        resolvedValue = await env.executeCommand(valueNode.command);
      }

      // Apply automatic JSON parsing for shell command output
      const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
      resolvedValue = processCommandOutput(resolvedValue);
    }
    
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
    
    const sourceVar = env.getVariable(valueNode.identifier);
    if (!sourceVar) {
      const { MlldDirectiveError } = await import('@core/errors');
      throw new MlldDirectiveError(
        `Variable not found: ${valueNode.identifier}`,
        'var',
        { location: directive.location, env }
      );
    }
    
    // Copy the variable type from source - preserve Variables!
    const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
    const { accessField } = await import('../utils/field-access');
    
    /**
     * Preserve Variable wrapper when copying variable references
     * WHY: Variable copies need to maintain metadata and type information
     *      for proper Variable flow through the system
     */
    const resolvedVar = await resolveVariable(sourceVar, env, ResolutionContext.VariableCopy);
    
    // Handle field access if present
    if (valueNode.fields && valueNode.fields.length > 0) {
      // resolvedVar is already properly resolved with ResolutionContext.VariableCopy
      // No need to extract again - field access will handle extraction if needed
      
      // Use enhanced field access to preserve context
      const fieldResult = await accessField(resolvedVar, valueNode.fields[0], { 
        preserveContext: true,
        env,
        sourceLocation: directive.location
      });
      let currentResult = fieldResult as any;
      
      // Apply remaining fields if any
      for (let i = 1; i < valueNode.fields.length; i++) {
        currentResult = await accessField(currentResult.value, valueNode.fields[i], { 
          preserveContext: true, 
          parentPath: currentResult.accessPath,
          env,
          sourceLocation: directive.location
        });
      }
      
      resolvedValue = currentResult.value;
      
      // Check if the accessed field is an executable variable
      if (resolvedValue && typeof resolvedValue === 'object' && 
          resolvedValue.type === 'executable') {
        // Preserve the executable variable
        const finalVar = finalizeVariable(resolvedValue);
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
      
      // IMPORTANT: When we have field access, the resolvedValue is the field value
      // We should NOT fall through to the duplicate VariableReference handling below
    } else {
      // No field access - use the resolved Variable directly
      resolvedValue = resolvedVar;
    }
    
    // Apply condensed pipes if present (e.g., @var|@transform)
    if (valueNode.pipes && valueNode.pipes.length > 0) {
      // Use unified pipeline processor for condensed pipes
      const { processPipeline } = await import('./pipeline/unified-processor');
      
      // Process through unified pipeline (handles condensed pipe conversion)
      const result = await processPipeline({
        value: resolvedValue,
        env,
        node: valueNode,
        identifier,
        location: directive.location,
        descriptorHint: mergePipelineDescriptor(descriptorFromVariable(sourceVar), resolvedSecurityDescriptor)
      });
      
      resolvedValue = result;
    }
    
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
        logger.debug('Storing template AST for triple-colon template', {
          identifier,
          ast: valueNode
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
    
  } else if (valueNode && (valueNode.type === 'foreach' || valueNode.type === 'foreach-command')) {
    // Handle foreach expressions
    const { evaluateForeachCommand } = await import('./foreach');
    resolvedValue = await evaluateForeachCommand(valueNode, env);
    
  } else if (valueNode && valueNode.type === 'WhenExpression') {
    // Handle when expressions
    // Force 'first' modifier for value-returning when expressions (first-match semantics)
    const { evaluateWhenExpression } = await import('./when-expression');
    const nodeWithFirst = valueNode.meta?.modifier === 'first' ? valueNode : {
      ...valueNode,
      meta: { ...(valueNode.meta || {}), modifier: 'first' as const }
    };
    const whenResult = await evaluateWhenExpression(nodeWithFirst as any, env);
    resolvedValue = whenResult.value;
    
  } else if (valueNode && valueNode.type === 'ExeBlock') {
    const { evaluateExeBlock } = await import('./exe');
    const blockEnv = env.createChild();
    const blockResult = await evaluateExeBlock(valueNode as any, blockEnv);
    resolvedValue = blockResult.value;

  } else if (valueNode && valueNode.type === 'ExecInvocation') {
    // Handle exec function invocations: @getConfig(), @transform(@data)
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[var.ts] Processing ExecInvocation:', {
        hasWithClause: !!valueNode.withClause,
        hasPipeline: !!(valueNode.withClause?.pipeline)
      });
    }
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(valueNode, env);
    resolvedValue = result.value;
    
    // Infer variable type from result
    
  } else if (valueNode && valueNode.type === 'VariableReferenceWithTail') {
    // Variable with tail modifiers (e.g., @var @result = @data with { pipeline: [@transform] })
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Processing VariableReferenceWithTail in var.ts');
    }
    const varWithTail = valueNode;
    const sourceVar = env.getVariable(varWithTail.variable.identifier);
    if (!sourceVar) {
      const { MlldDirectiveError } = await import('@core/errors');
      throw new MlldDirectiveError(
        `Variable not found: ${varWithTail.variable.identifier}`,
        'var',
        { location: directive.location, env }
      );
    }
    
    // Get the base value - preserve Variable for field access
    const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
    const { accessFields } = await import('../utils/field-access');
    
    // Determine appropriate context based on what operations will be performed
    const needsPipelineExtraction = varWithTail.withClause && varWithTail.withClause.pipeline;
    const hasFieldAccess = varWithTail.variable.fields && varWithTail.variable.fields.length > 0;
    
    // Use appropriate resolution context
    const context = needsPipelineExtraction && !hasFieldAccess 
      ? ResolutionContext.PipelineInput 
      : ResolutionContext.FieldAccess;
    
    const resolvedVar = await resolveVariable(sourceVar, env, context);
    let result = resolvedVar;
    
    // Apply field access if present
    if (varWithTail.variable.fields && varWithTail.variable.fields.length > 0) {
      // Use enhanced field access to track context
      const fieldResult = await accessFields(resolvedVar, varWithTail.variable.fields, { 
        preserveContext: true,
        env,
        sourceLocation: directive.location
      });
      result = (fieldResult as any).value;
    }
    
    // Apply pipeline if present
    if (varWithTail.withClause && varWithTail.withClause.pipeline) {
      const { processPipeline } = await import('./pipeline/unified-processor');
      
      // Process through unified pipeline
      result = await processPipeline({
        value: result,
        env,
        node: varWithTail,
        identifier: varWithTail.identifier,
        location: directive.location,
        descriptorHint: mergePipelineDescriptor(descriptorFromVariable(sourceVar), resolvedSecurityDescriptor)
      });
    }
    
    resolvedValue = result;
    
  } else if (valueNode && (valueNode.type === 'BinaryExpression' || valueNode.type === 'TernaryExpression' || valueNode.type === 'UnaryExpression')) {
    // Handle expression nodes
    const { evaluateUnifiedExpression } = await import('./expressions');
    const result = await evaluateUnifiedExpression(valueNode, env);
    resolvedValue = result.value;
    
  } else if (valueNode && valueNode.type === 'ForExpression') {
    // Handle for expressions: for @item in @collection => expression
    
    // Import and evaluate the for expression
    const { evaluateForExpression } = await import('./for');
    const forResult = await evaluateForExpression(valueNode, env);
    
    // The result is already an ArrayVariable
    const finalVar = finalizeVariable(forResult);
    return {
      identifier,
      variable: finalVar,
      evalResultOverride: { value: finalVar, env }
    };
    
  } else if (valueNode && valueNode.type === 'LoopExpression') {
    const { evaluateLoopExpression } = await import('./loop');
    resolvedValue = await evaluateLoopExpression(valueNode, env);

  } else {
    // Default case - try to interpolate as text
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('var.ts: Default case for valueNode:', { valueNode });
    }
    resolvedValue = await interpolateWithSecurity([valueNode]);
  }

  const resolvedValueDescriptor = extractSecurityDescriptor(resolvedValue, {
    recursive: true,
    mergeArrayElements: true
  });
  mergeResolvedDescriptor(resolvedValueDescriptor);

  // Create and store the appropriate variable type
  const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
  const source = createVariableSource(valueNode, directive);
  const baseCtx: Partial<VariableContext> = { definedAt: location };
  const baseInternal: Partial<VariableInternalMetadata> = {};

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
    const isComplex = hasComplexValues(valueNode.entries || valueNode.properties);
    const options = applySecurityOptions();
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
    context?.precomputedVarAssignment ?? (await prepareVarAssignment(directive, env));
  env.setVariable(assignment.identifier, assignment.variable);
  return assignment.evalResultOverride ?? { value: '', env };
}

/**
 * Check if an object has complex values that need lazy evaluation
 */
function hasComplexValues(objOrProperties: any): boolean {
  if (!objOrProperties) return false;

  // Handle entries format (new)
  if (Array.isArray(objOrProperties)) {
    for (const entry of objOrProperties) {
      if (entry.type === 'spread') {
        // Spreads always need lazy evaluation
        return true;
      }
      if (entry.type === 'conditionalPair') {
        // Conditional pairs need lazy evaluation to check truthiness
        return true;
      }
      if (entry.type === 'pair') {
        const value = entry.value;
        if (value && typeof value === 'object') {
          if ('type' in value && (
            value.type === 'code' ||
            value.type === 'command' ||
            value.type === 'VariableReference' ||
            value.type === 'path' ||
            value.type === 'section' ||
            value.type === 'runExec' ||
            value.type === 'ExecInvocation' ||
            value.type === 'load-content'
          )) {
            return true;
          }
          // Check if it's a nested object with complex values
          if (value.type === 'object') {
            const nestedData = value.entries || value.properties;
            if (nestedData && hasComplexValues(nestedData)) {
              return true;
            }
          }
          // Check if it's an array with complex items
          if (value.type === 'array' && hasComplexArrayItems(value.items || value.elements || [])) {
            return true;
          }
          // Check plain objects (without type field) recursively
          if (!value.type && typeof value === 'object' && !Array.isArray(value)) {
            if (hasComplexValues(value)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  // Handle properties format (legacy) - it's a Record<string, any>
  for (const value of Object.values(objOrProperties)) {
    if (value && typeof value === 'object') {
      if ('type' in value && (
        value.type === 'code' ||
        value.type === 'command' ||
        value.type === 'VariableReference' ||
        value.type === 'path' ||
        value.type === 'section' ||
        value.type === 'runExec' ||
        value.type === 'ExecInvocation' ||
        value.type === 'load-content'
      )) {
        return true;
      }
      // Check if it's a nested object with complex values
      if (value.type === 'object') {
        const nestedData = value.entries || value.properties;
        if (nestedData && hasComplexValues(nestedData)) {
          return true;
        }
      }
      // Check if it's an array with complex items
      if (value.type === 'array' && hasComplexArrayItems(value.items || value.elements || [])) {
        return true;
      }
      // Check plain objects (without type field) recursively
      if (!value.type && typeof value === 'object' && !Array.isArray(value)) {
        if (hasComplexValues(value)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if array items contain complex values
 */
function hasComplexArrayItems(items: any[]): boolean {
  if (!items || !Array.isArray(items) || items.length === 0) return false;
  
  for (const item of items) {
    if (item && typeof item === 'object') {
      if ('type' in item && (
        item.type === 'code' || 
        item.type === 'command' || 
        item.type === 'VariableReference' ||
        item.type === 'array' ||
        item.type === 'object' ||
        item.type === 'path' ||
        item.type === 'section' ||
        item.type === 'load-content' ||
        item.type === 'ExecInvocation'
      )) {
        return true;
      }
      // Check nested arrays and objects
      if (Array.isArray(item) && hasComplexArrayItems(item)) {
        return true;
      }
      if (item.constructor === Object && hasComplexValues(item)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Evaluate an array item based on its type
 * This function evaluates items that will be stored in arrays, preserving Variables
 * instead of extracting their values immediately.
 */
async function evaluateArrayItem(
  item: any,
  env: Environment,
  collectDescriptor?: DescriptorCollector
): Promise<any> {
  if (!item || typeof item !== 'object') {
    return item;
  }

  // Debug logging for Phase 2
  if (process.env.MLLD_DEBUG === 'true' && item.type === 'object') {
    logger.debug('evaluateArrayItem processing object:', {
      hasProperties: !!item.properties,
      propertyKeys: item.properties ? Object.keys(item.properties) : [],
      sampleProperty: item.properties?.name
    });
  }

  // Handle wrapped content first (e.g., quoted strings in arrays)
  // This includes strings in objects: {"name": "alice"} where "alice" becomes
  // {content: [{type: 'Text', content: 'alice'}], wrapperType: 'doubleQuote'}
  if ('content' in item && Array.isArray(item.content) && 'wrapperType' in item) {
    const hasOnlyLiteralsOrText = item.content.every(
      (node: any) =>
        node &&
        typeof node === 'object' &&
        ((node.type === 'Literal' && 'value' in node) || (node.type === 'Text' && 'content' in node))
    );
    if (hasOnlyLiteralsOrText) {
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        console.error('[evaluateArrayItem] literal/text wrapper', {
          wrapperType: item.wrapperType,
          items: item.content.map((node: any) => node.type)
        });
      }
      const joined = item.content
        .map((node: any) => (node.type === 'Literal' ? node.value : node.content))
        .join('');
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        try {
          fs.appendFileSync(
            '/tmp/mlld-debug.log',
            JSON.stringify({
              source: 'evaluateArrayItem',
              wrapperType: item.wrapperType,
              joined
            }) + '\n'
          );
        } catch {}
      }
      return joined;
    }
    if (process.env.MLLD_DEBUG_FIX === 'true') {
      console.error('[evaluateArrayItem] interpolating wrapper', {
        wrapperType: item.wrapperType,
        itemTypes: item.content.map((node: any) => node?.type)
      });
    }
    return await interpolateAndCollect(item.content, env, collectDescriptor);
  }

  // Also handle the case where we just have content array without wrapperType
  if ('content' in item && Array.isArray(item.content)) {
    return await interpolateAndCollect(item.content, env, collectDescriptor);
  }
  
  // Handle raw Text nodes that may appear in objects
  if (item.type === 'Text' && 'content' in item) {
    return item.content;
  }

  // Handle Literal nodes from grammar (numbers, booleans, null)
  if (item.type === 'Literal' && 'value' in item) {
    return item.value;
  }

  // Handle needsInterpolation marker (from DataString with @references)
  if ('needsInterpolation' in item && Array.isArray(item.parts)) {
    return await interpolateAndCollect(item.parts, env, collectDescriptor);
  }

  // Handle objects without explicit type property (plain objects from parser)
  if (!item.type && typeof item === 'object' && item.constructor === Object) {
    const nestedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(item)) {
      // Skip internal properties
      if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
        continue;
      }
      nestedObj[key] = await evaluateArrayItem(value, env, collectDescriptor);
    }
    return nestedObj;
  }

  switch (item.type) {
    case 'WhenExpression':
      // Evaluate when-expression inside arrays/objects
      {
        const { evaluateWhenExpression } = await import('./when-expression');
        const res = await evaluateWhenExpression(item as any, env);
        return res.value as any;
      }
    case 'array':
      // Nested array
      const nestedItems = [];
      for (const nestedItem of (item.items || [])) {
        nestedItems.push(await evaluateArrayItem(nestedItem, env, collectDescriptor));
      }
      return nestedItems;

    case 'object':
      // Object in array
      const processedObject: Record<string, any> = {};
      // Handle entries format (new)
      if (item.entries) {
        for (const entry of item.entries) {
          if (entry.type === 'pair') {
            processedObject[entry.key] = await evaluateArrayItem(entry.value, env, collectDescriptor);
          }
          // Spreads shouldn't be in simple objects (isComplex would be true)
        }
      }
      // Handle properties format (legacy)
      else if (item.properties) {
        for (const [key, propValue] of Object.entries(item.properties)) {
          processedObject[key] = await evaluateArrayItem(propValue, env, collectDescriptor);
        }
      }
      return processedObject;

    case 'VariableReference':
      // Variable reference in array - PRESERVE THE VARIABLE!
      const variable = env.getVariable(item.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${item.identifier}`);
      }
      
      /**
       * Preserve Variable wrapper when storing in array elements
       * WHY: Array elements should maintain Variable metadata to enable proper
       *      Variable flow through data structures
       */
      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      return await resolveVariable(variable, env, ResolutionContext.ArrayElement);

    case 'path':
      // Path node in array - read the file content
      const filePath = await interpolateAndCollect(item.segments || [item], env, collectDescriptor);
      const fileContent = await env.readFile(filePath);
      return fileContent;

    case 'SectionExtraction':
      // Section extraction in array
      const sectionName = await interpolateAndCollect(item.section, env, collectDescriptor);
      const sectionFilePath = await interpolateAndCollect(
        item.path.segments || [item.path],
        env,
        collectDescriptor
      );
      const sectionFileContent = await env.readFile(sectionFilePath);
      
      // Use standard section extraction
      const { extractSection } = await import('./show');
      return extractSection(sectionFileContent, sectionName);

    case 'load-content':
      // Load content node in array - use the content loader
      const { processContentLoader } = await import('./content-loader');
      const loadResult = await processContentLoader(item, env);

      // Handle file-loaded values (both StructuredValue and LoadContentResult formats)
      const { isFileLoadedValue } = await import('@interpreter/utils/load-content-structured');
      if (isFileLoadedValue(loadResult)) {
        // Return structured format if already wrapped, otherwise extract content
        return isStructuredValue(loadResult) ? loadResult : loadResult.content;
      }

      return loadResult;

    default:
      // Handle plain objects without type property
      if (!item.type && typeof item === 'object' && item.constructor === Object) {
        // This is a plain object with properties that might have wrapped content
        const plainObj: Record<string, any> = {};
        for (const [key, value] of Object.entries(item)) {
          // Skip internal properties
          if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
            continue;
          }
          plainObj[key] = await evaluateArrayItem(value, env, collectDescriptor);
        }
        return plainObj;
      }
      
      // Try to interpolate as a node array
      return await interpolateAndCollect([item], env, collectDescriptor);
  }
}

/**
 * Basic section extraction fallback
 */
function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\n');
  const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
  
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];
  
  for (const line of lines) {
    if (!inSection && sectionRegex.test(line)) {
      inSection = true;
      sectionLevel = line.match(/^#+/)?.[0].length || 0;
      sectionLines.push(line); // Include the header
      continue;
    }
    
    if (inSection) {
      const headerMatch = line.match(/^(#+)\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        break;
      }
      sectionLines.push(line);
    }
  }
  
  return sectionLines.join('\n').trim();
}
