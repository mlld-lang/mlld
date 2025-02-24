import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, CommentNode } from 'meld-spec';

/**
 * Handles resolution of raw content (text, code blocks, comments)
 * Preserves original document formatting while skipping comments and directives
 */
export class ContentResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve content nodes, preserving original formatting but skipping comments and directives
   */
  async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    const resolvedParts: string[] = [];

    for (const node of nodes) {
      // Skip comments and directives
      if (node.type === 'Comment' || node.type === 'Directive') {
        continue;
      }

      switch (node.type) {
        case 'Text':
          // Regular text - output as is
          resolvedParts.push((node as TextNode).content);
          break;

        case 'CodeFence':
          // Code fence - preserve backticks, language and content exactly
          const codeFence = node as CodeFenceNode;
          // Extract backtick count from content
          const backtickMatch = codeFence.content.match(/^(`+)/);
          const backticks = backtickMatch ? backtickMatch[1] : '```';
          const fence = backticks + (codeFence.language || '');
          resolvedParts.push(`${fence}\n${codeFence.content.split('\n').slice(1, -1).join('\n')}\n${backticks}`);
          break;
      }
    }

    // Join parts without adding any additional whitespace
    return resolvedParts
      .filter(part => part !== undefined)
      .join('');
  }
} 