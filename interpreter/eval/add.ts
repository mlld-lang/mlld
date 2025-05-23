import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createLLMXML } from 'llmxml';

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
    
    // Get the base value
    let value: any;
    switch (variable.type) {
      case 'text':
        value = variable.value;
        break;
      case 'data':
        value = variable.value;
        break;
      case 'path':
        // For path variables, we should read the file contents
        const pathValue = variable.value.resolvedPath;
        try {
          // Try to read the file
          value = await env.readFile(pathValue);
        } catch (error) {
          // If it's not a file or can't be read, use the path itself
          value = pathValue;
        }
        break;
      default:
        value = (variable as any).value;
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
            value = value[field.name];
          } else {
            throw new Error(`Cannot access property '${field.name}' on non-object value`);
          }
        }
      }
    }
    
    // Convert final value to string
    if (typeof value === 'string') {
      content = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      // For primitives, just convert to string
      content = String(value);
    } else {
      // For objects/arrays, use JSON
      content = JSON.stringify(value, null, 2);
    }
    
  } else if (directive.subtype === 'addPath') {
    // Handle path inclusion (whole file)
    const pathNodes = directive.values?.path;
    if (!pathNodes) {
      throw new Error('Add path directive missing path');
    }
    
    // Resolve the path
    const resolvedPath = await interpolate(pathNodes, env);
    
    // Read the entire file content
    content = await env.readFile(resolvedPath);
    
  } else if (directive.subtype === 'addSection') {
    // Handle section extraction: @add "Section Title" from [file.md]
    const sectionTitleNodes = directive.values?.sectionTitle;
    const pathNodes = directive.values?.path;
    
    if (!sectionTitleNodes || !pathNodes) {
      throw new Error('Add section directive missing section title or path');
    }
    
    // Get the section title
    const sectionTitle = await interpolate(sectionTitleNodes, env);
    
    // Resolve the path
    const resolvedPath = await interpolate(pathNodes, env);
    
    // Read the file content
    const fileContent = await env.readFile(resolvedPath);
    
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
        const varName = argValue.identifier;
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