import { IParserService } from './IParserService.js';
import type { MeldNode, CodeFenceNode, TextNode } from 'meld-spec';
import { parserLogger as logger } from '@core/utils/logger.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { Location, Position } from '@core/types/index.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { container } from 'tsyringe';
import { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';

// Define our own ParseError type since it's not exported from meld-ast
interface ParseError {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface MeldAstError extends Error {
  message: string;
  name: string;
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
    'name' in error &&
    typeof (error as any).toString === 'function'
  );
}

@injectable()
@Service({
  description: 'Service responsible for parsing Meld syntax into AST nodes'
})
export class ParserService implements IParserService {
  private resolutionClient?: IResolutionServiceClient;
  private resolutionClientFactory?: ResolutionServiceClientFactory;
  private factoryInitialized: boolean = false;

  /**
   * Creates a new instance of the ParserService
   */
  constructor() {
    // We'll initialize the factory lazily to avoid circular dependencies
    if (process.env.DEBUG === 'true') {
      console.log('ParserService: Initialized');
    }
  }

  /**
   * Lazily initialize the ResolutionServiceClient factory
   * This is called only when needed to avoid circular dependencies
   */
  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    try {
      this.resolutionClientFactory = container.resolve('ResolutionServiceClientFactory');
      this.initializeResolutionClient();
    } catch (error) {
      // Factory not available
      logger.debug('ResolutionServiceClientFactory not available');
    }
  }

  /**
   * Initialize the ResolutionServiceClient using the factory
   */
  private initializeResolutionClient(): void {
    if (!this.resolutionClientFactory) {
      return;
    }
    
    try {
      this.resolutionClient = this.resolutionClientFactory.createClient();
      logger.debug('Successfully created ResolutionServiceClient using factory');
    } catch (error) {
      logger.warn('Failed to create ResolutionServiceClient', { error });
      this.resolutionClient = undefined;
    }
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
            // Don't log warnings directly - we'll handle them through the error display service
            logger.debug('Parse warning detected', { errorMessage: error.toString() });
          }
        });
      }

      return result.ast || [];
    } catch (error) {
      if (isMeldAstError(error)) {
        // Create a MeldParseError with the original error information
        const errorLocation = error.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
        
        // Always use the provided filePath if we have one, don't rely on what's in the error
        const actualFilePath = filePath;
        const locationWithPath = {
          ...errorLocation,
          filePath: actualFilePath
        };
        
        const parseError = new MeldParseError(
          error.message,
          locationWithPath,
          {
            filePath: actualFilePath, // Directly set filePath in the error options
            cause: isMeldAstError(error) ? error : undefined, // Set the original error as the cause only if it's a proper Error
            context: {
              originalError: error,
              sourceLocation: {
                filePath: actualFilePath,
                line: errorLocation.start.line,
                column: errorLocation.start.column
              },
              location: locationWithPath,
              // Add the file path in the context for the error display service to use
              errorFilePath: actualFilePath
            }
          }
        );
        
        // Try to enhance with source mapping information
        if (filePath) {
          try {
            const { enhanceMeldErrorWithSourceInfo } = require('@core/utils/sourceMapUtils.js');
            const enhancedError = enhanceMeldErrorWithSourceInfo(parseError);
            
            logger.debug('Enhanced parse error with source mapping', {
              original: parseError.message,
              enhanced: enhancedError.message,
              sourceLocation: enhancedError.context?.sourceLocation
            });
            
            throw enhancedError;
          } catch (enhancementError) {
            // If enhancement fails, throw the original error
            logger.debug('Failed to enhance parse error with source mapping', {
              error: enhancementError
            });
            
            throw parseError;
          }
        }
        
        throw parseError;
      }
      
      // For unknown errors, provide a generic message with proper location information
      const actualFilePath = filePath;
      const locationWithPath = { 
        start: { line: 1, column: 1 }, 
        end: { line: 1, column: 1 }, 
        filePath: actualFilePath
      };
      
      const genericError = new MeldParseError(
        'Parse error: Unknown error occurred',
        locationWithPath,
        {
          filePath: actualFilePath, // Directly set filePath in the error options
          cause: isMeldAstError(error) ? error : undefined, // Set the original error as the cause only if it's a proper Error
          context: {
            originalError: error,
            sourceLocation: {
              filePath: actualFilePath,
              line: 1,
              column: 1
            },
            location: locationWithPath,
            // Add the file path in the context for the error display service to use
            errorFilePath: actualFilePath
          }
        }
      );
      
      // Try to enhance with source mapping information
      if (filePath) {
        try {
          const { enhanceMeldErrorWithSourceInfo } = require('@core/utils/sourceMapUtils.js');
          throw enhanceMeldErrorWithSourceInfo(genericError);
        } catch (enhancementError) {
          // If enhancement fails, throw the original error
          throw genericError;
        }
      }
      
      throw genericError;
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
   * Transforms a variable node into a text node with the resolved value
   * @param node The variable node to transform
   * @param state The state service to use for lookup
   * @returns A text node with the resolved value if transformation is enabled
   */
  async transformVariableNode(node: MeldNode, state: IStateService): Promise<MeldNode> {
    // Only transform if transformation mode is enabled
    if (!state.isTransformationEnabled()) {
      return node;
    }

    // Create a simple resolution context
    const context: ResolutionContext = {
      state,
      currentFilePath: '/',
      options: {
        strict: false,
        allowUndefined: true
      }
    };

    try {
      // Ensure factory is initialized before trying to use it
      this.ensureFactoryInitialized();
      
      // Try to use the resolution client if available
      if (this.resolutionClient) {
        try {
          const result = await this.resolutionClient.resolveVariableReference(node, {
            context,
            allowUndefined: true
          });
          
          // Create a text node with the resolved value
          return {
            type: 'text',
            value: String(result),
            location: node.location
          };
        } catch (error) {
          logger.warn('Error using resolutionClient.resolveVariableReference', { 
            error, 
            node 
          });
        }
      }
      
      // If we get here, we couldn't resolve the variable
      logger.warn('No resolution client available for variable transformation');
      return node;
    } catch (error) {
      logger.warn('Failed to transform variable node', { error, node });
      return node;
    }
  }
} 