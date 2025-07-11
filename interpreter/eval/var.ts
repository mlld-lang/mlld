import type { DirectiveNode, VarValue, VariableNodeArray } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { astLocationToSourceLocation } from '@core/types';
import { logger } from '@core/utils/logger';
import { applyHeaderTransform } from './show';
import { 
  Variable,
  VariableSource,
  createSimpleTextVariable,
  createInterpolatedTextVariable,
  createTemplateVariable,
  createArrayVariable,
  createObjectVariable,
  createFileContentVariable,
  createSectionContentVariable,
  createComputedVariable,
  createCommandResultVariable
} from '@core/types/variable';

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
    } else if (directive.meta.wrapperType === 'doubleQuote' || directive.meta.wrapperType === 'backtick') {
      baseSource.syntax = 'template';
      baseSource.hasInterpolation = true; // Assume interpolation for these types
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
export async function evaluateVar(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
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

  // Get the value node - this contains type information from the parser
  const valueNodes = directive.values?.value;
  if (!valueNodes || !Array.isArray(valueNodes) || valueNodes.length === 0) {
    throw new Error('Var directive missing value');
  }
  
  // For templates with multiple nodes (e.g., ::text {{var}}::), we need the whole array
  const valueNode = valueNodes.length === 1 ? valueNodes[0] : valueNodes;

  // Type-based routing based on the AST structure
  let resolvedValue: any;
  const templateAst: any = null; // Store AST for templates that need lazy interpolation
  
  // Check for primitive values first (numbers, booleans, null)
  if (typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null) {
    // Direct primitive values from the grammar
    resolvedValue = valueNode;
    
  } else if (valueNode.type === 'array') {
    // Array literal: [1, 2, 3] or [,]
    
    // Check if this array has complex items that need lazy evaluation
    const isComplex = hasComplexArrayItems(valueNode.items || valueNode.elements || []);
    
    if (isComplex) {
      // For complex arrays, store the AST node for lazy evaluation
      resolvedValue = valueNode;
    } else {
      // Process simple array items immediately
      const processedItems = [];
      for (const item of (valueNode.items || [])) {
        if (item && typeof item === 'object') {
          if ('content' in item && Array.isArray(item.content)) {
            // This is wrapped content (like from a string literal)
            const interpolated = await interpolate(item.content, env);
            processedItems.push(interpolated);
          } else if (item.type === 'Text' && 'content' in item) {
            // Direct text content
            processedItems.push(item.content);
          } else if (typeof item === 'object' && item.type) {
            // Other node types - evaluate them
            const evaluated = await evaluateArrayItem(item, env);
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
    const isComplex = hasComplexValues(valueNode.properties);
    
    if (isComplex) {
      // For complex objects, store the AST node for lazy evaluation
      resolvedValue = valueNode;
    } else {
      // Process simple object properties immediately
      const processedObject: Record<string, any> = {};
      if (valueNode.properties) {
        // Debug logging for Phase 2
        if (identifier === 'complex') {
          logger.debug('Processing object properties for @complex:', {
            propertyKeys: Object.keys(valueNode.properties),
            users: valueNode.properties.users
          });
        }
        
        for (const [key, propValue] of Object.entries(valueNode.properties)) {
          // Each property value might need interpolation
          if (propValue && typeof propValue === 'object' && 'content' in propValue && Array.isArray(propValue.content)) {
            // Handle wrapped string content (quotes, backticks, etc.)
            processedObject[key] = await interpolate(propValue.content as any, env);
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
              const evaluated = await evaluateArrayItem(item, env);
              processedArray.push(evaluated);
            }
            processedObject[key] = processedArray;
          } else if (propValue && typeof propValue === 'object' && propValue.type === 'object') {
            // Handle nested objects recursively
            const nestedObj: Record<string, any> = {};
            if (propValue.properties) {
              for (const [nestedKey, nestedValue] of Object.entries(propValue.properties)) {
                nestedObj[nestedKey] = await evaluateArrayItem(nestedValue, env);
              }
            }
            processedObject[key] = nestedObj;
          } else {
            // For other types (numbers, booleans, null), use as-is
            processedObject[key] = propValue;
          }
        }
      }
      resolvedValue = processedObject;
    }
    
  } else if (valueNode.type === 'section') {
    // Section extraction: [file.md # Section]
    const filePath = await interpolate(valueNode.path, env);
    const sectionName = await interpolate(valueNode.section, env);
    
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
      const newHeader = await interpolate(directive.values.withClause.asSection, env);
      resolvedValue = applyHeaderTransform(resolvedValue, newHeader);
    }
    
  } else if (valueNode.type === 'load-content') {
    // Content loader: <file.md> or <file.md # Section>
    const { processContentLoader } = await import('./content-loader');
    resolvedValue = await processContentLoader(valueNode, env, 'var');
    
  } else if (valueNode.type === 'path') {
    // Path dereference: [README.md]
    const filePath = await interpolate(valueNode.segments, env);
    resolvedValue = await env.readFile(filePath);
    
  } else if (valueNode.type === 'code') {
    // Code execution: run js { ... } or js { ... }
    const { evaluateCodeExecution } = await import('./code-execution');
    const result = await evaluateCodeExecution(valueNode, env);
    resolvedValue = result.value;
    
    // Infer variable type from result
    
  } else if (valueNode.type === 'command') {
    // Shell command: run { echo "hello" }
    
    // Check if we have parsed command nodes (new) or raw string (legacy)
    if (Array.isArray(valueNode.command)) {
      // New: command is an array of AST nodes that need interpolation
      const interpolatedCommand = await interpolate(valueNode.command, env, InterpolationContext.ShellCommand);
      resolvedValue = await env.executeCommand(interpolatedCommand);
    } else {
      // Legacy: command is a raw string (for backward compatibility)
      resolvedValue = await env.executeCommand(valueNode.command);
    }
    
  } else if (valueNode.type === 'VariableReference') {
    // Variable reference: @otherVar
    const sourceVar = env.getVariable(valueNode.identifier);
    if (!sourceVar) {
      throw new Error(`Variable not found: ${valueNode.identifier}`);
    }
    
    // Copy the variable type from source
    const { resolveVariableValue } = await import('../core/interpreter');
    resolvedValue = await resolveVariableValue(sourceVar, env);
    
    // Handle field access if present
    if (valueNode.fields && valueNode.fields.length > 0) {
      const { accessField } = await import('../utils/field-access');
      // Apply each field access in sequence
      for (const field of valueNode.fields) {
        resolvedValue = accessField(resolvedValue, field);
      }
      
      // Check if the accessed field is an executable variable
      if (resolvedValue && typeof resolvedValue === 'object' && 
          resolvedValue.type === 'executable') {
        // Preserve the executable variable
        env.setVariable(identifier, resolvedValue);
        return {
          value: resolvedValue,
          env,
          stdout: '',
          stderr: '',
          exitCode: 0
        };
      }
    }
    
  } else if (Array.isArray(valueNode)) {
    // For backtick templates, we should extract the text content directly
    // Check if this is a simple text array (backtick template)
    if (valueNode.length === 1 && valueNode[0].type === 'Text' && directive.meta?.wrapperType === 'backtick') {
        resolvedValue = valueNode[0].content;
    } else if (directive.meta?.wrapperType === 'doubleBracket') {
      // For double-bracket templates, store the AST for later interpolation
      // DO NOT interpolate now - that happens when displayed
      resolvedValue = valueNode; // Store the AST array as the value
      logger.debug('Storing template AST for double-bracket template', {
        identifier,
        ast: valueNode
      });
    } else {
      // Template or string content - need to interpolate
        resolvedValue = await interpolate(valueNode, env);
    }
    
  } else if (valueNode.type === 'Text' && 'content' in valueNode) {
    // Simple text content
    resolvedValue = valueNode.content;
    
  } else if (valueNode && valueNode.type === 'foreach') {
    // Handle foreach expressions
    const { evaluateForeachCommand } = await import('./foreach');
    resolvedValue = await evaluateForeachCommand(valueNode, env);
    
  } else if (valueNode && valueNode.type === 'ExecInvocation') {
    // Handle exec function invocations: @getConfig(), @transform(@data)
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(valueNode, env);
    resolvedValue = result.value;
    
    // Infer variable type from result
    
  } else if (valueNode && valueNode.type === 'VariableReferenceWithTail') {
    // Variable with tail modifiers (e.g., @var @result = @data with { pipeline: [@transform] })
    const varWithTail = valueNode;
    const sourceVar = env.getVariable(varWithTail.variable.identifier);
    if (!sourceVar) {
      throw new Error(`Variable not found: ${varWithTail.variable.identifier}`);
    }
    
    // Get the base value
    const { resolveVariableValue } = await import('../core/interpreter');
    let result = await resolveVariableValue(sourceVar, env);
    
    // Apply field access if present
    if (varWithTail.variable.fields && varWithTail.variable.fields.length > 0) {
      const { accessField } = await import('../utils/field-access');
      // Iterate through fields one at a time (accessField expects a single field)
      for (const field of varWithTail.variable.fields) {
        result = accessField(result, field);
      }
    }
    
    // Apply pipeline if present
    if (varWithTail.withClause && varWithTail.withClause.pipeline) {
      const { executePipeline } = await import('./pipeline');
      const format = varWithTail.withClause.format as string | undefined;
      
      // Convert result to string for pipeline
      const stringResult = typeof result === 'string' ? result : JSON.stringify(result);
      
      result = await executePipeline(
        stringResult,
        varWithTail.withClause.pipeline,
        env,
        directive.location,
        format
      );
    }
    
    resolvedValue = result;
    
  } else {
    // Default case - try to interpolate as text
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('var.ts: Default case for valueNode:', { valueNode });
    }
    resolvedValue = await interpolate([valueNode], env);
  }

  // Create and store the appropriate variable type
  const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
  const source = createVariableSource(valueNode, directive);
  const metadata = { definedAt: location };

  let variable: Variable;

  // Create specific variable types based on AST node type
  // Handle primitives first (they don't have a .type property)
  if (typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null) {
    // Direct primitive values - we need to preserve their types
    const { createPrimitiveVariable } = await import('@core/types/variable');
    variable = createPrimitiveVariable(
      identifier,
      valueNode, // Use the actual primitive value
      source,
      metadata
    );
    
  } else if (valueNode.type === 'array') {
    const isComplex = hasComplexArrayItems(valueNode.items || valueNode.elements || []);
    variable = createArrayVariable(identifier, resolvedValue, isComplex, source, metadata);
    
  } else if (valueNode.type === 'object') {
    const isComplex = hasComplexValues(valueNode.properties);
    variable = createObjectVariable(identifier, resolvedValue, isComplex, source, metadata);
    
  } else if (valueNode.type === 'command') {
    variable = createCommandResultVariable(identifier, resolvedValue, valueNode.command, source, 
      undefined, undefined, metadata);
    
  } else if (valueNode.type === 'code') {
    // Need to get source code from the value node
    const sourceCode = valueNode.code || ''; // TODO: Verify how to extract source code
    variable = createComputedVariable(identifier, resolvedValue, 
      valueNode.language || 'js', sourceCode, source, metadata);
    
  } else if (valueNode.type === 'path') {
    const filePath = await interpolate(valueNode.segments, env);
    variable = createFileContentVariable(identifier, resolvedValue, filePath, source, metadata);
    
  } else if (valueNode.type === 'section') {
    const filePath = await interpolate(valueNode.path, env);
    const sectionName = await interpolate(valueNode.section, env);
    variable = createSectionContentVariable(identifier, resolvedValue, filePath, 
      sectionName, 'hash', source, metadata);
    
  } else if (valueNode.type === 'load-content') {
    // Handle load-content nodes from <file.md> syntax
    const { source: contentSource, options } = valueNode;
    
    // Import type guards for LoadContentResult
    const { isLoadContentResult, isLoadContentResultArray } = await import('./load-content-types');
    
    if (isLoadContentResult(resolvedValue)) {
      // Single file with metadata - store as object variable
      variable = createObjectVariable(identifier, resolvedValue, true, source, metadata);
    } else if (isLoadContentResultArray(resolvedValue)) {
      // Array of files from glob pattern - store as array variable
      variable = createArrayVariable(identifier, resolvedValue, true, source, metadata);
    } else if (typeof resolvedValue === 'string') {
      // Backward compatibility - plain string (e.g., from section extraction)
      if (contentSource.type === 'path') {
        const filePath = contentSource.raw || '';
        
        if (options?.section) {
          // Section extraction case
          const sectionName = options.section.identifier.content || '';
          variable = createSectionContentVariable(identifier, resolvedValue, filePath, 
            sectionName, 'hash', source, metadata);
        } else {
          // Whole file case
          variable = createFileContentVariable(identifier, resolvedValue, filePath, source, metadata);
        }
      } else if (contentSource.type === 'url') {
        // URL content
        const url = contentSource.raw || '';
        variable = createFileContentVariable(identifier, resolvedValue, url, source, metadata);
      } else {
        // Default to simple text
        variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
      }
    } else {
      // Fallback - shouldn't happen
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else if (valueNode.type === 'VariableReference') {
    // For now, create a variable based on the resolved type
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        variable = createArrayVariable(identifier, resolvedValue, false, source, metadata);
      } else {
        variable = createObjectVariable(identifier, resolvedValue, false, source, metadata);
      }
    } else {
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else if (valueNode.type === 'foreach') {
    // Foreach expressions always return arrays
    const isComplex = false; // foreach results are typically simple values
    variable = createArrayVariable(identifier, resolvedValue, isComplex, source, metadata);
    
  } else if (valueNode.type === 'ExecInvocation') {
    // Exec invocations can return any type
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        variable = createArrayVariable(identifier, resolvedValue, false, source, metadata);
      } else {
        variable = createObjectVariable(identifier, resolvedValue, false, source, metadata);
      }
    } else {
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else if (valueNode.type === 'VariableReferenceWithTail') {
    // Variable with tail modifiers - create based on resolved type
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        variable = createArrayVariable(identifier, resolvedValue, false, source, metadata);
      } else {
        variable = createObjectVariable(identifier, resolvedValue, false, source, metadata);
      }
    } else {
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else {
    // Text variables - need to determine specific type
    const strValue = String(resolvedValue);
    
    if (directive.meta?.wrapperType === 'singleQuote') {
      variable = createSimpleTextVariable(identifier, strValue, source, metadata);
    } else if (directive.meta?.isTemplateContent || directive.meta?.wrapperType === 'backtick' || directive.meta?.wrapperType === 'doubleBracket') {
      // Template variable
      const templateType = directive.meta?.wrapperType === 'doubleBracket' ? 'doubleBracket' : 'backtick';
      // For double-bracket templates, the value is the AST array, not a string
      const templateValue = directive.meta?.wrapperType === 'doubleBracket' && Array.isArray(resolvedValue) 
        ? resolvedValue as any // Pass the AST array
        : strValue; // For other templates, use the string value
      variable = createTemplateVariable(identifier, templateValue, undefined, templateType, source, metadata);
    } else if (directive.meta?.wrapperType === 'doubleQuote' || source.hasInterpolation) {
      // Interpolated text - need to track interpolation points
      // For now, create without interpolation points - TODO: extract these from AST
      variable = createInterpolatedTextVariable(identifier, strValue, [], source, metadata);
    } else {
      // Default to simple text
      variable = createSimpleTextVariable(identifier, strValue, source, metadata);
    }
  }

  // Check if the directive has a withClause for pipeline processing
  if (directive.values?.withClause && directive.values.withClause.pipeline) {
    const { executePipeline } = await import('./pipeline');
    const format = directive.values.withClause.format as string | undefined;
    
    // Get the current variable value as string
    const { resolveVariableValue: resolveVarValue } = await import('../core/interpreter');
    const currentValue = await resolveVarValue(variable, env);
    const stringValue = typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue);
    
    // Execute the pipeline
    const pipelineResult = await executePipeline(
      stringValue,
      directive.values.withClause.pipeline,
      env,
      directive.location,
      format
    );
    
    // Update the variable with the pipeline result
    variable = createSimpleTextVariable(identifier, pipelineResult, source, metadata);
  }

  env.setVariable(identifier, variable);
  
  // Debug logging for primitive values
  if (process.env.MLLD_DEBUG === 'true' && identifier === 'sum') {
    logger.debug('Setting variable @sum:', {
      identifier,
      resolvedValue,
      valueType: typeof resolvedValue,
      variableType: variable.type,
      variableValue: variable.value
    });
  }

  // Return empty string - var directives don't produce output
  return { value: '', env };
}

/**
 * Check if an object has complex values that need lazy evaluation
 */
function hasComplexValues(properties: any): boolean {
  if (!properties) return false;
  
  for (const value of Object.values(properties)) {
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
      if (value.type === 'object' && hasComplexValues(value.properties)) {
        return true;
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
        item.type === 'load-content'
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
 */
async function evaluateArrayItem(item: any, env: Environment): Promise<any> {
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
    return await interpolate(item.content, env);
  }

  // Also handle the case where we just have content array without wrapperType
  if ('content' in item && Array.isArray(item.content)) {
    return await interpolate(item.content, env);
  }
  
  // Handle raw Text nodes that may appear in objects
  if (item.type === 'Text' && 'content' in item) {
    return item.content;
  }

  // Handle objects without explicit type property (plain objects from parser)
  if (!item.type && typeof item === 'object' && item.constructor === Object) {
    const nestedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(item)) {
      // Skip internal properties
      if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
        continue;
      }
      nestedObj[key] = await evaluateArrayItem(value, env);
    }
    return nestedObj;
  }

  switch (item.type) {
    case 'array':
      // Nested array
      const nestedItems = [];
      for (const nestedItem of (item.items || [])) {
        nestedItems.push(await evaluateArrayItem(nestedItem, env));
      }
      return nestedItems;

    case 'object':
      // Nested object
      const nestedObj: Record<string, any> = {};
      if (item.properties) {
        for (const [key, value] of Object.entries(item.properties)) {
          nestedObj[key] = await evaluateArrayItem(value, env);
        }
      }
      return nestedObj;

    case 'VariableReference':
      // Variable reference in array
      const variable = env.getVariable(item.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${item.identifier}`);
      }
      const { resolveVariableValue } = await import('../core/interpreter');
      return await resolveVariableValue(variable, env);

    case 'path':
      // Path node in array - read the file content
      const filePath = await interpolate(item.segments || [], env);
      return await env.readFile(filePath);

    case 'section':
      // Section extraction in array
      const sectionFilePath = await interpolate(item.path || [], env);
      const sectionName = await interpolate(item.section || [], env);
      const fileContent = await env.readFile(sectionFilePath);
      const { llmxmlInstance } = await import('../utils/llmxml-instance');
      try {
        return await llmxmlInstance.getSection(fileContent, sectionName, {
          includeNested: true,
          includeTitle: true
        });
      } catch (error) {
        // Fallback to basic extraction
        return extractSection(fileContent, sectionName);
      }

    case 'load-content':
      // Load content node in array - use the content loader
      const { processContentLoader } = await import('./content-loader');
      return await processContentLoader(item, env, 'var');

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
          plainObj[key] = await evaluateArrayItem(value, env);
        }
        return plainObj;
      }
      
      // Try to interpolate as a node array
      return await interpolate([item], env);
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