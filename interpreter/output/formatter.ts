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
 * Format as markdown (concatenate text nodes and preserve directives)
 */
function formatMarkdown(nodes: MeldNode[], options: FormatOptions): string {
  const parts: string[] = [];
  
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(node.content);
    } else if (node.type === 'Directive') {
      // Reconstruct the directive syntax
      parts.push(reconstructDirective(node));
    }
  }
  
  return parts.join('');
}

/**
 * Reconstruct directive syntax from AST node
 */
function reconstructDirective(directive: any): string {
  // For exec directives, reconstruct the original syntax
  if (directive.kind === 'exec') {
    const identifier = directive.raw?.identifier || '';
    
    if (directive.subtype === 'execCommand') {
      // Get parameter list
      const params = directive.values?.params || [];
      const paramList = params
        .map((p: any) => p.identifier || '')
        .filter(Boolean)
        .join(', ');
      
      // Get command
      const command = directive.values?.command
        ?.map((n: any) => {
          if (n.type === 'Text') {
            return n.content || '';
          } else if (n.type === 'VariableReference') {
            return `@${n.identifier}`;
          }
          return '';
        })
        .join('');
      
      if (paramList) {
        return `@exec ${identifier} (${paramList}) = @run [${command}]`;
      } else {
        return `@exec ${identifier} = ${command}`;
      }
    } else if (directive.subtype === 'execCode') {
      // Get parameter list
      const params = directive.values?.params || [];
      const paramList = params
        .map((p: any) => p.identifier || '')
        .filter(Boolean)
        .join(', ');
      
      const language = directive.raw?.language || 'javascript';
      const code = directive.values?.code
        ?.map((n: any) => n.content || '')
        .join('');
      
      if (paramList) {
        return `@exec ${identifier} (${paramList}) = @run ${language} [${code}]`;
      } else {
        return `@exec ${identifier} = @run ${language} [${code}]`;
      }
    }
  }
  
  // For other directives, return empty for now
  return '';
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