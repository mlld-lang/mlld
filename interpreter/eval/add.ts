import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable, isImportVariable } from '@core/types';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { evaluateDataValue, hasUnevaluatedDirectives } from './lazy-eval';
import { evaluateForeachAsText, parseForeachOptions } from '../utils/foreach';
import { normalizeTemplateContent } from '../utils/blank-line-normalizer';

/**
 * Remove single blank lines but preserve multiple blank lines.
 * This helps match the expected output format.
 */
function compactBlankLines(content: string): string {
  // This operates on final output strings, not AST content
  // eslint-disable-next-line mlld/no-ast-string-manipulation
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
    let originalValue: any; // Keep track of the original value before evaluation
    let isForeachSection = false; // Track if this came from a foreach-section
    
    if (isTextVariable(variable)) {
      // Text variables contain string content - use directly
      value = variable.value;
      // Check if this variable was created from template content and normalization is enabled
      if (variable.meta?.isTemplateContent && env.getNormalizeBlankLines()) {
        value = normalizeTemplateContent(value, true);
      }
    } else if (isDataVariable(variable)) {
      // Data variables contain structured data
      value = variable.value;
      originalValue = value; // Store original value for later checking
      
      // Check if this is a foreach-section expression
      if (value && typeof value === 'object' && value.type === 'foreach-section') {
        isForeachSection = true;
      }
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
          const index = Number(field.value);
          if (Array.isArray(value)) {
            value = value[index];
          } else {
            throw new Error(`Cannot index non-array value with [${index}]`);
          }
        } else if (field.type === 'field' || field.type === 'stringIndex') {
          const fieldName = String(field.value);
          if (typeof value === 'object' && value !== null) {
            // Handle DataObject type
            if (value.type === 'object' && value.properties) {
              value = value.properties[fieldName];
            } else {
              value = value[fieldName];
            }
          } else {
            throw new Error(`Cannot access property '${fieldName}' on non-object value`);
          }
        } else if (field.type === 'numericField') {
          const fieldName = String(field.value);
          if (typeof value === 'object' && value !== null) {
            value = value[fieldName];
          } else {
            throw new Error(`Cannot access numeric property '${fieldName}' on non-object value`);
          }
        }
      }
    }
    
    // Check if the value contains unevaluated directives
    if (hasUnevaluatedDirectives(value)) {
      // Evaluate any embedded directives
      value = await evaluateDataValue(value, env);
      
      // After evaluation, check if the original value was a foreach-section
      if (originalValue && typeof originalValue === 'object' && originalValue.type === 'foreach-section') {
        isForeachSection = true;
      }
    }
    
    // Convert final value to string
    if (typeof value === 'string') {
      content = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      // For primitives, just convert to string
      content = String(value);
    } else if (Array.isArray(value)) {
      // Check if this is from a foreach-section expression
      if (isForeachSection && value.every(item => typeof item === 'string')) {
        // Join string array with double newlines for foreach-section results
        content = value.join('\n\n');
      } else {
        // For other arrays, use JSON format (this preserves the original behavior)
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
      }
    } else if (value !== null && value !== undefined) {
      // For objects, use JSON with custom replacer for VariableReference nodes
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
    try {
      // getSection expects just the title without the # prefix
      const titleWithoutHash = sectionTitle.replace(/^#+\s*/, '');
      content = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
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
        // Handle three cases:
        // 1. Just header level: "###" -> change level only
        // 2. No header level: "Name" -> keep original level, replace text
        // 3. Full replacement: "### Name" -> replace entire line
        
        const newTitleTrimmed = newTitle.trim();
        const newHeadingMatch = newTitleTrimmed.match(/^(#+)(\s+(.*))?$/);
        
        if (newHeadingMatch) {
          // Case 1: Just header level (e.g., "###")
          if (!newHeadingMatch[3]) {
            const originalText = lines[0].replace(/^#+\s*/, '');
            lines[0] = `${newHeadingMatch[1]} ${originalText}`;
          } 
          // Case 3: Full replacement (e.g., "### Name")
          else {
            lines[0] = newTitleTrimmed;
          }
        } else {
          // Case 2: No header level (e.g., "Name")
          const originalLevel = lines[0].match(/^(#+)\s/)?.[1] || '#';
          lines[0] = `${originalLevel} ${newTitleTrimmed}`;
        }
        
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
    
    // Apply template normalization if this is template content and normalization is enabled
    if (directive.meta?.isTemplateContent && env.getNormalizeBlankLines()) {
      content = normalizeTemplateContent(content, true);
    }
    
    // Handle section extraction if specified
    const sectionNodes = directive.values?.section;
    if (sectionNodes && Array.isArray(sectionNodes)) {
      const section = await interpolate(sectionNodes, env);
      if (section) {
        content = extractSection(content, section);
      }
    }
    
  } else if (directive.subtype === 'addInvocation') {
    // Handle unified invocation - could be template or exec
    const invocation = directive.values?.invocation;
    if (!invocation) {
      throw new Error('Add invocation directive missing invocation');
    }
    
    // Get the invocation name
    const commandRef = invocation.commandRef;
    const name = commandRef.name || commandRef.identifier[0]?.content;
    if (!name) {
      throw new Error('Add invocation missing name');
    }
    
    // Look up what this invocation refers to
    const variable = env.getVariable(name);
    if (!variable) {
      throw new Error(`Variable not found: ${name}`);
    }
    
    // Handle based on variable type
    if (variable.type === 'command' || variable.type === 'execCommand') {
      // This is an exec invocation
      const { evaluateExecInvocation } = await import('./exec-invocation');
      const result = await evaluateExecInvocation(invocation, env);
      content = String(result.value);
    } else if (variable.type === 'textTemplate') {
      // Handle as template invocation
      const template = variable;
      
      // Get the arguments from the command reference
      const args = commandRef.args || [];
      
      // Check parameter count
      if (args.length !== template.params.length) {
        throw new Error(`Template ${name} expects ${template.params.length} parameters, got ${args.length}`);
      }
      
      // Create a child environment with the template parameters
      const childEnv = env.createChild();
      
      // Bind arguments to parameters
      for (let i = 0; i < template.params.length; i++) {
        const paramName = template.params[i];
        const argValue = args[i];
        
        // Convert argument to string value
        let value: string;
        if (typeof argValue === 'object' && argValue.type === 'Text') {
          // Handle Text nodes from the AST
          value = argValue.content || '';
        } else if (typeof argValue === 'object' && argValue.type === 'VariableReference') {
          // Handle variable references like @userName
          const varName = argValue.identifier;
          const variable = env.getVariable(varName);
          if (!variable) {
            throw new Error(`Variable not found: ${varName}`);
          }
          value = variable.type === 'text' ? variable.value : String(variable.value);
        } else if (typeof argValue === 'object' && argValue.type === 'string') {
          // Legacy format support
          value = argValue.value;
        } else if (typeof argValue === 'object' && argValue.type === 'variable') {
          // Legacy format - handle variable references
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
      
      // Apply template normalization if the template definition had isTemplateContent and normalization is enabled
      if (template.meta?.isTemplateContent && env.getNormalizeBlankLines()) {
        content = normalizeTemplateContent(content, true);
      }
    } else {
      throw new Error(`Variable ${name} is not a template or exec command (type: ${variable.type})`);
    }
    
  } else if (directive.subtype === 'addTemplateInvocation') {
    // Handle old-style template invocation (for backward compatibility)
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
      if (typeof argValue === 'object' && argValue.type === 'Text') {
        // Handle Text nodes from the AST
        value = argValue.content || '';
      } else if (typeof argValue === 'object' && argValue.type === 'VariableReference') {
        // Handle variable references like @userName
        const varName = argValue.identifier;
        const variable = env.getVariable(varName);
        if (!variable) {
          throw new Error(`Variable not found: ${varName}`);
        }
        value = variable.type === 'text' ? variable.value : String(variable.value);
      } else if (typeof argValue === 'object' && argValue.type === 'string') {
        // Legacy format support
        value = argValue.value;
      } else if (typeof argValue === 'object' && argValue.type === 'variable') {
        // Legacy format - handle variable references
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
    
    // Apply template normalization if the template definition had isTemplateContent and normalization is enabled
    if (template.meta?.isTemplateContent && env.getNormalizeBlankLines()) {
      content = normalizeTemplateContent(content, true);
    }
    
  } else if (directive.subtype === 'addForeach') {
    // Handle foreach expressions for direct output
    const foreachExpression = directive.values?.foreach;
    if (!foreachExpression) {
      throw new Error('Add foreach directive missing foreach expression');
    }
    
    // Parse options from with clause if present
    const options = parseForeachOptions(foreachExpression.with);
    
    // For @add, we want each result on its own line without the heavy separator
    if (!options.separator) {
      options.separator = '\n';
    }
    
    // Evaluate foreach and format as text
    content = await evaluateForeachAsText(foreachExpression, env, options);
    
  } else if (directive.subtype === 'addExecInvocation') {
    // Handle exec invocation nodes
    const execInvocation = directive.values?.execInvocation;
    if (!execInvocation) {
      throw new Error('Add exec invocation directive missing exec invocation');
    }
    
    // Evaluate the exec invocation
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(execInvocation, env);
    content = String(result.value);
    
  } else if (directive.subtype === 'addForeachSection') {
    // Handle foreach section expressions: @add foreach [@array.field # section] as [[template]]
    const foreachExpression = directive.values?.foreach;
    if (!foreachExpression) {
      throw new Error('Add foreach section directive missing foreach expression');
    }
    
    // Evaluate foreach section expression
    const { evaluateForeachSection } = await import('./data-value-evaluator');
    const result = await evaluateForeachSection(foreachExpression, env);
    
    // Convert result to string content - should be an array of results
    if (Array.isArray(result)) {
      content = result.join('\n\n');
    } else {
      content = String(result);
    }
    
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