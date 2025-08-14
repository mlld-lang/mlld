import type { MlldNode } from '@core/types';
import type { Variable } from '@core/types/variable';
import { formatMarkdown } from '../utils/markdown-formatter';
import { normalizeOutputBlankLines } from '../utils/blank-line-normalizer';

/**
 * Output formatting options
 */
export interface FormatOptions {
  format: 'markdown' | 'xml';
  variables?: Map<string, Variable>;
  useMarkdownFormatter?: boolean; // Default: true - use prettier for formatting
  normalizeBlankLines?: boolean; // Default: true - normalize blank lines
}

/**
 * Format nodes into final output.
 * This is a simplified version - we can reuse the existing OutputService later.
 */
export async function formatOutput(nodes: MlldNode[], options: FormatOptions): Promise<string> {
  // XML format will be redesigned - for now just return markdown
  // The @xml transformer in mlld will handle XML conversion
  
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
  
  // Use prettier for formatting if enabled (default: true)
  const useFormatter = options.useMarkdownFormatter !== false;
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

// XML formatting functions removed - will be redesigned
// The @xml transformer in mlld will handle XML conversion

