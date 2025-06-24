import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { astLocationToSourceLocation } from '@core/types';
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
function createVariableSource(valueNode: any, directive: DirectiveNode): VariableSource {
  const baseSource: VariableSource = {
    directive: 'var',
    syntax: 'quoted', // default
    hasInterpolation: false,
    isMultiLine: false
  };

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

  // Check for multi-line content
  if (typeof valueNode === 'string' && valueNode.includes('\n')) {
    baseSource.isMultiLine = true;
  }

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
  // Extract identifier
  const identifierNode = directive.values?.identifier;
  if (!identifierNode) {
    throw new Error('Var directive missing identifier');
  }
  
  const identifier = identifierNode.identifier;
  if (!identifier) {
    throw new Error('Var directive identifier must be a simple variable name');
  }

  // Get the value node - this contains type information from the parser
  const valueNode = directive.values?.value;
  if (!valueNode) {
    throw new Error('Var directive missing value');
  }

  // Type-based routing based on the AST structure
  let resolvedValue: any;
  let variableType: 'text' | 'data' = 'text'; // Default to text
  
  if (valueNode.type === 'array') {
    // Array literal: [1, 2, 3] or [,]
    variableType = 'data';
    // Process array items - they might need interpolation
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
    
  } else if (valueNode.type === 'object') {
    // Object literal: { "key": "value" }
    variableType = 'data';
    // Process object properties
    const processedObject: Record<string, any> = {};
    if (valueNode.properties) {
      for (const [key, propValue] of Object.entries(valueNode.properties)) {
        // Each property value might need interpolation
        if (propValue && typeof propValue === 'object' && 'content' in propValue) {
          processedObject[key] = await interpolate(propValue.content as any, env);
        } else if (propValue && typeof propValue === 'object' && propValue.type === 'array') {
          // Handle array values in objects
          const processedArray = [];
          for (const item of (propValue.items || [])) {
            const evaluated = await evaluateArrayItem(item, env);
            processedArray.push(evaluated);
          }
          processedObject[key] = processedArray;
        } else {
          processedObject[key] = propValue;
        }
      }
    }
    resolvedValue = processedObject;
    
  } else if (valueNode.type === 'section') {
    // Section extraction: [file.md # Section]
    variableType = 'text';
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
    
  } else if (valueNode.type === 'path') {
    // Path dereference: [README.md]
    variableType = 'text';
    const filePath = await interpolate(valueNode.segments, env);
    resolvedValue = await env.readFile(filePath);
    
  } else if (valueNode.type === 'code') {
    // Code execution: run js { ... } or js { ... }
    const { evaluateCodeExecution } = await import('./code-execution');
    const result = await evaluateCodeExecution(valueNode, env);
    resolvedValue = result.value;
    
    // Infer variable type from result
    variableType = (typeof resolvedValue === 'object' && resolvedValue !== null) ? 'data' : 'text';
    
  } else if (valueNode.type === 'command') {
    // Shell command: run { echo "hello" }
    variableType = 'text';
    const command = valueNode.command;
    resolvedValue = await env.executeCommand(command);
    
  } else if (valueNode.type === 'VariableReference') {
    // Variable reference: @otherVar
    const sourceVar = env.getVariable(valueNode.identifier);
    if (!sourceVar) {
      throw new Error(`Variable not found: ${valueNode.identifier}`);
    }
    
    // Copy the variable type from source
    variableType = sourceVar.type === 'data' ? 'data' : 'text';
    const { resolveVariableValue } = await import('../core/interpreter');
    resolvedValue = await resolveVariableValue(sourceVar, env);
    
    // Handle field access if present
    if (valueNode.fields && valueNode.fields.length > 0) {
      const { accessField } = await import('../utils/field-access');
      resolvedValue = await accessField(resolvedValue, valueNode.fields, valueNode.identifier);
    }
    
  } else if (Array.isArray(valueNode)) {
    // For backtick templates, we should extract the text content directly
    // Check if this is a simple text array (backtick template)
    if (valueNode.length === 1 && valueNode[0].type === 'Text' && directive.meta?.wrapperType === 'backtick') {
      variableType = 'text';
      resolvedValue = valueNode[0].content;
    } else {
      // Template or string content - need to interpolate
      variableType = 'text';
      resolvedValue = await interpolate(valueNode, env);
    }
    
  } else if (valueNode.type === 'Text' && 'content' in valueNode) {
    // Simple text content
    variableType = 'text';
    resolvedValue = valueNode.content;
    
  } else if (valueNode && valueNode.type === 'foreach-command') {
    // Handle foreach expressions
    const { evaluateForeachCommand } = await import('./data-value-evaluator');
    variableType = 'data';
    resolvedValue = await evaluateForeachCommand(valueNode, env);
    
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
      result = await accessField(result, varWithTail.variable.fields, varWithTail.variable.identifier);
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
    variableType = 'text'; // Pipeline output is always text
    
  } else {
    // Default case - try to interpolate as text
    variableType = 'text';
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('var.ts: Default case for valueNode:', valueNode);
    }
    resolvedValue = await interpolate([valueNode], env);
  }

  // Create and store the appropriate variable type
  const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
  const source = createVariableSource(valueNode, directive);
  const metadata = { definedAt: location };

  let variable: Variable;

  // Create specific variable types based on AST node type
  if (valueNode.type === 'array') {
    const isComplex = hasComplexArrayItems(resolvedValue);
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
    
  } else {
    // Text variables - need to determine specific type
    const strValue = String(resolvedValue);
    
    if (directive.meta?.wrapperType === 'singleQuote') {
      variable = createSimpleTextVariable(identifier, strValue, source, metadata);
    } else if (directive.meta?.isTemplateContent || directive.meta?.wrapperType === 'backtick') {
      // Template variable
      variable = createTemplateVariable(identifier, strValue, undefined, 'backtick', source, metadata);
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
        value.type === 'VariableReference'
      )) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if array items contain complex values
 */
function hasComplexArrayItems(items: any[]): boolean {
  if (!items || items.length === 0) return false;
  
  for (const item of items) {
    if (item && typeof item === 'object') {
      if ('type' in item && (
        item.type === 'code' || 
        item.type === 'command' || 
        item.type === 'VariableReference' ||
        item.type === 'array' ||
        item.type === 'object'
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

  // Handle wrapped content first (e.g., quoted strings in arrays)
  if ('content' in item && Array.isArray(item.content)) {
    return await interpolate(item.content, env);
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

    default:
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