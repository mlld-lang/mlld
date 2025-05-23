import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';

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
    const varRef = directive.raw?.variable;
    if (!varRef) {
      throw new Error('Add variable directive missing variable reference');
    }
    
    // Remove @ prefix if present
    const varName = varRef.startsWith('@') ? varRef.slice(1) : varRef;
    
    // Get variable from environment
    const variable = env.getVariable(varName);
    if (!variable) {
      throw new Error(`Variable not found: ${varName}`);
    }
    
    // Get the content based on variable type
    switch (variable.type) {
      case 'text':
        content = variable.value;
        break;
      case 'data':
        content = JSON.stringify(variable.value, null, 2);
        break;
      case 'path':
        content = variable.value.resolvedPath;
        break;
      default:
        content = String((variable as any).value);
    }
    
  } else if (directive.subtype === 'addPath') {
    // Handle path inclusion
    const pathNodes = directive.values?.path;
    if (!pathNodes) {
      throw new Error('Add path directive missing path');
    }
    
    // Resolve the path
    const resolvedPath = await interpolate(pathNodes, env);
    
    // Read the file content
    content = await env.readFile(resolvedPath);
    
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

/**
 * Extract a section from markdown content.
 * Sections are defined by headers (e.g., ## Section Name)
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