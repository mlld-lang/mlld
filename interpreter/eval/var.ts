import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { 
  createTextVariable, 
  createDataVariable, 
  createComplexDataVariable,
  astLocationToSourceLocation 
} from '@core/types';

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
    // Template or string content - need to interpolate
    variableType = 'text';
    resolvedValue = await interpolate(valueNode, env);
    
  } else if (valueNode.type === 'Text' && 'content' in valueNode) {
    // Simple text content
    variableType = 'text';
    resolvedValue = valueNode.content;
    
  } else {
    // Default case - try to interpolate as text
    variableType = 'text';
    resolvedValue = await interpolate([valueNode], env);
  }

  // Create and store the appropriate variable type
  const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
  
  if (variableType === 'data') {
    // Check if this is complex data that needs lazy evaluation
    const needsLazyEval = valueNode.type === 'code' || 
                         (valueNode.type === 'object' && hasComplexValues(valueNode.properties));
    
    if (needsLazyEval && valueNode.type !== 'code') {
      // Store raw value for lazy evaluation
      const variable = createComplexDataVariable(identifier, valueNode, { definedAt: location });
      env.setVariable(identifier, variable);
    } else {
      // Simple data variable
      const variable = createDataVariable(identifier, resolvedValue, { definedAt: location });
      env.setVariable(identifier, variable);
    }
  } else {
    // Text variable
    const variable = createTextVariable(identifier, String(resolvedValue), {
      definedAt: location,
      ...(directive.meta?.isTemplateContent ? { isTemplateContent: true } : {})
    });
    env.setVariable(identifier, variable);
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
        value.type === 'VariableReference'
      )) {
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