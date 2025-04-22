import { injectable, inject } from 'tsyringe';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, CommentNode } from '@core/syntax/types.js';

/**
 * Handles resolution of raw content (text, code blocks, comments)
 * Preserves original document formatting while skipping comments and directives
 */
@injectable()
export class ContentResolver {
  constructor(@inject('IStateService') private stateService: IStateService) {}

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
          // For code fences, directly use the content from the node
          // meld-ast handles all code fence formatting
          resolvedParts.push((node as CodeFenceNode).content);
          break;
      }
    }

    // Join parts without adding any additional whitespace
    return resolvedParts
      .filter(part => part !== undefined)
      .join('');
  }
} 