import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable, isImportVariable } from '@core/types';
import { createLLMXML } from 'llmxml';
import { evaluateDataValue, hasUnevaluatedDirectives } from './lazy-eval';
import { evaluateForeachAsText, parseForeachOptions } from '../utils/foreach';

/**
 * Remove single blank lines but preserve multiple blank lines.
 * This helps match the expected output format.
 */
function compactBlankLines(content: string): string {
  return content.replace(/\n\n/g, '\n');
}

/**
 * Evaluate @add directives.
 * Handles variable references, paths, and templates.
 * 
 * Ported from AddDirectiveHandler.
 */
export async function evaluateAdd(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  let content = '';
  
  if (directive.subtype === 'addVariable') {
    // Handle variable reference
    const variableNodes = directive.values?.variable;
    if (!variableNodes || variableNodes.length === 0) {
      throw new Error('Add variable directive missing variable reference');
    }
    
    const variableNode = variableNodes[0];
    const varName = variableNode.identifier;
    
    // Get variable from environment
    const variable = env.getVariable(varName);
    if (!variable) {
      throw new Error(`Variable not found: ${varName}`);
    }
    
    // Get the base value using type-safe approach
    let value: any;
    if (isTextVariable(variable)) {
      // Text variables contain string content - use directly
      value = variable.value;
    } else if (isDataVariable(variable)) {
      // Data variables contain structured data
      value = variable.value;
    } else if (isPathVariable(variable)) {
      // Path variables contain file path info - read the file
      const pathValue = variable.value.resolvedPath;
      const isURL = variable.value.isURL;
      const security = variable.value.security;
      
      try {
        if (isURL && security) {
          // Use URL cache with security options
          value = await env.fetchURLWithSecurity(pathValue, security, varName);
        } else {
          // Regular file or URL without security options
          value = await env.readFile(pathValue);
        }
      } catch (error) {
        // If it's not a file or can't be read, use the path itself
        value = pathValue;
      }
    } else if (isImportVariable(variable)) {
      // Import variables contain imported data
      value = variable.value;
    } else if (isCommandVariable(variable)) {
      // Command variables - should probably not be used directly in add
      throw new Error(`Cannot add command variable directly. Commands need to be executed first.`);
    } else {
      throw new Error(`Unknown variable type in add evaluator: ${(variable as any).type}`);
    }
    
    // Handle field access if present in the variable node
    if (variableNode.fields && variableNode.fields.length > 0) {
      // Process field access
      for (const field of variableNode.fields) {
        if (value === null || value === undefined) {
          throw new Error(`Cannot access field on null or undefined value`);
        }
        
        if (field.type === 'arrayIndex') {
          const index = field.index;
          if (Array.isArray(value)) {
            value = value[index];
          } else {
            throw new Error(`Cannot index non-array value with [${index}]`);
          }
        } else if (field.type === 'field') {
          if (typeof value === 'object' && value !== null) {
            // Handle DataObject type
            if (value.type === 'object' && value.properties) {
              value = value.properties[field.name];
            } else {
              value = value[field.name];
            }
          } else {
            throw new Error(`Cannot access property '${field.name}' on non-object value`);
          }
        }
      }
    }
    
    // Check if the value contains unevaluated directives
    if (hasUnevaluatedDirectives(value)) {
      // Evaluate any embedded directives
      value = await evaluateDataValue(value, env);
    }
    
    // Convert final value to string
    if (typeof value === 'string') {
      content = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      // For primitives, just convert to string
      content = String(value);
    } else if (value !== null && value !== undefined) {
      // For objects/arrays, use JSON with custom replacer for VariableReference nodes
      content = JSON.stringify(value, (key, val) => {
        // Convert VariableReference nodes to their string representation
        if (val && typeof val === 'object' && val.type === 'VariableReference' && val.identifier) {
          return `@${val.identifier}`;
        }
        // Convert nested DataObject types to plain objects
        if (val && typeof val === 'object' && val.type === 'object' && val.properties) {
          return val.properties;
        }
        return val;
      }, 2);
    } else {
      // Handle null/undefined
      content = '';
    }
    
  } else if (directive.subtype === 'addPath') {
    // Handle path inclusion (whole file)
    const pathValue = directive.values?.path;
    if (!pathValue) {
      throw new Error('Add path directive missing path');
    }
    
    // Handle both string paths (URLs) and node arrays
    let resolvedPath: string;
    if (typeof pathValue === 'string') {
      // Direct string path (typically URLs)
      resolvedPath = pathValue;
    } else if (Array.isArray(pathValue)) {
      // Array of path nodes
      resolvedPath = await interpolate(pathValue, env);
    } else {
      throw new Error('Invalid path type in add directive');
    }
    
    if (!resolvedPath) {
      throw new Error('Add path directive resolved to empty path');
    }
    
    // Check if this directive has security options
    const security = directive.meta ? {
      ttl: directive.meta.ttl,
      trust: directive.meta.trust
    } : undefined;
    
    // Read the file content or fetch URL with security options if URL
    if (env.isURL(resolvedPath) && security) {
      content = await env.fetchURLWithSecurity(resolvedPath, security, 'add-directive');
    } else {
      content = await env.readFile(resolvedPath);
    }
    
  } else if (directive.subtype === 'addPathSection') {
    // Handle section extraction: @add "Section Title" from [file.md]
    const sectionTitleNodes = directive.values?.sectionTitle;
    const pathValue = directive.values?.path;
    
    if (!sectionTitleNodes || !pathValue) {
      throw new Error('Add section directive missing section title or path');
    }
    
    // Get the section title
    const sectionTitle = await interpolate(sectionTitleNodes, env);
    
    // Handle both string paths (URLs) and node arrays
    let resolvedPath: string;
    if (typeof pathValue === 'string') {
      // Direct string path (typically URLs)
      resolvedPath = pathValue;
    } else if (Array.isArray(pathValue)) {
      // Array of path nodes
      resolvedPath = await interpolate(pathValue, env);
    } else {
      throw new Error('Invalid path type in add section directive');
    }
    
    // Check if this directive has security options
    const security = directive.meta ? {
      ttl: directive.meta.ttl,
      trust: directive.meta.trust
    } : undefined;
    
    // Read the file content or fetch URL with security options if URL
    let fileContent: string;
    if (env.isURL(resolvedPath) && security) {
      fileContent = await env.fetchURLWithSecurity(resolvedPath, security, 'add-section-directive');
    } else {
      fileContent = await env.readFile(resolvedPath);
    }
    
    // Extract the section using llmxml
    const llmxml = createLLMXML();
    try {
      // getSection expects just the title without the # prefix
      const titleWithoutHash = sectionTitle.replace(/^#+\s*/, '');
      content = await llmxml.getSection(fileContent, titleWithoutHash, {
        includeNested: true
      });
      // Compact blank lines and trim
      content = compactBlankLines(content).trimEnd();
    } catch (error) {
      // Fallback to basic extraction if llmxml fails
      content = extractSection(fileContent, sectionTitle);
    }
    
    // Handle rename if newTitle is specified
    const newTitleNodes = directive.values?.newTitle;
    if (newTitleNodes) {
      const newTitle = await interpolate(newTitleNodes, env);
      // Replace the original section title with the new one
      const lines = content.split('\n');
      if (lines.length > 0 && lines[0].match(/^#+\s/)) {
        // Extract the heading level from the new title or default to original
        const newHeadingMatch = newTitle.match(/^(#+)\s/);
        const newHeadingLevel = newHeadingMatch ? newHeadingMatch[1] : '#';
        const titleText = newTitle.replace(/^#+\s*/, '');
        lines[0] = `${newHeadingLevel} ${titleText}`;
        content = lines.join('\n');
      } else {
        // If no heading found, prepend the new title
        content = newTitle + '\n' + content;
      }
    }
    
  } else if (directive.subtype === 'addTemplate') {
    // Handle template
    const templateNodes = directive.values?.content;
    if (!templateNodes) {
      throw new Error('Add template directive missing content');
    }
    
    // Interpolate the template
    content = await interpolate(templateNodes, env);
    
    // Handle section extraction if specified
    const section = directive.raw?.section;
    if (section) {
      content = extractSection(content, section);
    }
    
  } else if (directive.subtype === 'addTemplateInvocation') {
    // Handle parameterized template invocation
    const templateNameNodes = directive.values?.templateName;
    if (!templateNameNodes || templateNameNodes.length === 0) {
      throw new Error('Add template invocation missing template name');
    }
    
    // Get the template name
    const templateName = await interpolate(templateNameNodes, env);
    
    // Look up the template
    const template = env.getVariable(templateName);
    if (!template || template.type !== 'textTemplate') {
      throw new Error(`Template not found: ${templateName}`);
    }
    
    // Get the arguments
    const args = directive.values?.arguments || [];
    
    // Check parameter count
    if (args.length !== template.params.length) {
      throw new Error(`Template ${templateName} expects ${template.params.length} parameters, got ${args.length}`);
    }
    
    // Create a child environment with the template parameters
    const childEnv = env.createChild();
    
    // Bind arguments to parameters
    for (let i = 0; i < template.params.length; i++) {
      const paramName = template.params[i];
      const argValue = args[i];
      
      // Convert argument to string value
      let value: string;
      if (typeof argValue === 'object' && argValue.type === 'string') {
        value = argValue.value;
      } else if (typeof argValue === 'object' && argValue.type === 'variable') {
        // Handle variable references like @userName
        // The value is a VariableReference node
        const varRef = argValue.value;
        const varName = varRef.identifier;
        const variable = env.getVariable(varName);
        if (!variable) {
          throw new Error(`Variable not found: ${varName}`);
        }
        value = variable.type === 'text' ? variable.value : String(variable.value);
      } else {
        value = String(argValue);
      }
      
      // Create a text variable for the parameter
      childEnv.setVariable(paramName, { type: 'text', identifier: paramName, value });
    }
    
    // Interpolate the template content with the child environment
    content = await interpolate(template.content, childEnv);
    
  } else if (directive.subtype === 'addForeach') {
    // Handle foreach expressions for direct output
    const foreachExpression = directive.values?.foreach;
    if (!foreachExpression) {
      throw new Error('Add foreach directive missing foreach expression');
    }
    
    // Parse options from with clause if present
    const options = parseForeachOptions(directive.values?.withClause);
    
    // For @add, we want each result on its own line without the heavy separator
    if (!options.separator) {
      options.separator = '\n';
    }
    
    // Evaluate foreach and format as text
    content = await evaluateForeachAsText(foreachExpression, env, options);
    
  } else {
    throw new Error(`Unsupported add subtype: ${directive.subtype}`);
  }
  
  // Output directives always end with a newline
  // This is the interpreter's responsibility, not the grammar's
  if (!content.endsWith('\n')) {
    content += '\n';
  }
  
  // Create replacement text node
  const replacementNode: TextNode = {
    type: 'Text',
    nodeId: `${directive.nodeId}-content`,
    content
  };
  
  // Add the replacement node to environment
  env.addNode(replacementNode);
  
  // Return the content
  return { value: content, env };
}

// We'll use llmxml for section extraction once it's properly set up
// For now, keeping the basic implementation
/**
 * Extract a section from markdown content.
 * TODO: Replace with llmxml.getSection() once integrated
 */
function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\\n');
  const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
  
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];
  
  for (const line of lines) {
    // Check if this line starts our section
    if (!inSection && sectionRegex.test(line)) {
      inSection = true;
      sectionLevel = line.match(/^#+/)?.[0].length || 0;
      continue; // Skip the header itself
    }
    
    // If we're in the section
    if (inSection) {
      // Check if we've hit another header at the same or higher level
      const headerMatch = line.match(/^(#+)\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        // We've left the section
        break;
      }
      
      sectionLines.push(line);
    }
  }
  
  return sectionLines.join('\\n').trim();
}