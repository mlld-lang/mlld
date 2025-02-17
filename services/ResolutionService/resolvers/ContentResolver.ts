import { IStateService } from '@services/StateService/IStateService.js';
import { ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeBlockNode, CommentNode } from 'meld-spec';

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

    for (const node of nodes) {
      switch (node.type) {
        case 'Text':
          // Regular text - output as is
          resolvedParts.push((node as TextNode).content);
          break;

        case 'CodeBlock':
          // Code block - preserve backticks and content exactly
          const codeNode = node as CodeBlockNode;
          resolvedParts.push(`\`${codeNode.content}\``);
          break;

        case 'Comment':
          // Skip comments entirely
          break;

        default:
          // Skip other node types (directives etc)
          break;
      }
    }

    return resolvedParts.join('');
  }
} 