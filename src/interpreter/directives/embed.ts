import { DirectiveNode, MeldNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext, maybeAdjustLocation } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { readFile } from 'fs/promises';
import { dirname } from 'path';
import { extractSection, MeldLLMXMLError } from '../../converter/llmxml-utils';
import { pathService } from '../../services/path-service';

export class EmbedDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'embed';
  private embeddedPaths: Set<string>;

  constructor() {
    this.embeddedPaths = new Set();
  }

  /**
   * Clear the set of embedded paths. Used for testing.
   */
  public clearEmbeddedPaths(): void {
    this.embeddedPaths.clear();
  }

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === EmbedDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing embed directive', {
      source: data.source,
      section: data.section,
      mode: context.mode,
      location: node.location
    });

    // Validate source parameter
    if (!data.source || typeof data.source !== 'string') {
      directiveLogger.error('Embed directive missing source', {
        location: node.location,
        mode: context.mode
      });
      await throwWithContext(
        ErrorFactory.createEmbedError,
        'Embed source is required',
        node.location,
        context
      );
    }

    // Set current path for relative path resolution
    const currentPath = state.getCurrentFilePath() || context.workspaceRoot || process.cwd();
    pathService.setCurrentPath(currentPath);

    // Resolve the embed path using PathService
    const embedPath = await pathService.resolvePath(data.source);

    // Check for circular references before any file operations
    if (this.embeddedPaths.has(embedPath)) {
      directiveLogger.error('Circular reference detected', {
        source: data.source,
        path: embedPath
      });
      throw await ErrorFactory.createEmbedError(
        `Circular reference detected: ${data.source}`,
        node.location?.start
      );
    }

    // Add path to set before reading file to catch circular references
    this.embeddedPaths.add(embedPath);

    try {
      // Read the file
      let content: string;
      try {
        content = await readFile(embedPath, 'utf8');
      } catch (error) {
        if (error instanceof Error && error.message.includes('ENOENT')) {
          await throwWithContext(
            ErrorFactory.createEmbedError,
            error.message,
            node.location,
            context
          );
        }
        throw error;
      }

      // Process the content
      if (data.section) {
        try {
          // Extract section from markdown
          content = await extractSection(content, data.section, {
            fuzzyThreshold: data.fuzzyMatch ? 0.7 : 0.9
          });
        } catch (error) {
          if (error instanceof MeldLLMXMLError) {
            let message = '';
            switch (error.code) {
              case 'SECTION_NOT_FOUND':
                message = `Section "${data.section}" not found in ${data.source}${error.details?.bestMatch ? `. Did you mean "${error.details.bestMatch}"?` : ''}`;
                break;
              case 'PARSE_ERROR':
                message = 'Failed to parse markdown';
                break;
              case 'INVALID_LEVEL':
                message = `Invalid heading level in section "${data.section}" in ${data.source}`;
                break;
              case 'INVALID_SECTION_OPTIONS':
                message = `Invalid section options for "${data.section}" in ${data.source}: ${error.message}`;
                break;
              default:
                throw error;
            }
            await throwWithContext(
              ErrorFactory.createEmbedError,
              message,
              node.location,
              context
            );
          }
          throw error;
        }
      }

      // Store the content in state using resolved path
      state.setTextVar(`embed:${embedPath}`, content);

      // Create a text node with the content
      const contentNode: MeldNode = {
        type: 'Text',
        content,
        location: maybeAdjustLocation(node.location, context)
      };

      // Add node to state
      state.addNode(contentNode);

      directiveLogger.info('Embed successful', {
        source: data.source,
        path: embedPath,
        section: data.section,
        contentLength: content.length
      });
    } catch (error) {
      if (error instanceof MeldLLMXMLError) {
        directiveLogger.error('Embed failed with llmxml error', {
          source: data.source,
          section: data.section,
          errorCode: error.code,
          errorMessage: error.message,
          details: error.details
        });
        throw error;
      } else {
        directiveLogger.error('Embed failed', {
          source: data.source,
          section: data.section,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  }
}

// Export a singleton instance
export const embedDirectiveHandler = new EmbedDirectiveHandler();