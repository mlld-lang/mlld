import { IParserService } from './IParserService.js';
import type { MeldNode, CodeFenceNode, TextNode } from 'meld-spec';
import { parserLogger as logger } from '@core/utils/logger.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { Location, Position } from '@core/types/index.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

// Define our own ParseError type since it's not exported from meld-ast
interface ParseError {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface MeldAstError {
  message: string;
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  toString(): string;
}

function isMeldAstError(error: unknown): error is MeldAstError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).toString === 'function'
  );
}

export class ParserService implements IParserService {
  private resolutionService?: IResolutionService;

  constructor(resolutionService?: IResolutionService) {
    this.resolutionService = resolutionService;
  }

  setResolutionService(resolutionService: IResolutionService): void {
    this.resolutionService = resolutionService;
  }

  private async parseContent(content: string, filePath?: string): Promise<MeldNode[]> {
    try {
      const { parse } = await import('meld-ast');
      const options = {
        failFast: true,
        trackLocations: true,
        validateNodes: true,
        preserveCodeFences: true,
        validateCodeFences: true,
        structuredPaths: true,
        onError: (error: unknown) => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        }
      };

      // Register the content with source mapping service if a filePath is provided
      if (filePath) {
        try {
          const { registerSource } = require('@core/utils/sourceMapUtils.js');
          registerSource(filePath, content);
          logger.debug(`Registered content for source mapping: ${filePath}`);
        } catch (err) {
          // Source mapping is optional, so just log a debug message if it fails
          logger.debug('Source mapping not available, skipping registration', { error: err });
        }
      }

      const result = await parse(content, options);
      
      // Validate code fence nesting
      this.validateCodeFences(result.ast || []);

      // Log any non-fatal errors
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        });
      }

      return result.ast || [];
    } catch (error) {
      if (isMeldAstError(error)) {
        // Create a MeldParseError with the original error information
        const parseError = new MeldParseError(
          error.message,
          error.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, filePath },
          {
            context: {
              originalError: error
            }
          }
        );
        
        // Try to enhance with source mapping information
        if (filePath) {
          try {
            const { enhanceMeldErrorWithSourceInfo } = require('@core/utils/sourceMapUtils.js');
            const enhancedError = enhanceMeldErrorWithSourceInfo(parseError);
            throw enhancedError;
          } catch (sourceMapError) {
            // If source mapping fails, just throw the original error
            throw parseError;
          }
        }
        
        throw parseError;
      }
      // For unknown errors, provide a generic message
      throw new MeldParseError(
        'Parse error: Unknown error occurred',
        { start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, filePath }
      );
    }
  }

  public async parse(content: string, filePath?: string): Promise<MeldNode[]> {
    return this.parseContent(content, filePath);
  }

  public async parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]> {
    const nodes = await this.parseContent(content, filePath);
    if (!filePath) {
      return nodes;
    }

    return nodes.map(node => {
      if (node.location) {
        // Preserve exact column numbers from original location
        return {
          ...node,
          location: {
            ...node.location,  // Preserve all original location properties
            filePath          // Only add filePath
          }
        };
      }
      return node;
    });
  }

  private isParseError(error: unknown): error is ParseError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      'location' in error &&
      typeof error.location === 'object' &&
      error.location !== null &&
      'start' in error.location &&
      'end' in error.location
    );
  }

  private validateCodeFences(nodes: MeldNode[]): void {
    // Since we're using the meld-ast parser with validateNodes=true and preserveCodeFences=true,
    // we can trust that the code fences are already valid.
    // This is just an extra validation layer to ensure code fence integrity
    for (const node of nodes) {
      if (node.type === 'CodeFence') {
        const codeFence = node as CodeFenceNode;
        const content = codeFence.content;
        
        // Skip empty code fences (should be rare but possible)
        if (!content) {
          continue;
        }
        
        // Split the content by lines
        const lines = content.split('\n');
        if (lines.length < 2) {
          throw new MeldParseError(
            'Invalid code fence: must have at least an opening and closing line',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        // Get the first line (opening fence) and count backticks
        const firstLine = lines[0];
        let openTickCount = 0;
        for (let i = 0; i < firstLine.length; i++) {
          if (firstLine[i] === '`') {
            openTickCount++;
          } else {
            break;
          }
        }
        
        // Get the last line (closing fence) and count backticks
        const lastLine = lines[lines.length - 1];
        let closeTickCount = 0;
        for (let i = 0; i < lastLine.length; i++) {
          if (lastLine[i] === '`') {
            closeTickCount++;
          } else {
            break;
          }
        }
        
        if (openTickCount === 0) {
          throw new MeldParseError(
            'Invalid code fence: missing opening backticks',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        if (closeTickCount === 0) {
          throw new MeldParseError(
            'Invalid code fence: missing closing backticks',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        if (openTickCount !== closeTickCount) {
          throw new MeldParseError(
            `Code fence must be closed with exactly ${openTickCount} backticks, got ${closeTickCount}`,
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
      }
    }
  }

  /**
   * Transform a variable node to its resolved value
   * Used for preview and transformation mode to resolve values
   * @param node The node to transform
   * @param state The state service to use for lookup
   * @returns A text node with the resolved value if transformation is enabled
   */
  async transformVariableNode(node: MeldNode, state: IStateService): Promise<MeldNode> {
    // Only transform if transformation mode is enabled
    if (!state.isTransformationEnabled()) {
      return node;
    }

    // Ensure we have a resolution service
    if (!this.resolutionService) {
      logger.warn('No resolution service available for variable transformation');
      return node;
    }

    // Create a simple resolution context
    const context: ResolutionContext = {
      state,
      currentFilePath: '/',
      strict: false,
      allowedVariableTypes: { text: true, data: true, path: true, command: false }
    };

    try {
      // Handle different node types
      switch (node.type) {
        case 'TextVar':
        case 'DataVar': {
          // Extract variable name (simplified approach without serializer)
          let variableName = '';
          if (node.type === 'TextVar' && 'name' in node) {
            variableName = `\${${(node as any).name}}`;
          } else if (node.type === 'DataVar' && 'name' in node) {
            variableName = `\${{${(node as any).name}}}`;
          }
          
          if (!variableName) {
            return node;
          }
          
          // Resolve the variable reference
          const resolved = await this.resolutionService.resolveInContext(variableName, context);
          
          // Create a new Text node with the resolved value
          const textNode: TextNode = {
            type: 'Text',
            content: resolved || ''
          };
          
          // Copy location if available
          if (node.location) {
            textNode.location = node.location;
          }
          
          return textNode;
        }
        default:
          return node;
      }
    } catch (error) {
      logger.error('Error transforming variable node:', { error });
      return node;
    }
  }
} 