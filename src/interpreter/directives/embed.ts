import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { extractSection, MeldLLMXMLError } from '../../converter/llmxml-utils';

export class EmbedDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'embed';

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
      throwWithContext(
        ErrorFactory.createEmbedError,
        'Embed source is required',
        node.location,
        context
      );
    }

    try {
      // Resolve the embed path
      const currentPath = state.getCurrentFilePath() || context.workspaceRoot || process.cwd();
      const embedPath = resolve(dirname(currentPath), data.source);

      // Read the file
      let content: string;
      try {
        content = await readFile(embedPath, 'utf8');
      } catch (error) {
        if (error instanceof Error && error.message.includes('ENOENT')) {
          throwWithContext(
            ErrorFactory.createEmbedError,
            error.message,
            node.location,
            context
          );
        }
        throw error;
      }

      // Extract section if specified
      let finalContent = content;
      if (data.section) {
        try {
          finalContent = await extractSection(content, data.section, {
            fuzzyThreshold: data.fuzzyMatch ? 0.5 : 0.8,
            includeNested: data.includeNested !== false
          });
          directiveLogger.info('Section extraction successful', {
            source: data.source,
            section: data.section,
            contentLength: finalContent.length
          });
        } catch (error) {
          if (error instanceof MeldLLMXMLError && error.code === 'SECTION_NOT_FOUND') {
            directiveLogger.error('Section not found in file', {
              source: data.source,
              section: data.section,
              error: error.message
            });
            throwWithContext(
              ErrorFactory.createEmbedError,
              `Section "${data.section}" not found`,
              node.location,
              context
            );
          }
          throw error;
        }
      }

      directiveLogger.info('Embed successful', {
        source: data.source,
        path: embedPath,
        section: data.section,
        contentLength: finalContent.length
      });

      // Store the embedded content in state
      state.setTextVar(`embed:${data.source}`, finalContent);
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
        throwWithContext(
          ErrorFactory.createEmbedError,
          error instanceof Error ? error.message : String(error),
          node.location,
          context
        );
      }
    }
  }
}

// Export a singleton instance
export const embedDirectiveHandler = new EmbedDirectiveHandler();