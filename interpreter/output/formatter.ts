import type { MeldNode, MeldVariable } from '@core/types';

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
export function formatOutput(nodes: MeldNode[], options: FormatOptions): string {
  if (options.format === 'xml') {
    return formatXml(nodes, options);
  }
  
  // Default to markdown
  return formatMarkdown(nodes, options);
}

/**
 * Format as markdown (really just concatenate text nodes)
 */
function formatMarkdown(nodes: MeldNode[], options: FormatOptions): string {
  const parts: string[] = [];
  
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(node.content);
    }
  }
  
  return parts.join('');
}

/**
 * Format as XML
 */
function formatXml(nodes: MeldNode[], options: FormatOptions): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  parts.push('<meld>');
  
  // Add variables section if we have any
  if (options.variables && options.variables.size > 0) {
    parts.push('  <variables>');
    for (const [name, variable] of options.variables) {
      parts.push(`    <variable name="${escapeXml(name)}" type="${variable.type}">`);
      parts.push(`      ${escapeXml(getVariableValue(variable))}`);
      parts.push('    </variable>');
    }
    parts.push('  </variables>');
  }
  
  // Add content
  parts.push('  <content>');
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(`    ${escapeXml(node.content)}`);
    }
  }
  parts.push('  </content>');
  
  parts.push('</meld>');
  
  return parts.join('\\n');
}

/**
 * Get string value from variable
 */
function getVariableValue(variable: MeldVariable): string {
  switch (variable.type) {
    case 'text':
      return variable.value;
    case 'data':
      return JSON.stringify(variable.value);
    case 'path':
      return variable.value.resolvedPath;
    case 'command':
      return JSON.stringify(variable.value);
    default:
      return String((variable as any).value);
  }
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}