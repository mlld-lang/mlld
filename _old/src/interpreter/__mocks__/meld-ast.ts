import type { MeldNode, TextNode } from 'meld-spec';

export const parse = (content: string): MeldNode[] => {
  if (content === 'invalid') {
    throw new Error('Failed to parse Meld content: Parse error');
  }
  if (content.startsWith('>>')) {
    return [{
      type: 'Text' as const,
      content: content.substring(2).trim()
    } as TextNode];
  }
  return [{
    type: 'Text' as const,
    content
  } as TextNode];
};

export const parseMeldContent = (content: string): MeldNode[] => {
  return parse(content);
}; 