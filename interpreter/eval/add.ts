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
        value = variable.value.resolvedPath;
        break;
      default:
        value = (variable as any).value;
    }
    
    // Handle field access if present in the variable node
    if (variableNode.fields && variableNode.fields.length > 0 && variable.type === 'data') {
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
    content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    
  } else if (directive.subtype === 'addPath') {
    // Handle path inclusion, potentially with section extraction
    const pathNodes = directive.values?.path;
    if (!pathNodes) {
      throw new Error('Add path directive missing path');
    }
    
    // Resolve the path (which might include section specifier)
    const pathWithSection = await interpolate(pathNodes, env);
    
    // Check if path includes section specifier (e.g., "file.md # Section Title")
    const sectionMatch = pathWithSection.match(/^(.+?)\s*#\s*(.+)$/);
    
    if (sectionMatch) {
      // Extract file path and section title
      const filePath = sectionMatch[1].trim();
      const sectionTitle = sectionMatch[2].trim();
      
      // Read the file content
      const fileContent = await env.readFile(filePath);
      
      // Extract the section using llmxml
      const llmxml = createLLMXML();
      try {
        content = await llmxml.getSection(fileContent, sectionTitle, {
          includeNested: true
        });
        // Compact blank lines and trim
        content = compactBlankLines(content).trimEnd();
      } catch (error) {
        // Fallback to basic extraction if llmxml fails
        content = extractSection(fileContent, sectionTitle);
      }
    } else {
      // No section specified, read entire file
      content = await env.readFile(pathWithSection);
    }
    
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
    
  } else {
    throw new Error(`Unsupported add subtype: ${directive.subtype}`);
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