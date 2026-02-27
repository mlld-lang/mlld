import type { MlldNode } from '@core/types';
import type { Variable } from '@core/types/variable';
import { normalizeOutput } from './normalizer';
import { llmxmlInstance } from '@interpreter/utils/llmxml-instance';
import { jsonToXml } from '@interpreter/utils/json-to-xml';

/**
 * Output formatting options
 */
export interface FormatOptions {
  format: 'markdown' | 'xml';
  variables?: Map<string, Variable>;
  useMarkdownFormatter?: boolean; // Default: true - apply markdown normalization
  normalizeBlankLines?: boolean; // Default: true - normalize blank lines
}

/**
 * Apply output format conversion for already-materialized text output.
 */
export async function applyOutputFormatToText(
  content: string,
  format: FormatOptions['format']
): Promise<string> {
  if (format !== 'xml') {
    return content;
  }

  try {
    const parsed = JSON.parse(content);
    return jsonToXml(parsed);
  } catch {
    const converted = await llmxmlInstance.toXML(content);
    if (!converted.trimStart().startsWith('<')) {
      return `<DOCUMENT>\n${content}\n</DOCUMENT>`;
    }
    return converted;
  }
}

/**
 * Format nodes into final output.
 * This is a simplified version - we can reuse the existing OutputService later.
 */
export async function formatOutput(nodes: MlldNode[], options: FormatOptions): Promise<string> {
  const markdown = await formatMarkdownNodes(nodes, options);
  return applyOutputFormatToText(markdown, options.format);
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

  // Apply output normalization if enabled (default: true)
  const shouldNormalize = options.normalizeBlankLines !== false;
  if (shouldNormalize) {
    result = normalizeOutput(result);
  }

  return result;
}
