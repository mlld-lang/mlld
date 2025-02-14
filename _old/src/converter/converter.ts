import type { MeldNode } from 'meld-spec';

/**
 * Convert Meld nodes to XML format
 */
export function toXml(nodes: MeldNode[]): string {
  return nodes
    .map(node => {
      switch (node.type) {
        case 'Text':
          return node.content;
        case 'CodeFence':
          return `<code language="${node.language || ''}">${node.content}</code>`;
        case 'Directive':
          return `<directive kind="${node.directive.kind}"></directive>`;
        default:
          return '';
      }
    })
    .join('\n');
}

/**
 * Convert Meld nodes to Markdown format
 */
export function toMarkdown(nodes: MeldNode[]): string {
  return nodes
    .map(node => {
      switch (node.type) {
        case 'Text':
          return node.content;
        case 'CodeFence':
          return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\``;
        case 'Directive':
          return `@${node.directive.kind}`;
        default:
          return '';
      }
    })
    .join('\n');
} 