import { MeldNode } from 'meld-spec';
import { InterpreterState } from '../interpreter/state/state.js';

export type OutputFormat = 'llm' | 'md';

/**
 * Converts a node to LLM format
 */
function nodeToLLM(node: MeldNode): string {
  switch (node.type) {
    case 'Text':
      return `<paragraph>${node.content}</paragraph>`;
    case 'Heading':
      return `<heading level="${node.level}">${node.content}</heading>`;
    case 'CodeFence':
      return `<code language="${node.language}">${node.content}</code>`;
    case 'Comment':
      return `<comment>${node.content}</comment>`;
    default:
      return '';
  }
}

/**
 * Converts a node to Markdown format
 */
function nodeToMarkdown(node: MeldNode): string {
  switch (node.type) {
    case 'Text':
      return node.content;
    case 'Heading':
      return `${'#'.repeat(node.level)} ${node.content}`;
    case 'CodeFence':
      return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\``;
    case 'Comment':
      return `<!-- ${node.content} -->`;
    default:
      return '';
  }
}

/**
 * Converts interpreter state to the specified output format
 */
export function convertToFormat(state: InterpreterState, format: OutputFormat = 'llm'): string {
  const nodes = state.getNodes();
  
  if (nodes.length === 0) {
    return format === 'llm' ? '<content></content>' : '';
  }

  const nodeStrings = nodes.map(node => {
    return format === 'llm' ? nodeToLLM(node) : nodeToMarkdown(node);
  });

  if (format === 'llm') {
    return `<content>\n${nodeStrings.join('\n')}\n</content>`;
  }

  return nodeStrings.join('\n\n');
} 