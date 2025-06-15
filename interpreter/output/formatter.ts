import type { MlldNode, MlldVariable } from '@core/types';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { isTextVariable, isDataVariable, isPathVariable, isExecutableVariable, isImportVariable } from '@core/types';
import { normalizeFinalOutput } from '../utils/blank-line-normalizer';

/**
 * Output formatting options
 */
export interface FormatOptions {
  format: 'markdown' | 'xml';
  variables?: Map<string, MlldVariable>;
  normalizeBlankLines?: boolean; // Default: true
}

/**
 * Format nodes into final output.
 * This is a simplified version - we can reuse the existing OutputService later.
 */
export async function formatOutput(nodes: MlldNode[], options: FormatOptions): Promise<string> {
  if (options.format === 'xml') {
    // Build structured markdown for llmxml
    const structuredMarkdown = buildStructuredMarkdown(nodes, options);
    
    // Use llmxml to convert markdown to XML
    return await llmxmlInstance.toXML(structuredMarkdown);
  }
  
  // Default to plain markdown (just the content)
  return formatMarkdown(nodes, options);
}

/**
 * Format as markdown (concatenate text nodes)
 */
function formatMarkdown(nodes: MlldNode[], options: FormatOptions): string {
  const parts: string[] = [];
  
  // Track consecutive single newlines
  let consecutiveNewlines = 0;
  let pendingContent = '';
  
  for (const node of nodes) {
    if (node.type === 'Text') {
      // Check if this is just a single newline
      // eslint-disable-next-line mlld/no-ast-string-manipulation
      if (node.content === '\n') {
        consecutiveNewlines++;
        pendingContent += '\n';
      } else {
        // If we had pending newlines, add them
        if (pendingContent) {
          parts.push(pendingContent);
        }
        
        // Reset tracking
        consecutiveNewlines = 0;
        pendingContent = '';
        
        // Add the actual content
        // eslint-disable-next-line mlld/no-ast-string-manipulation
        parts.push(node.content);
      }
    }
  }
  
  // Handle any trailing newlines
  if (pendingContent) {
    parts.push(pendingContent);
  }
  
  let result = parts.join('');
  
  // Apply final output normalization if enabled (default: true)
  const shouldNormalize = options.normalizeBlankLines !== false;
  if (shouldNormalize) {
    result = normalizeFinalOutput(result);
  }
  
  return result;
}

/**
 * Build structured markdown for XML conversion
 */
function buildStructuredMarkdown(nodes: MlldNode[], options: FormatOptions): string {
  const parts: string[] = [];
  
  // Add document header
  parts.push('# Mlld Output');
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
 * Get string value from variable using type-safe approach
 */
function getVariableValue(variable: MlldVariable): string {
  if (isTextVariable(variable)) {
    return variable.value;
  } else if (isDataVariable(variable)) {
    return JSON.stringify(variable.value, null, 2);
  } else if (isPathVariable(variable)) {
    return variable.value.resolvedPath;
  } else if (isExecutableVariable(variable)) {
    return JSON.stringify(variable.value);
  } else if (isImportVariable(variable)) {
    return JSON.stringify(variable.value);
  } else {
    throw new Error(`Unknown variable type in formatter: ${(variable as any).type}`);
  }
}

