import type { MeldNode, MeldVariable } from '@core/types';
import { createLLMXML } from 'llmxml';

/**
 * Output formatting options
 */
export interface FormatOptions {
  format: 'markdown' | 'xml';
  variables?: Map<string, MeldVariable>;
}

/**
 * Format nodes into final output.
 * This is a simplified version - we can reuse the existing OutputService later.
 */
export async function formatOutput(nodes: MeldNode[], options: FormatOptions): Promise<string> {
  if (options.format === 'xml') {
    // Build structured markdown for llmxml
    const structuredMarkdown = buildStructuredMarkdown(nodes, options);
    
    // Use llmxml to convert markdown to XML
    const llmxml = createLLMXML({
      includeTitle: false,  // No redundant title attributes
      includeHlevel: false, // No need for heading levels either
      tagFormat: 'SCREAMING_SNAKE', // Maximum clarity!
      verbose: false,
      warningLevel: 'none' // Suppress llmxml logging
    });
    
    return await llmxml.toXML(structuredMarkdown);
  }
  
  // Default to plain markdown (just the content)
  return formatMarkdown(nodes, options);
}

/**
 * Format as markdown (concatenate text nodes)
 */
function formatMarkdown(nodes: MeldNode[], options: FormatOptions): string {
  const parts: string[] = [];
  
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(node.content);
    }
    // Directives should have already been evaluated and replaced with their output
    // We only output Text nodes in the final result
  }
  
  return parts.join('');
}

/**
 * Build structured markdown for XML conversion
 */
function buildStructuredMarkdown(nodes: MeldNode[], options: FormatOptions): string {
  const parts: string[] = [];
  
  // Add document header
  parts.push('# Meld Output');
  parts.push('');
  
  // Add variables section if we have any
  if (options.variables && options.variables.size > 0) {
    parts.push('## Variables');
    parts.push('');
    
    for (const [name, variable] of options.variables) {
      const value = getVariableValue(variable);
      parts.push(`### ${name}`);
      parts.push(`- **Type**: ${variable.type}`);
      parts.push(`- **Value**: ${value}`);
      parts.push('');
    }
  }
  
  // Add content section
  const content = formatMarkdown(nodes, options);
  if (content.trim()) {
    parts.push('## Content');
    parts.push('');
    parts.push(content);
  }
  
  return parts.join('\n');
}

/**
 * Get string value from variable
 */
function getVariableValue(variable: MeldVariable): string {
  switch (variable.type) {
    case 'text':
      return variable.value;
    case 'data':
      return JSON.stringify(variable.value, null, 2);
    case 'path':
      return variable.value.resolvedPath;
    case 'command':
      return JSON.stringify(variable.value);
    default:
      return String((variable as any).value);
  }
}

