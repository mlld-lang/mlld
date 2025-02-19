import { IStateService } from '@services/StateService/IStateService.js';
import { ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, CommentNode } from 'meld-spec';

/**
 * Handles resolution of raw content (text, code blocks, comments)
 * Preserves formatting of text and code blocks while skipping comments
 */
export class ContentResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve content nodes, preserving formatting but skipping comments
   */
  async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    const resolvedParts: string[] = [];
    let lastNodeType: string | null = null;

    for (const node of nodes) {
      // Skip comments and directives
      if (node.type === 'Comment' || node.type === 'Directive') {
        continue;
      }

      // Add spacing between different node types
      if (lastNodeType && lastNodeType !== node.type) {
        resolvedParts.push('');
      }

      switch (node.type) {
        case 'Text':
          // Regular text - output as is
          resolvedParts.push((node as TextNode).content);
          break;

        case 'CodeFence':
          // Code fence - preserve backticks, language and content exactly
          const codeFence = node as CodeFenceNode;
          const fence = '```' + (codeFence.language || '');
          resolvedParts.push(fence);
          resolvedParts.push(codeFence.content);
          resolvedParts.push('```');
          break;
      }

      lastNodeType = node.type;
    }

    // Join with single newlines, trimming any extra whitespace
    return resolvedParts
      .filter(part => part !== undefined)
      .join('\n')
      .trim();
  }
} 