import type { MlldNode, MlldVariable } from '@core/types';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { isTextVariable, isDataVariable, isPathVariable, isExecutableVariable, isImportVariable } from '@core/types';
import { formatMarkdown } from '../utils/markdown-formatter';
import { normalizeOutputBlankLines } from '../utils/blank-line-normalizer';

/**
 * Output formatting options
 */
export interface FormatOptions {
  format: 'markdown' | 'xml';
  variables?: Map<string, MlldVariable>;
  useMarkdownFormatter?: boolean; // Default: false - use prettier for formatting
  normalizeBlankLines?: boolean; // Default: true - normalize blank lines
}

/**
 * Format nodes into final output.
 * This is a simplified version - we can reuse the existing OutputService later.
 */
export async function formatOutput(nodes: MlldNode[], options: FormatOptions): Promise<string> {
  if (options.format === 'xml') {
    // Build structured markdown for llmxml
    const structuredMarkdown = await buildStructuredMarkdown(nodes, options);
    
    // Use llmxml to convert markdown to XML
    return await llmxmlInstance.toXML(structuredMarkdown);
  }
  
  // Default to plain markdown (just the content)
  return formatMarkdownNodes(nodes, options);
}

/**
 * Format as markdown (process all node types)
 */
async function formatMarkdownNodes(nodes: MlldNode[], options: FormatOptions): Promise<string> {
  const parts: string[] = [];
  
  for (const node of nodes) {
    switch (node.type) {
      case 'Text':
        // eslint-disable-next-line mlld/no-ast-string-manipulation
        parts.push(node.content);
        break;
      case 'Newline':
        parts.push('\n');
        break;
      case 'CodeFence':
        // Reconstruct code fence with proper formatting
        const fence = '```';
        const lang = (node as any).language || '';
        const content = (node as any).content || '';
        parts.push(`${fence}${lang}\n${content}\n${fence}`);
        break;
      // Other node types can be added as needed
    }
  }
  
  let result = parts.join('');
  
  // Use prettier for formatting if enabled (default: false for now)
  const useFormatter = options.useMarkdownFormatter === true;
  if (useFormatter) {
    result = await formatMarkdown(result);
  } else {
    // Apply the original normalization when not using prettier
    // Apply final output normalization if enabled (default: true)
    const shouldNormalize = options.normalizeBlankLines !== false;
    if (shouldNormalize) {
      // Trim leading and trailing whitespace
      result = result.trim();
      // Normalize multiple blank lines to max 2 newlines (1 blank line)
      result = normalizeOutputBlankLines(result);
      // Ensure single trailing newline if there's content
      if (result.length > 0) {
        result += '\n';
      }
    }
  }
  
  return result;
}

/**
 * Build structured markdown for XML conversion
 */
async function buildStructuredMarkdown(nodes: MlldNode[], options: FormatOptions): Promise<string> {
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
  const content = await formatMarkdownNodes(nodes, options);
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

